import React, { useState } from 'react';
import { Ticket, User } from '../../types';
import { store } from '../../services/storage';
import { formatCasablancaDateTime, formatCasablancaTimeOnly, formatSLADisplay } from '../../domain/format';
import { exportTicketsToExcel } from '../../services/excelExporter';
import { LitigeResolutionModal } from './LitigeResolutionModal';
import { SplitterBadge, ManualTicketBadge, NfSummary, SuspendedNotice, ImportOutcomeBadge } from '../tickets/TicketBadges';
import { SplitterIncidentsPanel } from '../tickets/SplitterIncidentsPanel';
import { StatusPill } from '../tickets/StatusPill';
import { splitterKey, groupBySplitter } from '../../domain/splitter';
import { isInDailyScope } from '../../domain/dailyScope';
import { AlertTriangle, CheckCircle2, Clock, Download, Flame, History, Search, X } from 'lucide-react';

interface LiveMonitoringViewProps {
  currentUser: User;
  onOpenTicketHistory: (ticket: Ticket) => void;
  onOpenSimulator: () => void;
}

type SlaFilter = 'ALL' | 'OVERDUE' | 'CRITICAL' | 'ON_TIME';
type StatusTab = 'ALL' | 'FIELD' | 'LITIGE' | 'COMPLETED';

