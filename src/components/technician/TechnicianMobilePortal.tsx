import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LITIGE_REASONS, LitigeReasonCode, MANUAL_TICKET_NATURES } from '../../types';
import { describeMaterials, prestationLabel, PRESTATIONS, type PrestationDeclaration } from '../../domain/prestations';
import { formatCasablancaDateTime } from '../../domain/format';
import { ReportForm, type FormTicket } from './ReportForm';
import { CheckCircle2, AlertTriangle, MapPin, Phone, Send, AlertCircle, ClipboardList, FileCheck2, Wrench, ArrowLeft } from 'lucide-react';

// Technician app: no account, the secret activation token (?act=…) is the credential.
// Opened from a link or inside Telegram as a Mini App ("Mon espace" menu, "Déclarer" buttons).
// Deep links: &mode=nf|declare&ticket=<id>[&nfType=CENTRAL_CONFIG][&scope=SPLITTER] or &tab=declare.
interface PortalTicket extends FormTicket {
  clientNumber: string;
  clientPhone: string;
  rawZoneText: string;
  currentStatus: string;
  origin?: 'IMPORT' | 'MANUAL';
  manualNature?: string;
  description?: string;
  closedAt?: string;
  prestation?: Omit<PrestationDeclaration, 'photoIds'> & { photoCount: number };
}

interface PortalData {
  technician: { fullName: string };
  suspended: boolean;
  tickets: PortalTicket[];
  toDeclare: PortalTicket[];
  declared: PortalTicket[];
}

type Tab = 'todo' | 'declare' | 'done';
type Screen =
  | { kind: 'list' }
  | { kind: 'form'; ticket: PortalTicket; mode: 'nf' | 'declare'; nfType?: 'STANDARD' | 'CENTRAL_CONFIG'; groupSize: number }
  | { kind: 'litige'; ticket: PortalTicket; groupSize: number }
  | { kind: 'success'; message: string };

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
}
const telegramApp = (): TelegramWebApp | undefined => (window as any).Telegram?.WebApp;

// Inside Telegram, the official script gives full height and a "close" action.
function useTelegramMiniApp() {
  useEffect(() => {
    if (telegramApp()) return;
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = () => {
      const app = telegramApp();
      if (app?.initData) {
        app.ready();
        app.expand();
      }
    };
    document.head.appendChild(script);
  }, []);
}
const insideTelegram = () => !!telegramApp()?.initData;

interface TechnicianMobilePortalProps {
  activationToken: string;
  onExitPortal?: () => void;
}

const REFRESH_MS = 30000;
const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

