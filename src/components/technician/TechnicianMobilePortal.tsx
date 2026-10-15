import React, { useState, useEffect, useCallback } from 'react';
import { LITIGE_REASONS, LitigeReasonCode } from '../../types';
import {
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Phone,
  Send,
  Check,
  Ruler,
  Cpu,
  AlertCircle,
} from 'lucide-react';

// Technician portal: no account, the secret activation token (?act=…) is the credential.
// All reads and writes go through /api/portal, which only exposes this technician's open tickets.
interface PortalTicket {
  id: string;
  ticketNumber: string;
  clientName: string;
  clientNumber: string;
  clientPhone: string;
  clientAddress: string;
  rawZoneText: string;
  currentStatus: string;
}

interface TechnicianMobilePortalProps {
  activationToken: string;
  onExitPortal?: () => void;
}

const REFRESH_MS = 20000;

export const TechnicianMobilePortal: React.FC<TechnicianMobilePortalProps> = ({
  activationToken,
  onExitPortal,
}) => {
  const [loadState, setLoadState] = useState<'LOADING' | 'OK' | 'INVALID' | 'SUSPENDED' | 'OFFLINE'>('LOADING');
  const [tech, setTech] = useState<{ fullName: string } | null>(null);
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<PortalTicket | null>(null);
  const [actionType, setActionType] = useState<'NONE' | 'NF' | 'LITIGE'>('NONE');

  // NF form
  const [cableLength, setCableLength] = useState<number>(45);
  const [ontSerial, setOntSerial] = useState<string>('');
  const [nfNotes, setNfNotes] = useState<string>('');

  // Litige form
  const [litigeReason, setLitigeReason] = useState<LitigeReasonCode>('CLIENT_UNREACHABLE');
  const [litigeNotes, setLitigeNotes] = useState<string>('');
  const [rdvDateTime, setRdvDateTime] = useState<string>('');

  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal?token=${encodeURIComponent(activationToken)}`);
      if (res.status === 404) return setLoadState('INVALID');
      if (!res.ok) return setLoadState(prev => (prev === 'OK' ? 'OK' : 'OFFLINE'));
      const data = await res.json();
      setTech(data.technician);
      setTickets(data.tickets);
      setLoadState(data.suspended ? 'SUSPENDED' : 'OK');
    } catch {
      setLoadState(prev => (prev === 'OK' ? 'OK' : 'OFFLINE'));
    }
  }, [activationToken]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const flash = (type: 'success' | 'error', text: string) => {
    setNotificationMsg({ type, text });
    setTimeout(() => setNotificationMsg(null), 5000);
  };

  const submitReport = async (report: Record<string, unknown>, successText: string) => {
    if (!activeTicket) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: activationToken, ticketId: activeTicket.id, report }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash('error', data.error || 'Envoi impossible, réessayez.');
        return;
      }
      setActionType('NONE');
      setActiveTicket(null);
      flash('success', successText);
      load();
    } catch {
      flash('error', 'Pas de connexion Internet. Réessayez dans un instant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadState === 'LOADING') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
        Chargement de vos interventions…
      </div>
    );
  }

  if (loadState === 'INVALID' || loadState === 'OFFLINE' || !tech) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold">
          {loadState === 'OFFLINE' ? 'Connexion impossible' : 'Lien Technicien Invalide ou Expiré'}
        </h1>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          {loadState === 'OFFLINE'
            ? 'Vérifiez votre connexion Internet puis rechargez la page.'
            : 'Le lien que vous avez utilisé n\'est plus actif. Contactez votre superviseur 3GCOM pour recevoir un nouveau lien.'}
        </p>
        {onExitPortal && (
          <button
            onClick={onExitPortal}
            className="mt-6 px-4 py-2 bg-slate-800 text-slate-200 text-xs rounded-xl hover:bg-slate-700"
          >
            Retour à l'accueil
          </button>
        )}
      </div>
    );
  }

  if (loadState === 'SUSPENDED') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold">Accès Suspendu</h1>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          Bonjour {tech.fullName}, votre accès a été temporairement suspendu par votre superviseur 3GCOM.
        </p>
        {onExitPortal && (
          <button
            onClick={onExitPortal}
            className="mt-6 px-4 py-2 bg-slate-800 text-slate-200 text-xs rounded-xl hover:bg-slate-700"
          >
            Retour
          </button>
        )}
      </div>
    );
  }

  const handleCloseNF = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    submitReport(
      {
        kind: 'NF',
        nfType: 'STANDARD',
        ontSerialNumber: ontSerial.trim().toUpperCase(),
        cableLengthMeters: Number(cableLength) || undefined,
        notes: nfNotes.trim() || undefined,
      },
      `Ticket ${activeTicket.ticketNumber} clôturé NF. L'orienteur a reçu la confirmation en direct.`
    );
  };

  const handleReportLitige = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    submitReport(
      {
        kind: 'LITIGE',
        reasonCode: litigeReason,
        rdvDateTime: litigeReason === 'RDV' ? rdvDateTime : undefined,
        notes: litigeNotes.trim(),
      },
      `Litige signalé pour le ticket ${activeTicket.ticketNumber}. L'orienteur est immédiatement alerté.`
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Mobile Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-md">
            3G
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>{tech.fullName}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Technicien 3GCOM · Fibre Optique
            </p>
          </div>
        </div>

        {onExitPortal && (
          <button
            onClick={onExitPortal}
            className="text-[11px] font-medium text-slate-400 hover:text-white px-2.5 py-1 bg-slate-800 rounded-lg border border-slate-700"
          >
            Déconnexion
          </button>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {notificationMsg && (
          <div
            className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md ${
              notificationMsg.type === 'success'
                ? 'bg-emerald-950/80 border border-emerald-700/80 text-emerald-200'
                : 'bg-rose-950/80 border border-rose-700/80 text-rose-200'
            }`}
          >
            {notificationMsg.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{notificationMsg.text}</span>
          </div>
        )}

        {/* Action Modal / Screen: NF (Raccordé) */}
        {actionType === 'NF' && activeTicket && (
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Clôture NF · Ticket {activeTicket.ticketNumber}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionType('NONE')}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                Annuler
              </button>
            </div>

            <form onSubmit={handleCloseNF} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Métrage Câble Fibre utilisé (mètres) *</span>
                </label>
                <input
                  type="number"
                  min="5"
                  max="500"
                  required
                  value={cableLength}
                  onChange={e => setCableLength(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Numéro de Série ONT (SN ONT) *</span>
                </label>
                <input
                  type="text"
                  required
                  value={ontSerial}
                  onChange={e => setOntSerial(e.target.value.toUpperCase())}
                  placeholder="ex: ALCLB123456"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Observations / Puissance optique
                </label>
                <textarea
                  rows={2}
                  value={nfNotes}
                  onChange={e => setNfNotes(e.target.value)}
                  placeholder="ex: Raccordement effectué, puissance -19 dBm, connexion OK"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'Validation en cours...' : 'Confirmer Clôture Raccordé (NF)'}</span>
              </button>
            </form>
          </div>
        )}

        {/* Action Modal / Screen: Litige */}
        {actionType === 'LITIGE' && activeTicket && (
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span>Signaler un Litige · {activeTicket.ticketNumber}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionType('NONE')}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                Annuler
              </button>
            </div>

            <form onSubmit={handleReportLitige} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Motif de Blocage Terrain *
                </label>
                <select
                  required
                  value={litigeReason}
                  onChange={e => setLitigeReason(e.target.value as LitigeReasonCode)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                >
                  {LITIGE_REASONS.map(r => (
                    <option key={r.code} value={r.code}>
                      {r.label} ({r.category === 'TECHNICAL' ? 'Cause Technique' : 'Cause Externe'})
                    </option>
                  ))}
                </select>
              </div>

              {litigeReason === 'RDV' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Date et heure du RDV *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={rdvDateTime}
                    onChange={e => setRdvDateTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Détails du problème constaté *
                </label>
                <textarea
                  rows={3}
                  required
                  value={litigeNotes}
                  onChange={e => setLitigeNotes(e.target.value)}
                  placeholder="ex: Client injoignable après 3 tentatives, porte fermée."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Envoi du litige...' : 'Transmettre le Litige à l\'Orienteur'}</span>
              </button>
            </form>
          </div>
        )}

        {/* Tickets List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Interventions Affectées ({tickets.length})
            </h2>
            <span className="text-[11px] text-emerald-400 font-mono">
              Actualisé automatiquement
            </span>
          </div>

          {tickets.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto" />
              <h3 className="text-sm font-bold text-white">Aucune intervention en cours</h3>
              <p className="text-xs text-slate-400">
                Vous n'avez pas de ticket à traiter pour le moment. Dès que l'orienteur vous affecte un dossier, il apparaîtra ici instantanément.
              </p>
            </div>
          ) : (
            tickets.map(ticket => (
              <div
                key={ticket.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 space-y-3 shadow-md transition-all"
              >
                {/* Header Ticket */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div>
                    <span className="font-mono font-bold text-sm text-white">
                      {ticket.ticketNumber}
                    </span>
                    <span className="text-[11px] text-slate-400 block font-mono">
                      Abonné : {ticket.clientNumber}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-950 text-sky-400 border border-sky-800">
                    {ticket.currentStatus}
                  </span>
                </div>

                {/* Client Info */}
                <div className="space-y-1.5 text-xs">
                  <div className="font-bold text-white text-sm">
                    {ticket.clientName}
                  </div>
                  
                  <div className="flex items-start gap-1.5 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{ticket.clientAddress} ({ticket.rawZoneText})</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <a
                      href={`tel:${ticket.clientPhone}`}
                      className="text-sky-400 hover:underline font-mono font-bold"
                    >
                      {ticket.clientPhone} (Appeler)
                    </a>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                  <button
                    onClick={() => {
                      setActiveTicket(ticket);
                      setActionType('NF');
                    }}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Raccordé (NF)</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTicket(ticket);
                      setActionType('LITIGE');
                    }}
                    className="py-2.5 px-3 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Litige</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};
