import React, { useState, useEffect } from 'react';
import { store } from '../../services/storage';
import { formatCasablancaDateTime } from '../../domain/format';
import { exportTicketsToExcel, exportTechnicianMatrixToExcel } from '../../services/excelExporter';
import { Ticket, MANUAL_TICKET_NATURES } from '../../types';
import { SplitterIncidentsPanel } from '../tickets/SplitterIncidentsPanel';
import { ManualTicketModal } from '../tickets/ManualTicketModal';
import {
  AlertTriangle, CheckCircle2, Clock, Download, Eye, Flame, Inbox, Plus, Search, Trash2, Truck, Users, Wrench,
  type LucideIcon,
} from 'lucide-react';

interface ManagerDashboardViewProps {
  onOpenTicketHistory?: (ticket: Ticket) => void;
}

type AlertKind = 'OVERDUE' | 'CRITICAL' | 'LITIGE' | 'TECH';

// Status families used by the charts (same colors as the encours bar of the menu)
const FAMILIES: { key: string; label: string; color: string; match: (t: Ticket) => boolean }[] = [
  { key: 'todo', label: 'À affecter', color: 'bg-brand-orange-500', match: t => ['TO_ASSIGN', 'PROPOSED', 'ZONE_TO_MAP'].includes(t.currentStatus) },
  { key: 'field', label: 'En cours terrain', color: 'bg-sky-400', match: t => ['ASSIGNED', 'REOPENED'].includes(t.currentStatus) },
  { key: 'litige', label: 'Litiges', color: 'bg-rose-500', match: t => t.currentStatus === 'LITIGE' },
  { key: 'suspended', label: 'Suspendus', color: 'bg-slate-400', match: t => t.currentStatus === 'SUSPENDED' },
  { key: 'nf', label: 'NF', color: 'bg-emerald-500', match: t => t.currentStatus === 'COMPLETED' },
];

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