export const TechnicianMobilePortal: React.FC<TechnicianMobilePortalProps> = ({ activationToken, onExitPortal }) => {
  useTelegramMiniApp();
  const [loadState, setLoadState] = useState<'LOADING' | 'OK' | 'INVALID' | 'SUSPENDED' | 'OFFLINE'>('LOADING');
  const [data, setData] = useState<PortalData | null>(null);
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'declare' ? 'declare' : 'todo');
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [deepLinkHandled, setDeepLinkHandled] = useState(!params.get('mode'));
  const openedFromDeepLink = !!params.get('mode');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal?token=${encodeURIComponent(activationToken)}`);
      if (res.status === 404) return setLoadState('INVALID');
      if (!res.ok) return setLoadState(prev => (prev === 'OK' ? 'OK' : 'OFFLINE'));
      const json = (await res.json()) as PortalData;
      setData(json);
      setLoadState(json.suspended ? 'SUSPENDED' : 'OK');
    } catch {
      setLoadState(prev => (prev === 'OK' ? 'OK' : 'OFFLINE'));
    }
  }, [activationToken]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const tickets = data?.tickets || [];
  const splitterCount = useCallback(
    (t: PortalTicket) => (t.splitterRef ? tickets.filter(x => x.splitterRef === t.splitterRef).length : 1),
    [tickets]
  );

  // Button pressed in Telegram ("NF config centrale", "Déclarer") → open the form directly
  useEffect(() => {
    if (deepLinkHandled || !data) return;
    setDeepLinkHandled(true);
    const id = params.get('ticket');
    const mode = params.get('mode');
    if (mode === 'declare') {
      const ticket = data.toDeclare.find(t => t.id === id);
      if (ticket) setScreen({ kind: 'form', ticket, mode: 'declare', groupSize: 1 });
      else setScreen({ kind: 'success', message: 'Cette prestation est déjà déclarée. Merci !' });
    } else if (mode === 'nf') {
      const ticket = data.tickets.find(t => t.id === id);
      if (ticket) {
        const nfType = params.get('nfType') === 'CENTRAL_CONFIG' ? 'CENTRAL_CONFIG' : 'STANDARD';
        setScreen({ kind: 'form', ticket, mode: 'nf', nfType, groupSize: params.get('scope') === 'SPLITTER' ? splitterCount(ticket) : 1 });
      } else {
        setScreen({ kind: 'success', message: 'Ce ticket est déjà clôturé ou ne vous est plus affecté.' });
      }
    }
  }, [data, deepLinkHandled, splitterCount]);

  const finish = (message: string) => {
    load();
    setScreen({ kind: 'success', message });
  };
  const backToList = () => {
    setScreen({ kind: 'list' });
    window.scrollTo({ top: 0 });
  };

  if (loadState === 'LOADING') {
    return <div className="min-h-screen bg-slate-50 text-slate-500 flex items-center justify-center text-sm">Chargement de vos interventions…</div>;
  }

  if (loadState === 'INVALID' || loadState === 'OFFLINE' || !data) {
    return (
      <FullMessage
        tone="error"
        title={loadState === 'OFFLINE' ? 'Connexion impossible' : 'Lien technicien invalide ou expiré'}
        text={loadState === 'OFFLINE'
          ? 'Vérifiez votre connexion Internet puis rechargez la page.'
          : 'Ce lien n\'est plus actif. Contactez votre superviseur 3GCOM pour recevoir un nouveau lien.'}
        onBack={onExitPortal}
      />
    );
  }

  if (loadState === 'SUSPENDED') {
    return <FullMessage tone="warning" title="Accès suspendu" text={`Bonjour ${data.technician.fullName}, votre accès a été suspendu par votre superviseur 3GCOM.`} onBack={onExitPortal} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-brand-navy-900 text-white px-4 pt-3 sticky top-0 z-30">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2.5">
              <img src="/brand/logo-3gcom-white.png" alt="3GCOM" className="h-8 w-auto" />
              <div>
                <div className="text-sm font-bold leading-tight">{data.technician.fullName}</div>
                <div className="text-[11px] text-white/60">Technicien · Fibre optique</div>
              </div>
            </div>
            {onExitPortal && !insideTelegram() && (
              <button onClick={onExitPortal} className="text-[11px] text-white/70 px-2 py-1 rounded-lg hover:bg-white/10">Quitter</button>
            )}
          </div>
          {screen.kind === 'list' && (
            <nav className="flex">
              {([
                ['todo', 'À faire', data.tickets.length, ClipboardList],
                ['declare', 'À déclarer', data.toDeclare.length, FileCheck2],
                ['done', 'Déclarées', data.declared.length, CheckCircle2],
              ] as const).map(([id, label, count, Icon]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`relative flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 ${tab === id ? 'text-white' : 'text-white/60'}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                  {count > 0 && (
                    <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] flex items-center justify-center ${
                      id === 'declare' ? 'bg-brand-orange-500 text-white' : 'bg-white/15'
                    }`}>{count}</span>
                  )}
                  <span className={`absolute left-2 right-2 bottom-0 h-[3px] rounded-t-full ${tab === id ? 'bg-brand-orange-500' : ''}`} />
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto p-3">
        {screen.kind === 'form' && (
          <ReportForm
            token={activationToken}
            ticket={screen.ticket}
            mode={screen.mode}
            initialNfType={screen.nfType}
            splitterGroupSize={screen.groupSize}
            onDone={finish}
            onCancel={backToList}
          />
        )}

        {screen.kind === 'litige' && (
          <LitigeForm token={activationToken} ticket={screen.ticket} groupSize={screen.groupSize} onDone={finish} onCancel={backToList} />
        )}

        {screen.kind === 'success' && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-6 text-center space-y-4 mt-6">
            <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto" />
            <p className="text-base font-semibold text-slate-800">{screen.message}</p>
            <div className="flex flex-col gap-2">
              {openedFromDeepLink && insideTelegram() && (
                <button onClick={() => telegramApp()?.close()} className="h-12 rounded-xl bg-brand-navy-900 text-white font-bold">Fermer</button>
              )}
              <button onClick={backToList} className="h-12 rounded-xl bg-slate-100 text-slate-800 font-bold">Voir mes interventions</button>
            </div>
          </div>
        )}

        {screen.kind === 'list' && tab === 'todo' && (
          <TicketList
            empty="Aucune intervention en cours. Les nouveaux tickets apparaissent ici dès que l'orienteur vous les affecte."
            tickets={[...data.tickets].sort((a, b) => splitterCount(b) - splitterCount(a) || (a.splitterRef || '').localeCompare(b.splitterRef || ''))}
            splitterCount={splitterCount}
            actions={t => (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setScreen({ kind: 'form', ticket: t, mode: 'nf', groupSize: splitterCount(t) })}
                  className="h-12 rounded-xl bg-emerald-600 active:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> NF
                </button>
                <button
                  onClick={() => setScreen({ kind: 'litige', ticket: t, groupSize: splitterCount(t) })}
                  className="h-12 rounded-xl bg-rose-600 active:bg-rose-700 text-white font-bold text-sm flex items-center justify-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4" /> Litige
                </button>
              </div>
            )}
          />
        )}

        {screen.kind === 'list' && tab === 'declare' && (
          <TicketList
            empty="Aucune prestation à déclarer. Merci !"
            intro="Interventions clôturées en NF dont la prestation n'est pas encore déclarée."
            tickets={data.toDeclare}
            splitterCount={() => 1}
            showClosedAt
            actions={t => (
              <button
                onClick={() => setScreen({ kind: 'form', ticket: t, mode: 'declare', groupSize: 1 })}
                className="w-full h-12 rounded-xl bg-brand-orange-500 active:bg-brand-orange-600 text-white font-bold text-sm"
              >
                📝 Déclarer la prestation
              </button>
            )}
          />
        )}

        {screen.kind === 'list' && tab === 'done' && <DeclaredList tickets={data.declared} />}
      </main>
    </div>
  );
};

const FullMessage: React.FC<{ tone: 'error' | 'warning'; title: string; text: string; onBack?: () => void }> = ({ tone, title, text, onBack }) => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${tone === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
      {tone === 'error' ? <AlertTriangle className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
    </div>
    <h1 className="text-xl font-bold text-slate-900">{title}</h1>
    <p className="text-sm text-slate-600 mt-2 max-w-sm">{text}</p>
    {onBack && <button onClick={onBack} className="mt-6 px-4 py-2 bg-slate-200 text-slate-800 text-xs rounded-xl">Retour</button>}
  </div>
);

const TicketList: React.FC<{
  tickets: PortalTicket[];
  empty: string;
  intro?: string;
  splitterCount: (t: PortalTicket) => number;
  showClosedAt?: boolean;
  actions: (t: PortalTicket) => React.ReactNode;
}> = ({ tickets, empty, intro, splitterCount, showClosedAt, actions }) => (
  <div className="space-y-3">
    {intro && tickets.length > 0 && <p className="text-xs text-slate-500 px-1">{intro}</p>}
    {tickets.length === 0 && (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
        <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-2" />
        {empty}
      </div>
    )}
    {tickets.map(t => {
      const group = splitterCount(t);
      return (
        <div key={t.id} className={`bg-white rounded-2xl border p-4 space-y-3 ${group > 1 ? 'border-brand-orange-400 border-l-4' : 'border-slate-200'}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-mono font-bold text-base text-slate-900">{t.ticketNumber}</div>
              {showClosedAt && t.closedAt && <div className="text-[11px] text-slate-500">NF le {formatCasablancaDateTime(t.closedAt)}</div>}
            </div>
            <div className="flex flex-col items-end gap-1">
              {t.splitterRef && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${group > 1 ? 'bg-brand-orange-500 text-white' : 'bg-brand-orange-50 text-brand-orange-600'}`}>
                  🔌 {t.splitterRef}{group > 1 ? ` · ${group} tickets` : ''}
                </span>
              )}
              {t.origin === 'MANUAL' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800">
                  <Wrench className="w-3 h-3 inline -mt-0.5" /> {MANUAL_TICKET_NATURES.find(n => n.code === t.manualNature)?.label || 'Hors ticket'}
                </span>
              )}
            </div>
          </div>
          {t.description && <div className="text-sm text-violet-900 bg-violet-50 rounded-lg px-2.5 py-1.5">📝 {t.description}</div>}
          <div className="space-y-1 text-sm">
            <div className="font-bold text-slate-900">{t.clientName}</div>
            <div className="flex items-start gap-1.5 text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>{t.clientAddress} <span className="font-semibold">({t.rawZoneText})</span></span>
            </div>
            {t.clientPhone && (
              <a href={`tel:${t.clientPhone.split('/')[0].trim()}`} className="flex items-center gap-1.5 text-brand-navy-700 font-bold font-mono">
                <Phone className="w-4 h-4" /> {t.clientPhone}
              </a>
            )}
          </div>
          {actions(t)}
        </div>
      );
    })}
  </div>
);

// Declared prestations: totals of the last 7 days and the list (what the technician will be paid for)
const DeclaredList: React.FC<{ tickets: PortalTicket[] }> = ({ tickets }) => {
  const totals = useMemo(() => {
    const since = Date.now() - 7 * 86400_000;
    const recent = tickets.filter(t => t.prestation && Date.parse(t.prestation.declaredAt) >= since);
    return {
      count: recent.length,
      byCode: PRESTATIONS.map(p => ({
        label: p.label,
        count: recent.filter(t => t.prestation!.code === p.code).length,
        raccordements: p.withRaccordements ? recent.filter(t => t.prestation!.code === p.code).reduce((n, t) => n + (t.prestation!.raccordements || 0), 0) : undefined,
      })),
      joints: recent.reduce((n, t) => n + t.prestation!.materials.joints, 0),
      splitters: recent.reduce((n, t) => n + t.prestation!.materials.splitters, 0),
      cable: recent.reduce((n, t) => n + t.prestation!.materials.cableMeters, 0),
    };
  }, [tickets]);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">7 derniers jours · {totals.count} prestation(s)</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {totals.byCode.map(c => (
            <div key={c.label} className="bg-slate-50 rounded-xl px-3 py-2">
              <div className="text-xl font-bold font-mono text-slate-900">{c.count}</div>
              <div className="text-[11px] text-slate-600">{c.label}{c.raccordements ? ` · ${c.raccordements} racc.` : ''}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-600">Matériel : <b>{describeMaterials({ joints: totals.joints, splitters: totals.splitters, cableMeters: totals.cable })}</b></div>
      </div>
      {tickets.length === 0 && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">Aucune prestation déclarée ces 30 derniers jours.</div>}
      {tickets.map(t => (
        <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-3 text-sm flex items-start justify-between gap-3">
          <div>
            <div className="font-mono font-bold">{t.ticketNumber}</div>
            <div className="text-slate-600">{t.clientName}</div>
            <div className="text-[11px] text-slate-500">{t.prestation && formatCasablancaDateTime(t.prestation.declaredAt)}</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-slate-900">{prestationLabel(t.prestation?.code)}{t.prestation?.raccordements ? ` × ${t.prestation.raccordements}` : ''}</div>
            <div className="text-[11px] text-slate-600">{t.prestation && describeMaterials(t.prestation.materials)}</div>
            {!!t.prestation?.photoCount && <div className="text-[11px] text-slate-500">📷 {t.prestation.photoCount} photo(s)</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

// Litige (unchanged behaviour; RDV and recontact improvements come in the next step)
const LitigeForm: React.FC<{
  token: string;
  ticket: PortalTicket;
  groupSize: number;
  onDone: (message: string) => void;
  onCancel: () => void;
}> = ({ token, ticket, groupSize, onDone, onCancel }) => {
  const [reason, setReason] = useState<LitigeReasonCode>('CLIENT_UNREACHABLE');
  const [notes, setNotes] = useState('');
  const [rdvDateTime, setRdvDateTime] = useState('');
  const [applyToSplitter, setApplyToSplitter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wholeSplitter = groupSize > 1 && applyToSplitter;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'REPORT',
          ticketId: ticket.id,
          scope: wholeSplitter ? 'SPLITTER' : 'TICKET',
          report: { kind: 'LITIGE', reasonCode: reason, rdvDateTime: reason === 'RDV' ? rdvDateTime : undefined, notes: notes.trim() },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Envoi impossible, réessayez.');
      onDone(wholeSplitter
        ? `Litige signalé pour les ${groupSize} tickets du splitter ${ticket.splitterRef}. L'orienteur est alerté.`
        : `Litige signalé pour le ticket ${ticket.ticketNumber}. L'orienteur est alerté.`);
    } catch {
      setError('Pas de connexion Internet. Réessayez dans un instant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>
      <div className="bg-rose-600 text-white rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/70 font-bold">Signaler un litige</div>
        <div className="font-mono font-bold text-lg">{ticket.ticketNumber}</div>
        <div className="text-sm text-white/85">{ticket.clientName}</div>
      </div>
      {groupSize > 1 && (
        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-orange-50 border border-brand-orange-400 text-sm cursor-pointer">
          <input type="checkbox" checked={applyToSplitter} onChange={e => setApplyToSplitter(e.target.checked)} className="mt-1" />
          <span><b>Appliquer aux {groupSize} tickets du splitter {ticket.splitterRef}</b></span>
        </label>
      )}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Motif</div>
        <div className="grid gap-2">
          {LITIGE_REASONS.map(r => (
            <button
              key={r.code}
              type="button"
              onClick={() => setReason(r.code)}
              className={`min-h-12 px-3 rounded-xl border-2 text-sm font-bold text-left ${reason === r.code ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 bg-white text-slate-800'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {reason === 'RDV' && (
          <input type="datetime-local" required value={rdvDateTime} onChange={e => setRdvDateTime(e.target.value)} className="w-full h-12 px-3 border border-slate-300 rounded-xl" />
        )}
        <textarea
          rows={3}
          required
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Détails (ex : client injoignable après 3 appels)"
          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
        />
      </div>
      {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-sm font-semibold">{error}</div>}
      <button type="submit" disabled={isSubmitting} className="w-full h-14 rounded-2xl bg-rose-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
        <Send className="w-5 h-5" /> {isSubmitting ? 'Envoi…' : 'Envoyer le litige'}
      </button>
    </form>
  );
};