export const LiveMonitoringView: React.FC<LiveMonitoringViewProps> = ({ currentUser, onOpenTicketHistory }) => {
  const userSectors = store.getSectors(currentUser);
  const [sectorId, setSectorId] = useState('ALL');
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [slaFilter, setSlaFilter] = useState<SlaFilter>('ALL');
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState<string | null>(null);
  const [splitterFilter, setSplitterFilter] = useState<string | null>(null);
  const [litigeModalTicket, setLitigeModalTicket] = useState<Ticket | null>(null);
  const [, setStoreVersion] = useState(0);

  React.useEffect(() => store.subscribe(() => setStoreVersion(v => v + 1)), []);

  // Daily working set: received / handled today + everything still to handle (domain/dailyScope.ts)
  const tickets = store.getTickets(currentUser, sectorId).filter(t => isInDailyScope(t));
  const technicians = store.getTechnicians(currentUser, sectorId).filter(t => t.isActive);
  const open = tickets.filter(t => !t.isClosed);

  const sla = {
    OVERDUE: open.filter(t => t.slaStatus === 'EXPIRED').length,
    CRITICAL: open.filter(t => t.slaStatus === 'WARNING').length,
    ON_TIME: open.filter(t => t.slaStatus === 'ON_TIME').length,
  };

  // Transmitted for 1h30 without any news from the technician
  const now = Date.now();
  const inactive = tickets.filter(t =>
    t.currentStatus === 'ASSIGNED' && (now - new Date(t.lastEventAt || t.updatedAt).getTime()) / 3600000 >= 1.5);

  const techRows = technicians.map(tech => {
    const own = tickets.filter(t => t.currentAssignedTechId === tech.id);
    return {
      tech,
      total: own.length,
      active: own.filter(t => t.currentStatus === 'ASSIGNED' || t.currentStatus === 'REOPENED').length,
      nf: own.filter(t => t.currentStatus === 'COMPLETED').length,
      litiges: own.filter(t => t.currentStatus === 'LITIGE').length,
    };
  }).sort((a, b) => b.active - a.active || a.tech.fullName.localeCompare(b.tech.fullName));

  const groups = groupBySplitter(tickets);
  const groupSize = (ticket: Ticket) => {
    const key = splitterKey(ticket);
    return key ? groups.find(g => g.key === key)?.openCount || 1 : 1;
  };

  const tabMatch: Record<StatusTab, (t: Ticket) => boolean> = {
    ALL: () => true,
    FIELD: t => t.currentStatus === 'ASSIGNED' || t.currentStatus === 'REOPENED',
    LITIGE: t => t.currentStatus === 'LITIGE',
    COMPLETED: t => t.currentStatus === 'COMPLETED',
  };

  let rows = tickets.filter(tabMatch[statusTab]);
  if (slaFilter === 'OVERDUE') rows = rows.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed);
  if (slaFilter === 'CRITICAL') rows = rows.filter(t => t.slaStatus === 'WARNING' && !t.isClosed);
  if (slaFilter === 'ON_TIME') rows = rows.filter(t => t.slaStatus === 'ON_TIME' && !t.isClosed);
  if (techFilter) rows = rows.filter(t => t.currentAssignedTechId === techFilter);
  if (splitterFilter) rows = rows.filter(t => t.splitterRef === splitterFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    rows = rows.filter(t => [t.ticketNumber, t.clientName, t.clientPhone, t.rawZoneText, t.splitterRef, t.description]
      .some(v => (v || '').toLowerCase().includes(q)));
  }
  // Open first, splitter incidents together, then the most urgent
  rows.sort((a, b) => {
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
    const ga = groupSize(a), gb = groupSize(b);
    if (ga !== gb) return gb - ga;
    if (ga > 1) {
      const k = (splitterKey(a) || '').localeCompare(splitterKey(b) || '');
      if (k !== 0) return k;
    }
    return a.slaRemainingHours - b.slaRemainingHours;
  });

  const tabs: [StatusTab, string][] = [['ALL', 'Tous'], ['FIELD', 'Sur le terrain'], ['LITIGE', 'Litiges'], ['COMPLETED', 'NF']];
  const techName = (id?: string) => technicians.find(t => t.id === id)?.fullName;

  return (
    <div className="space-y-4">
      {/* Scope and export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Reçus ou traités aujourd'hui, et tout ce qui reste des jours précédents.</p>
        <div className="flex items-center gap-2">
          {userSectors.length > 1 && (
            <select value={sectorId} onChange={e => setSectorId(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold">
              <option value="ALL">Tous mes secteurs ({userSectors.length})</option>
              {userSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button
            onClick={() => exportTicketsToExcel(rows, `suivi_interventions_${currentUser.sectorId || 'secteur'}.xlsx`)}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* SLA filters */}
      <div className="grid grid-cols-3 gap-2">
        <SlaTile active={slaFilter === 'OVERDUE'} onClick={() => setSlaFilter(slaFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
          icon={<Flame className="w-4 h-4" />} tone="rose" label="Hors délai" value={sla.OVERDUE} />
        <SlaTile active={slaFilter === 'CRITICAL'} onClick={() => setSlaFilter(slaFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          icon={<Clock className="w-4 h-4" />} tone="amber" label="Moins de 6 h" value={sla.CRITICAL} />
        <SlaTile active={slaFilter === 'ON_TIME'} onClick={() => setSlaFilter(slaFilter === 'ON_TIME' ? 'ALL' : 'ON_TIME')}
          icon={<CheckCircle2 className="w-4 h-4" />} tone="emerald" label="Dans les délais" value={sla.ON_TIME} />
      </div>

      {inactive.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>
            <b>{inactive.length} ticket(s) sans nouvelle depuis plus d'1h30 :</b>{' '}
            {inactive.map(t => `${t.ticketNumber} (${techName(t.currentAssignedTechId) || t.lastVisitedTechName || '—'})`).join(', ')}
          </span>
        </div>
      )}

      {/* Technicians today */}
      {techRows.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {techRows.map(r => (
            <button
              key={r.tech.id}
              onClick={() => setTechFilter(techFilter === r.tech.id ? null : r.tech.id)}
              className={`min-w-44 text-left bg-white rounded-xl border p-3 ${techFilter === r.tech.id ? 'border-brand-navy-900 ring-2 ring-brand-navy-700/20' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 truncate">{r.tech.fullName}</span>
                {r.active >= 6 && <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 rounded">surcharge</span>}
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex mt-2">
                <div className="bg-emerald-500" style={{ width: `${r.total ? (r.nf / r.total) * 100 : 0}%` }} />
                <div className="bg-rose-500" style={{ width: `${r.total ? (r.litiges / r.total) * 100 : 0}%` }} />
                <div className="bg-sky-400" style={{ width: `${r.total ? (r.active / r.total) * 100 : 0}%` }} />
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5">
                <b className="text-sky-700">{r.active}</b> en cours · <b className="text-emerald-700">{r.nf}</b> NF{r.litiges > 0 && <> · <b className="text-rose-600">{r.litiges}</b> litige</>}
              </div>
            </button>
          ))}
        </div>
      )}

      <SplitterIncidentsPanel tickets={tickets} technicians={technicians} sectors={userSectors} onSelectSplitter={ref => setSplitterFilter(ref)} />

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 border-b border-slate-100">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setStatusTab(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${statusTab === id ? 'bg-brand-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {label} <span className={statusTab === id ? 'text-white/60' : 'text-slate-400'}>{tickets.filter(tabMatch[id]).length}</span>
              </button>
            ))}
          </div>
          <div className="relative md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ticket, client, téléphone, zone…"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2" />
          </div>
        </div>

        {(techFilter || splitterFilter || slaFilter !== 'ALL') && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs">
            <span className="text-slate-500">Filtres :</span>
            {slaFilter !== 'ALL' && <Chip label={{ OVERDUE: 'Hors délai', CRITICAL: 'Moins de 6 h', ON_TIME: 'Dans les délais' }[slaFilter]} onClear={() => setSlaFilter('ALL')} />}
            {techFilter && <Chip label={techName(techFilter) || 'Technicien'} onClear={() => setTechFilter(null)} />}
            {splitterFilter && <Chip label={`Splitter ${splitterFilter}`} onClear={() => setSplitterFilter(null)} />}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Aucun ticket ne correspond.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(ticket => {
              const slaLabel = formatSLADisplay(ticket.slaRemainingHours, ticket.slaStatus).label;
              const rail = ticket.isClosed ? 'bg-emerald-400' : ticket.slaStatus === 'EXPIRED' ? 'bg-rose-500' : ticket.slaStatus === 'WARNING' ? 'bg-amber-400' : 'bg-slate-200';
              return (
                <div key={ticket.id} className="relative pl-4 pr-3 py-2.5 flex flex-col md:flex-row md:items-start gap-2 md:gap-4 hover:bg-slate-50/60">
                  <span className={`absolute left-0 top-0 bottom-0 w-1 ${groupSize(ticket) > 1 && !ticket.isClosed ? 'bg-brand-orange-500' : rail}`} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button onClick={() => onOpenTicketHistory(ticket)} className="font-mono font-bold text-sm text-slate-900 hover:underline">{ticket.ticketNumber}</button>
                      <StatusPill status={ticket.currentStatus} />
                      {!ticket.isClosed && (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${ticket.slaStatus === 'EXPIRED' ? 'bg-rose-50 text-rose-700' : ticket.slaStatus === 'WARNING' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                          {slaLabel}
                        </span>
                      )}
                      <ImportOutcomeBadge ticket={ticket} />
                      <SplitterBadge ticket={ticket} groupSize={groupSize(ticket)} />
                      <ManualTicketBadge ticket={ticket} />
                    </div>
                    <div className="text-xs text-slate-600 truncate">
                      <b className="text-slate-900">{ticket.clientName}</b> · {ticket.clientPhone} · <b>{ticket.rawZoneText}</b> <span className="text-slate-400">· {ticket.clientAddress}</span>
                    </div>
                    {ticket.description && <div className="text-xs text-violet-900">📝 {ticket.description}</div>}
                    {ticket.currentStatus === 'LITIGE' && (
                      <div className="text-xs text-rose-800">
                        <b>{ticket.lastLitigeReasonLabel}</b>
                        {ticket.lastLitigeRdvDate && ` · RDV ${formatCasablancaDateTime(ticket.lastLitigeRdvDate)}`}
                        {ticket.lastLitigeNeedsContact && <span className="ml-1.5 font-bold text-blue-800 bg-blue-100 px-1.5 rounded">📞 Nouveau numéro demandé</span>}
                        {ticket.lastLitigeNotes && <span className="italic"> · « {ticket.lastLitigeNotes} »</span>}
                      </div>
                    )}
                    <NfSummary ticket={ticket} onOpen={() => onOpenTicketHistory(ticket)} />
                    <SuspendedNotice ticket={ticket} onRelaunch={() => setLitigeModalTicket(ticket)} />
                  </div>
                  <div className="flex items-center gap-3 md:w-64 md:justify-end shrink-0 text-xs">
                    <div className="md:text-right">
                      <div className="font-bold text-slate-900">{techName(ticket.currentAssignedTechId) || <span className="text-slate-400 font-normal">Non affecté</span>}</div>
                      <div className="text-[11px] text-slate-400">màj {formatCasablancaTimeOnly(ticket.lastEventAt || ticket.updatedAt)}</div>
                    </div>
                    {ticket.currentStatus === 'LITIGE' && (
                      <button onClick={() => setLitigeModalTicket(ticket)} className="px-3 py-1.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg">Traiter</button>
                    )}
                    <button onClick={() => onOpenTicketHistory(ticket)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg" title="Historique">
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <LitigeResolutionModal ticket={litigeModalTicket} actorName={currentUser.name} onClose={() => setLitigeModalTicket(null)} onSuccess={() => {}} />
    </div>
  );
};

const SLA_TONES = {
  rose: { idle: 'text-rose-600 bg-rose-50', active: 'bg-rose-600 text-white border-rose-600' },
  amber: { idle: 'text-amber-700 bg-amber-50', active: 'bg-amber-500 text-white border-amber-500' },
  emerald: { idle: 'text-emerald-700 bg-emerald-50', active: 'bg-emerald-600 text-white border-emerald-600' },
};

const SlaTile: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; tone: keyof typeof SLA_TONES; label: string; value: number }> =
  ({ active, onClick, icon, tone, label, value }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${active ? SLA_TONES[tone].active : 'bg-white border-slate-200 hover:bg-slate-50'}`}
    >
      <span className={`hidden sm:flex w-9 h-9 rounded-lg items-center justify-center shrink-0 ${active ? 'bg-white/20' : SLA_TONES[tone].idle}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xl font-bold tabular-nums leading-none">{value}</span>
        <span className={`block text-[11px] mt-1 leading-tight ${active ? 'text-white/80' : 'text-slate-500'}`}>{label}</span>
      </span>
    </button>
  );

const Chip: React.FC<{ label: string; onClear: () => void }> = ({ label, onClear }) => (
  <span className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-white border border-slate-200 font-semibold text-slate-700">
    {label}
    <button onClick={onClear} className="p-0.5 rounded-full hover:bg-slate-100" aria-label={`Retirer le filtre ${label}`}><X className="w-3 h-3" /></button>
  </span>
);