export const ManagerDashboardView: React.FC<ManagerDashboardViewProps> = ({ onOpenTicketHistory }) => {
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [alertKind, setAlertKind] = useState<AlertKind | 'ALL'>('ALL');
  const [alertSearch, setAlertSearch] = useState('');
  const [isManualTicketOpen, setIsManualTicketOpen] = useState(false);
  const currentUser = store.getCurrentUser();
  const [, setStoreVersion] = useState(0);

  useEffect(() => store.subscribe(() => setStoreVersion(v => v + 1)), []);

  const allTickets = store.getTickets();
  const allSectors = store.getSectors();
  const allTechs = store.getTechnicians();
  const selectedSector = allSectors.find(s => s.id === sectorFilter) || null;
  const tickets = sectorFilter === 'ALL' ? allTickets : allTickets.filter(t => t.sectorId === sectorFilter);
  const techs = (sectorFilter === 'ALL' ? allTechs : allTechs.filter(t => t.sectorId === sectorFilter || (t.sectorIds || []).includes(sectorFilter)))
    .filter(t => t.isActive);

  const total = tickets.length;
  const overdue = tickets.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed);
  const critical = tickets.filter(t => t.slaStatus === 'WARNING' && !t.isClosed);
  const litiges = tickets.filter(t => t.currentStatus === 'LITIGE');
  const inField = tickets.filter(t => ['ASSIGNED', 'REOPENED'].includes(t.currentStatus)).length;
  const completed = tickets.filter(t => t.currentStatus === 'COMPLETED').length;
  const slaRate = pct(total - overdue.length, total);
  const manualTickets = tickets.filter(t => t.origin === 'MANUAL');

  // Technicians overloaded (6+ open) or without progress for 1h30
  const now = Date.now();
  const techAlerts = techs.flatMap(tech => {
    const open = tickets.filter(t => t.currentAssignedTechId === tech.id && !t.isClosed);
    if (open.length >= 6) return [{ tech, text: `${open.length} interventions ouvertes` }];
    const stale = open.find(t => (now - new Date(t.lastEventAt || t.updatedAt).getTime()) / 3600000 >= 1.5);
    return stale ? [{ tech, text: `Aucun avancement depuis plus d'1h30 (${stale.ticketNumber})` }] : [];
  });

  const alertCounts: Record<AlertKind, number> = {
    OVERDUE: overdue.length, CRITICAL: critical.length, LITIGE: litiges.length, TECH: techAlerts.length,
  };
  const alertTotal = Object.values(alertCounts).reduce((a, b) => a + b, 0);
  const q = alertSearch.trim().toLowerCase();
  const matches = (t: Ticket) => !q || [t.ticketNumber, t.clientName, t.rawZoneText].some(v => (v || '').toLowerCase().includes(q));
  const ticketAlerts: { kind: AlertKind; ticket: Ticket }[] = [
    ...overdue.sort((a, b) => a.slaRemainingHours - b.slaRemainingHours).map(ticket => ({ kind: 'OVERDUE' as const, ticket })),
    ...critical.map(ticket => ({ kind: 'CRITICAL' as const, ticket })),
    ...litiges.map(ticket => ({ kind: 'LITIGE' as const, ticket })),
  ].filter(a => (alertKind === 'ALL' || alertKind === a.kind) && matches(a.ticket));

  const sectorRows = allSectors.map(sector => {
    const list = allTickets.filter(t => t.sectorId === sector.id);
    const late = list.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed).length;
    return { sector, list, late, rate: pct(list.length - late, list.length) };
  });

  const techRows = techs
    .map(tech => {
      const list = allTickets.filter(t => t.currentAssignedTechId === tech.id);
      return {
        tech,
        received: list.length,
        nf: list.filter(t => t.currentStatus === 'COMPLETED').length,
        open: list.filter(t => !t.isClosed).length,
        litiges: list.filter(t => t.currentStatus === 'LITIGE').length,
      };
    })
    .sort((a, b) => b.nf - a.nf || b.received - a.received);
  const maxReceived = Math.max(1, ...techRows.map(r => r.received));

  const dateTag = new Date().toISOString().split('T')[0];
  const exportAll = () => exportTicketsToExcel(tickets, `rapport_${selectedSector ? selectedSector.code.toLowerCase() : 'royaume'}_${dateTag}.xlsx`);
  const exportManual = () => exportTicketsToExcel(manualTickets, `interventions_hors_ticket_${selectedSector ? selectedSector.code.toLowerCase() : 'royaume'}_${dateTag}.xlsx`);
  const exportTechs = () => exportTechnicianMatrixToExcel(techs, tickets, `matrice_techniciens_${selectedSector ? selectedSector.code.toLowerCase() : 'national'}.xlsx`);
  const purge = () => {
    if (window.confirm(`⚠️ Supprimer TOUS les tickets (${allTickets.length}) ?\n\nLe référentiel (secteurs, zones, techniciens) est conservé.`)) store.clearAllTickets();
  };

  const techName = (id?: string) => allTechs.find(t => t.id === id)?.fullName;
  const sectorName = (id?: string | null) => allSectors.find(s => s.id === id)?.name || '';

  return (
    <div className="space-y-5">
      {/* Scope and actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-slate-200 overflow-x-auto self-start max-w-full">
          {[{ id: 'ALL', name: 'Tous les secteurs', count: allTickets.length, late: 0 }, ...sectorRows.map(r => ({ id: r.sector.id, name: r.sector.name, count: r.list.length, late: r.late }))].map(s => (
            <button
              key={s.id}
              onClick={() => setSectorFilter(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 ${sectorFilter === s.id ? 'bg-brand-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {s.name}
              <span className={sectorFilter === s.id ? 'text-white/60' : 'text-slate-400'}>{s.count}</span>
              {s.late > 0 && <span className="px-1.5 rounded-full bg-rose-500 text-white text-[10px]">{s.late}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setIsManualTicketOpen(true)} className="px-3 py-2 text-xs font-bold text-violet-800 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Créer un ticket
          </button>
          <button onClick={exportTechs} className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Matrice techniciens
          </button>
          <button onClick={exportAll} className="px-3.5 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile icon={Inbox} tone="slate" label="Réclamations" value={total} caption={selectedSector ? selectedSector.name : 'tous secteurs'} />
        <StatTile icon={Flame} tone="rose" label="Hors délai (> 24 h)" value={overdue.length} caption="pénalités applicables" highlight={overdue.length > 0} />
        <StatTile icon={Truck} tone="sky" label="En cours terrain" value={inField} caption={`${techs.length} technicien(s) actif(s)`} />
        <StatTile icon={CheckCircle2} tone="emerald" label="Normalisés (NF)" value={completed} caption={`${pct(completed, total)} % des réclamations`} />
        <StatTile icon={AlertTriangle} tone="amber" label="Litiges" value={litiges.length} caption="à traiter par l'orienteur" />
      </div>

      {/* SLA gauge + distribution */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Respect du SLA 24 h">
          <div className="flex items-center gap-5">
            <Gauge value={slaRate} />
            <div className="space-y-2 text-xs">
              <Legend color="bg-rose-500" label="Hors délai" value={overdue.length} />
              <Legend color="bg-amber-400" label="Moins de 6 h" value={critical.length} />
              <Legend color="bg-emerald-500" label="Dans les temps" value={total - overdue.length - critical.length} />
            </div>
          </div>
        </Card>

        <Card title="Où en sont les réclamations" className="lg:col-span-2">
          <StackedBar tickets={tickets} big />
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {FAMILIES.map(f => <Legend key={f.key} color={f.color} label={f.label} value={tickets.filter(f.match).length} />)}
          </div>
          {sectorRows.length > 1 && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5">
              {sectorRows.map(r => (
                <button
                  key={r.sector.id}
                  onClick={() => setSectorFilter(sectorFilter === r.sector.id ? 'ALL' : r.sector.id)}
                  className={`w-full grid grid-cols-[110px_1fr_auto] items-center gap-3 text-xs rounded-lg px-1 py-0.5 ${sectorFilter === r.sector.id ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="text-left font-bold text-slate-800 truncate">{r.sector.name}</span>
                  {r.list.length ? <StackedBar tickets={r.list} /> : <span className="text-left text-slate-400">Aucun ticket</span>}
                  <span className="text-right text-slate-500 w-28">
                    <b className="text-slate-900">{r.list.length}</b> · SLA <b className={r.rate < 80 ? 'text-rose-600' : 'text-emerald-600'}>{r.list.length ? `${r.rate} %` : '—'}</b>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Alerts + technicians */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card
          className="lg:col-span-3"
          title="Alertes"
          aside={<span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${alertTotal ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{alertTotal}</span>}
          flush
        >
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            {([['ALL', 'Toutes', alertTotal], ['OVERDUE', 'Hors délai', alertCounts.OVERDUE], ['CRITICAL', '< 6 h', alertCounts.CRITICAL], ['LITIGE', 'Litiges', alertCounts.LITIGE], ['TECH', 'Techniciens', alertCounts.TECH]] as const).map(([id, label, n]) => (
              <button
                key={id}
                onClick={() => setAlertKind(id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${alertKind === id ? 'bg-brand-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {label} {n}
              </button>
            ))}
            <div className="relative ml-auto w-full sm:w-44">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input value={alertSearch} onChange={e => setAlertSearch(e.target.value)} placeholder="Ticket, client…" className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2 py-1.5" />
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
            {alertTotal === 0 && (
              <div className="p-8 text-center text-xs text-slate-500">
                <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" /> Aucune alerte sur ce périmètre.
              </div>
            )}
            {(alertKind === 'ALL' || alertKind === 'TECH') && techAlerts.map(({ tech, text }) => (
              <div key={`tech-${tech.id}`} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                <AlertIcon kind="TECH" />
                <div className="flex-1 min-w-0">
                  <b className="text-slate-900">{tech.fullName}</b> <span className="text-slate-500">· {sectorName(tech.sectorId)}</span>
                  <div className="text-violet-800">{text}</div>
                </div>
              </div>
            ))}
            {ticketAlerts.map(({ kind, ticket }) => (
              <div key={`${kind}-${ticket.id}`} className="px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-slate-50">
                <AlertIcon kind={kind} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <b className="font-mono text-slate-900">{ticket.ticketNumber}</b>
                    <span className="text-slate-600 truncate">{ticket.clientName}</span>
                    <span className="text-slate-400">· {ticket.rawZoneText}</span>
                  </div>
                  <div className="text-slate-500 truncate">
                    {techName(ticket.currentAssignedTechId) ? <>👤 {techName(ticket.currentAssignedTechId)}</> : <span className="text-amber-700">Non affecté</span>}
                    {kind === 'LITIGE' && <> · {ticket.lastLitigeReasonLabel}{ticket.lastLitigeRdvDate && ` · RDV ${formatCasablancaDateTime(ticket.lastLitigeRdvDate)}`}</>}
                  </div>
                </div>
                {kind !== 'LITIGE' && (
                  <span className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${kind === 'OVERDUE' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                    {kind === 'OVERDUE' ? `+${Math.abs(ticket.slaRemainingHours)} h` : `reste ${ticket.slaRemainingHours} h`}
                  </span>
                )}
                {onOpenTicketHistory && (
                  <button onClick={() => onOpenTicketHistory(ticket)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100" title="Historique">
                    <Eye className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2" title="Techniciens" aside={<span className="text-[11px] text-slate-400">NF / reçus</span>}>
          {techRows.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun technicien actif.</p>
          ) : (
            <div className="space-y-3">
              {techRows.map(r => (
                <div key={r.tech.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 truncate">{r.tech.fullName}</span>
                    <span className="text-slate-500 whitespace-nowrap">
                      <b className="text-emerald-700">{r.nf}</b> / {r.received}
                      {r.open > 0 && <> · {r.open} ouvert{r.open > 1 ? 's' : ''}</>}
                      {r.litiges > 0 && <span className="text-rose-600"> · {r.litiges} litige{r.litiges > 1 ? 's' : ''}</span>}
                    </span>
                  </div>
                  <div className="h-2 mt-1.5 rounded-full bg-slate-100 overflow-hidden" style={{ width: `${Math.max(8, (r.received / maxReceived) * 100)}%` }}>
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct(r.nf, r.received)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <SplitterIncidentsPanel tickets={tickets} technicians={allTechs} sectors={allSectors} />

      {/* Interventions without operator ticket */}
      <Card title="Interventions hors ticket" aside={<span className="text-[11px] text-slate-400">à facturer</span>}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center"><Wrench className="w-5 h-5" /></div>
            <div className="text-2xl font-bold tabular-nums">{manualTickets.length}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {MANUAL_TICKET_NATURES.map(n => (
                <span key={n.code}>{n.label} <b>{manualTickets.filter(t => t.manualNature === n.code).length}</b></span>
              ))}
              <span className="text-emerald-700">NF <b>{manualTickets.filter(t => t.currentStatus === 'COMPLETED').length}</b></span>
            </div>
          </div>
          <button onClick={exportManual} disabled={manualTickets.length === 0} className="px-3 py-2 text-xs font-bold text-violet-800 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 disabled:opacity-40 flex items-center gap-1.5 self-start">
            <Download className="w-3.5 h-3.5" /> Exporter pour facturation
          </button>
        </div>
      </Card>

      <div className="flex justify-end">
        <button onClick={purge} className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 flex items-center gap-1" title="Vider tous les tickets pour repartir sur une base propre">
          <Trash2 className="w-3.5 h-3.5" /> Purger les tickets ({allTickets.length})
        </button>
      </div>

      {currentUser && <ManualTicketModal isOpen={isManualTicketOpen} currentUser={currentUser} onClose={() => setIsManualTicketOpen(false)} />}
    </div>
  );
};

const TONES = {
  slate: 'bg-slate-100 text-slate-600',
  rose: 'bg-rose-100 text-rose-600',
  sky: 'bg-sky-100 text-sky-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
};

const StatTile: React.FC<{ icon: LucideIcon; tone: keyof typeof TONES; label: string; value: number; caption: string; highlight?: boolean }> =
  ({ icon: Icon, tone, label, value, caption, highlight }) => (
    <div className={`bg-white rounded-2xl border p-4 ${highlight ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200/80'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${TONES[tone]}`}><Icon className="w-4 h-4" /></span>
      </div>
      <div className={`text-3xl font-bold tabular-nums mt-1 ${highlight ? 'text-rose-600' : 'text-slate-900'}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{caption}</div>
    </div>
  );

const Card: React.FC<{ title: string; aside?: React.ReactNode; className?: string; flush?: boolean; children: React.ReactNode }> =
  ({ title, aside, className = '', flush, children }) => (
    <section className={`bg-white rounded-2xl border border-slate-200/80 ${flush ? '' : 'p-4 pb-5'} ${className}`}>
      <div className={`flex items-center justify-between ${flush ? 'px-4 pt-4 pb-3' : 'mb-4'}`}>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );

const Legend: React.FC<{ color: string; label: string; value: number }> = ({ color, label, value }) => (
  <span className="flex items-center gap-1.5 text-xs text-slate-600">
    <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
    {label} <b className="text-slate-900 tabular-nums">{value}</b>
  </span>
);

const StackedBar: React.FC<{ tickets: Ticket[]; big?: boolean }> = ({ tickets, big }) => (
  <div className={`flex w-full rounded-full overflow-hidden bg-slate-100 ${big ? 'h-4' : 'h-2.5'}`}>
    {FAMILIES.map(f => {
      const n = tickets.filter(f.match).length;
      return n ? <div key={f.key} className={f.color} style={{ width: `${(n / tickets.length) * 100}%` }} title={`${f.label} : ${n}`} /> : null;
    })}
  </div>
);

// Half-ring gauge of the SLA compliance rate
const Gauge: React.FC<{ value: number }> = ({ value }) => {
  const r = 52;
  const c = Math.PI * r;
  const color = value >= 90 ? '#10b981' : value >= 70 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="relative w-36 h-20 shrink-0">
      <svg viewBox="0 0 120 66" className="w-full h-full">
        <path d="M 8 60 A 52 52 0 0 1 112 60" fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
        <path d="M 8 60 A 52 52 0 0 1 112 60" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>{value} %</div>
      </div>
    </div>
  );
};

const AlertIcon: React.FC<{ kind: AlertKind }> = ({ kind }) => {
  const map = {
    OVERDUE: [Flame, 'bg-rose-100 text-rose-600'],
    CRITICAL: [Clock, 'bg-amber-100 text-amber-700'],
    LITIGE: [AlertTriangle, 'bg-sky-100 text-sky-700'],
    TECH: [Users, 'bg-violet-100 text-violet-700'],
  } as const;
  const [Icon, cls] = map[kind];
  return <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cls}`}><Icon className="w-3.5 h-3.5" /></span>;
};
