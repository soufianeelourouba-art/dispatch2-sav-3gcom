import React, { useState, useEffect } from 'react';
import { Technician, Ticket, LITIGE_REASONS, LitigeReasonCode } from '../../types';
import { store, formatCasablancaDateTime, formatCasablancaTimeOnly } from '../../services/storage';
import { 
  CheckCircle2, 
  AlertTriangle, 
  MapPin, 
  Phone, 
  Clock, 
  ShieldCheck, 
  Send, 
  ArrowLeft, 
  Check, 
  Ruler, 
  Cpu, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';

interface TechnicianMobilePortalProps {
  technicianId?: string;
  activationToken?: string;
  onExitPortal?: () => void;
}

export const TechnicianMobilePortal: React.FC<TechnicianMobilePortalProps> = ({
  technicianId,
  activationToken,
  onExitPortal,
}) => {
  const [tech, setTech] = useState<Technician | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [actionType, setActionType] = useState<'NONE' | 'NF' | 'LITIGE'>('NONE');
  
  // NF form
  const [cableLength, setCableLength] = useState<number>(45);
  const [ontSerial, setOntSerial] = useState<string>('ALCL' + Math.floor(100000 + Math.random() * 900000));
  const [nfNotes, setNfNotes] = useState<string>('');

  // Litige form
  const [litigeReason, setLitigeReason] = useState<LitigeReasonCode>('CLIENT_UNREACHABLE');
  const [litigeNotes, setLitigeNotes] = useState<string>('');

  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const updateData = () => {
      const allTechs = store.getTechnicians();
      let matchedTech: Technician | undefined;

      if (activationToken) {
        matchedTech = allTechs.find(t => t.telegramActivationToken === activationToken);
        if (matchedTech && matchedTech.telegramActivationStatus !== 'ACTIVATED') {
          // Auto activate
          store.updateTechnician(matchedTech.id, {
            telegramActivationStatus: 'ACTIVATED',
            telegramActivatedAt: new Date().toISOString(),
          });
        }
      } else if (technicianId) {
        matchedTech = allTechs.find(t => t.id === technicianId);
      }

      if (matchedTech) {
        setTech(matchedTech);
        const allTickets = store.getTickets();
        const techTickets = allTickets.filter(
          t => t.currentAssignedTechId === matchedTech!.id && !t.isClosed
        );
        setTickets(techTickets);
      }
    };

    updateData();
    const unsubscribe = store.subscribe(updateData);
    return () => unsubscribe();
  }, [technicianId, activationToken]);

  if (!tech) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold">Lien Technicien Invalide ou Expiré</h1>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          Le lien que vous avez utilisé n'est plus actif. Contactez votre superviseur 3GCOM pour recevoir un nouveau lien.
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

  if (tech.telegramLinkDisabled || tech.telegramActivationStatus === 'REVOKED') {
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

    setIsSubmitting(true);
    setTimeout(() => {
      store.submitNF({
        ticketId: activeTicket.id,
        technicianId: tech.id,
        technicianName: tech.fullName,
        nfType: 'STANDARD',
        ontSerialNumber: ontSerial.trim().toUpperCase(),
        cableLengthMeters: Number(cableLength) || 45,
        notes: nfNotes.trim() || 'Raccordement vertical validé et test de signal conforme (-19 dBm).',
      });

      setIsSubmitting(false);
      setActionType('NONE');
      setActiveTicket(null);
      setNotificationMsg({
        type: 'success',
        text: `Ticket ${activeTicket.ticketNumber} clôturé NF avec succès ! L'orienteur a reçu la confirmation en direct.`,
      });
      setTimeout(() => setNotificationMsg(null), 5000);
    }, 400);
  };

  const handleReportLitige = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;

    setIsSubmitting(true);
    setTimeout(() => {
      store.reportLitige({
        ticketId: activeTicket.id,
        technicianId: tech.id,
        technicianName: tech.fullName,
        reasonCode: litigeReason,
        notes: litigeNotes.trim() || 'Blocage signalé sur place.',
      });

      setIsSubmitting(false);
      setActionType('NONE');
      setActiveTicket(null);
      setNotificationMsg({
        type: 'success',
        text: `Litige signalé pour le ticket ${activeTicket.ticketNumber}. L'orienteur est immédiatement alerté.`,
      });
      setTimeout(() => setNotificationMsg(null), 5000);
    }, 400);
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
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
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
              Directement synchronisé
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
