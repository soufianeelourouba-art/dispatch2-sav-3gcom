import React, { useState, useMemo } from 'react';
import { Ticket, Technician, User } from '../../types';
import { store } from '../../services/storage';
import { formatCasablancaDateTime, formatSLADisplay } from '../../domain/format';
import { calculateDispatchProposals } from '../../services/dispatchEngine';
import { telegramGateway } from '../../services/telegramSimulator';
import { LitigeResolutionModal } from './LitigeResolutionModal';
import { ManualTicketModal } from '../tickets/ManualTicketModal';
import { SplitterBadge, ManualTicketBadge, NfSummary, SuspendedNotice, ImportOutcomeBadge } from '../tickets/TicketBadges';
import { SplitterIncidentsPanel } from '../tickets/SplitterIncidentsPanel';
import { splitterKey, groupBySplitter } from '../../domain/splitter';
import { isInDailyScope } from '../../domain/dailyScope';
import { assignmentWarnings, technicianLoads, LOAD_ALERT, LOAD_WARNING } from '../../domain/assignment';
import { CheckCircle2, ArrowRight, Search, AlertTriangle, Clock, Flame, Sparkles, Cable, Plus, X, Send, Users, History } from 'lucide-react';

interface DispatchViewProps {
  currentUser: User;
  onOpenTicketHistory: (ticket: Ticket) => void;
  onNavigateToImport: () => void;
  onNavigateToSuivi?: () => void;
}

type Tab = 'TODO' | 'LITIGES' | 'SUSPENDED' | 'IN_PROGRESS' | 'DONE' | 'ALL';
const TODO_STATUSES = ['TO_ASSIGN', 'PROPOSED', 'ZONE_TO_MAP'];
const NONE = '__none__';

// Short label of why the engine proposed this technician (full text in the tooltip)
function proposalTag(score?: number): string {
  if (score === undefined) return '';
  if (score >= 120) return 'Même technicien (reprise / retour)';
  if (score >= 110) return 'Même splitter';
  if (score >= 100) return '2e visite : même technicien';
  if (score >= 90) return '2e visite : autre technicien';
  if (score >= 50) return 'Zone + charge';
  return '';
}

export const DispatchView: React.FC<DispatchViewProps> = ({
  currentUser,
  onOpenTicketHistory,
  onNavigateToImport,
  onNavigateToSuivi,
}) => {
  const userSectors = store.getSectors(currentUser);
  const [selectedSectorId, setSelectedSectorId] = useState<string>('ALL');
  const [tab, setTab] = useState<Tab>('TODO');
  const [searchQuery, setSearchQuery] = useState('');
  const [slaFilter, setSlaFilter] = useState<'ALL' | 'OVERDUE' | 'CRITICAL'>('ALL');
  const [techFilter, setTechFilter] = useState<string | null>(null); // technician id or NONE
  const [splitterFilter, setSplitterFilter] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({}); // ticketId → technician chosen by the orienteur
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTechId, setBulkTechId] = useState('');
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [isManualTicketOpen, setIsManualTicketOpen] = useState(false);
  const [manualCreatedMsg, setManualCreatedMsg] = useState<string | null>(null);
  const [litigeModalTicket, setLitigeModalTicket] = useState<Ticket | null>(null);
  const [, setStoreVersion] = useState(0);

  React.useEffect(() => {
    const unsub = store.subscribe(() => setStoreVersion(v => v + 1));
    return () => unsub();
  }, []);

  // Daily working set: received / handled today + everything still to handle (domain/dailyScope.ts)
  const allTickets = store.getTickets(currentUser, selectedSectorId);
  const tickets = allTickets.filter(t => isInDailyScope(t));
  const technicians = store.getTechnicians(currentUser, selectedSectorId).filter(t => t.isActive);

  const byTab: Record<Tab, Ticket[]> = {
    TODO: tickets.filter(t => TODO_STATUSES.includes(t.currentStatus)),
    LITIGES: tickets.filter(t => t.currentStatus === 'LITIGE'),
    SUSPENDED: allTickets
      .filter(t => t.currentStatus === 'SUSPENDED')
      .sort((a, b) => (a.lastLitigeRdvDate || '9999').localeCompare(b.lastLitigeRdvDate || '9999')),
    IN_PROGRESS: tickets.filter(t => t.currentStatus === 'ASSIGNED' || t.currentStatus === 'REOPENED'),
    DONE: tickets.filter(t => t.currentStatus === 'COMPLETED'),
    ALL: tickets,
  };
  const todo = byTab.TODO;
  const todoKey = todo.map(t => `${t.id}:${t.updatedAt}`).join('|');

  // Engine proposals for the tickets to assign
  const proposals = useMemo(() => {
    const result = calculateDispatchProposals(todo, selectedSectorId !== 'ALL' ? selectedSectorId : undefined);
    return new Map(result.proposals.map(p => [p.ticketId, p]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoKey, selectedSectorId]);

  const chosenTechOf = (ticket: Ticket): string | undefined => {
    const choice = choices[ticket.id];
    if (choice !== undefined) return choice || undefined;
    return proposals.get(ticket.id)?.technicianId || undefined;
  };

  // Load per technician: in progress + chosen now
  const loads = technicianLoads(technicians, allTickets, todo.map(t => chosenTechOf(t)));
  const loadOf = (techId: string) => loads.find(l => l.technician.id === techId)?.total || 0;
  const withoutTech = todo.filter(t => !chosenTechOf(t));
  const ready = todo.filter(t => chosenTechOf(t));

  // Splitter incidents (open tickets sharing a splitter)
  const splitterGroups = groupBySplitter(tickets);
  const groupSize = (ticket: Ticket) => {
    const key = splitterKey(ticket);
    return key ? splitterGroups.find(g => g.key === key)?.openCount || 1 : 1;
  };

  const overdue = tickets.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed).length;
  const critical = tickets.filter(t => t.slaStatus === 'WARNING' && !t.isClosed).length;

  // Rows of the current tab, filtered and sorted (splitter incidents, then SLA)
  let rows = [...byTab[tab]];
  if (slaFilter === 'OVERDUE') rows = rows.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed);
  if (slaFilter === 'CRITICAL') rows = rows.filter(t => t.slaStatus === 'WARNING' && !t.isClosed);
  if (splitterFilter) rows = rows.filter(t => t.splitterRef === splitterFilter);
  if (techFilter) {
    rows = tab === 'TODO'
      ? rows.filter(t => (chosenTechOf(t) || NONE) === techFilter)
      : rows.filter(t => t.currentAssignedTechId === techFilter);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    rows = rows.filter(t =>
      [t.ticketNumber, t.clientName, t.clientPhone, t.rawZoneText, t.splitterRef, t.description]
        .some(v => (v || '').toLowerCase().includes(q)));
  }
  if (tab !== 'SUSPENDED') {
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
  }

  // Choosing a technician for a splitter ticket applies to every ticket to assign on that splitter
  const choose = (ticketId: string, techId: string) => {
    const ticket = todo.find(t => t.id === ticketId);
    const key = ticket ? splitterKey(ticket) : null;
    setChoices(prev => {
      const next = { ...prev, [ticketId]: techId };
      if (key) todo.filter(t => splitterKey(t) === key).forEach(t => { next[t.id] = techId; });
      return next;
    });
  };

  const assignSelected = () => {
    if (!bulkTechId) return;
    setChoices(prev => {
      const next = { ...prev };
      selected.forEach(id => { next[id] = bulkTechId; });
      return next;
    });
    setSelected(new Set());
    setBulkTechId('');
  };

  // Tickets without technician → least loaded technician covering the zone (any if none covers it)
  const autoAssignRemaining = () => {
    if (technicians.length === 0) return;
    const counts = new Map(technicians.map(t => [t.id, loadOf(t.id)]));
    const next = { ...choices };
    withoutTech.forEach(ticket => {
      const covering = technicians.filter(t => ticket.technicalZoneId && t.zoneIds.includes(ticket.technicalZoneId));
      const pool = covering.length ? covering : technicians;
      const best = [...pool].sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0))[0];
      next[ticket.id] = best.id;
      counts.set(best.id, (counts.get(best.id) || 0) + 1);
    });
    setChoices(next);
    setTechFilter(null);
  };

  // Only tickets still to assign are sent (relaunched / already sent tickets are never re-sent)
  const validate = () => {
    if (ready.length === 0) return;
    if (withoutTech.length > 0 && !window.confirm(
      `${withoutTech.length} ticket(s) n'ont pas de technicien et resteront « À affecter ». Envoyer les ${ready.length} autres ?`)) {
      return;
    }
    const assignments = ready.flatMap(ticket => {
      const tech = technicians.find(t => t.id === chosenTechOf(ticket));
      if (!tech) return [];
      telegramGateway.queueTicketDispatch(ticket, tech.id, tech.fullName);
      return [{ ticketId: ticket.id, technicianId: tech.id, technicianName: tech.fullName }];
    });
    store.validateDispatch(assignments, currentUser.name);
    setChoices({});
    setSelected(new Set());
    setTechFilter(null);
    setSentCount(assignments.length);
  };

  const tabs: [Tab, string, number][] = [
    ['TODO', 'À affecter', byTab.TODO.length],
    ['LITIGES', 'Litiges', byTab.LITIGES.length],
    ['SUSPENDED', '⏸ Suspendus', byTab.SUSPENDED.length],
    ['IN_PROGRESS', 'Transmis', byTab.IN_PROGRESS.length],
    ['DONE', 'NF du jour', byTab.DONE.length],
    ['ALL', 'Tous', byTab.ALL.length],
  ];
  const allVisibleSelected = tab === 'TODO' && rows.length > 0 && rows.every(t => selected.has(t.id));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          {userSectors.length > 1 ? (
            <select
              value={selectedSectorId}
              onChange={e => { setSelectedSectorId(e.target.value); setChoices({}); setSelected(new Set()); setTechFilter(null); }}
              className="bg-emerald-50 border border-emerald-300 rounded-lg px-2 py-1 text-xs font-bold text-emerald-900"
            >
              <option value="ALL">Tous mes secteurs ({userSectors.length})</option>
              {userSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Secteur {userSectors[0]?.name || ''}
            </span>
          )}
          <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">Dispatch du jour</h1>
          <p className="text-[11px] text-slate-500">📅 Reçus ou traités aujourd'hui + tout ce qui reste à traiter des jours précédents.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsManualTicketOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl"
          >
            <Plus className="w-4 h-4" /> Créer un ticket
          </button>
          <button onClick={onNavigateToImport} className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl">
            Importer un fichier
          </button>
        </div>
      </div>

      {/* SLA alerts */}
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          onClick={() => setSlaFilter(slaFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
          className={`px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 border ${slaFilter === 'OVERDUE' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-800 border-rose-200'}`}
        >
          <Flame className="w-3.5 h-3.5" /> SLA dépassé (HD) : {overdue}
        </button>
        <button
          onClick={() => setSlaFilter(slaFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 border ${slaFilter === 'CRITICAL' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
        >
          <Clock className="w-3.5 h-3.5" /> Moins de 6 h : {critical}
        </button>
        {splitterGroups.length > 0 && (
          <span className="px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 border bg-brand-orange-50 text-brand-orange-600 border-brand-orange-400/40">
            <Cable className="w-3.5 h-3.5" /> Incidents splitter : {splitterGroups.length}
          </span>
        )}
      </div>

      {manualCreatedMsg && (
        <div className="bg-violet-50 border border-violet-200 p-3 rounded-xl text-xs text-violet-900 font-semibold flex items-center justify-between gap-3">
          <span>{manualCreatedMsg}</span>
          <button onClick={() => setManualCreatedMsg(null)} aria-label="Fermer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {sentCount !== null && (
        <div className="bg-emerald-50 border border-emerald-300 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {sentCount} intervention(s) envoyée(s) aux techniciens sur Telegram.
          </span>
          <div className="flex items-center gap-2">
            {onNavigateToSuivi && (
              <button onClick={onNavigateToSuivi} className="px-3 py-1.5 font-bold text-white bg-brand-navy-900 rounded-lg flex items-center gap-1">
                Suivi en direct <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => setSentCount(null)} aria-label="Fermer"><X className="w-4 h-4 text-emerald-700" /></button>
          </div>
        </div>
      )}

      <SplitterIncidentsPanel
        tickets={tickets}
        technicians={technicians}
        sectors={userSectors}
        onSelectSplitter={ref => { setSplitterFilter(ref); setTab('ALL'); }}
      />

      {/* Load per technician */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex flex-wrap items-center gap-1.5">
            <Users className="w-4 h-4" /> Charge par technicien
            <span className="font-normal normal-case tracking-normal text-slate-400">en cours + proposés maintenant · cliquez pour voir ses tickets</span>
          </h2>
          {techFilter && (
            <button onClick={() => setTechFilter(null)} className="text-xs font-bold text-brand-navy-700 hover:underline">Voir tous les techniciens</button>
          )}
        </div>
        {loads.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun technicien actif dans ce périmètre.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {loads.map(({ technician, inProgress, planned, total }) => (
              <button
                key={technician.id}
                onClick={() => setTechFilter(techFilter === technician.id ? null : technician.id)}
                className={`text-left p-2.5 rounded-xl border transition-colors ${techFilter === technician.id ? 'border-brand-navy-900 ring-2 ring-brand-navy-700/30 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 truncate">{technician.fullName}</span>
                  <span className={`text-sm font-bold font-mono ${total >= LOAD_ALERT ? 'text-rose-700' : total >= LOAD_WARNING ? 'text-amber-700' : 'text-slate-900'}`}>{total}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden flex">
                  <div className="bg-slate-400" style={{ width: `${Math.min(100, (inProgress / LOAD_ALERT) * 100)}%` }} />
                  <div
                    className={total >= LOAD_ALERT ? 'bg-rose-500' : total >= LOAD_WARNING ? 'bg-amber-500' : 'bg-emerald-500'}
                    style={{ width: `${Math.min(100, (planned / LOAD_ALERT) * 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {inProgress} en cours{planned > 0 && <b className="text-emerald-700"> · +{planned} à envoyer</b>}
                  {!technician.telegramChatId && <span className="text-amber-700"> · sans Telegram</span>}
                </div>
              </button>
            ))}
            {withoutTech.length > 0 && (
              <button
                onClick={() => { setTab('TODO'); setTechFilter(techFilter === NONE ? null : NONE); }}
                className={`text-left p-2.5 rounded-xl border ${techFilter === NONE ? 'border-amber-600 ring-2 ring-amber-300 bg-amber-50' : 'border-amber-300 bg-amber-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-900">Sans technicien</span>
                  <span className="text-sm font-bold font-mono text-amber-800">{withoutTech.length}</span>
                </div>
                <div className="text-[10px] text-amber-800 mt-2.5">zone inconnue ou non couverte</div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs, search, actions and rows */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 border-b border-slate-100">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(([id, label, count]) => (
              <button
                key={id}
                onClick={() => { setTab(id); setSelected(new Set()); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${tab === id ? 'bg-brand-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {label} <span className={tab === id ? 'text-white/70' : 'text-slate-400'}>({count})</span>
              </button>
            ))}
          </div>
          <div className="relative lg:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Ticket, client, téléphone, zone…"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2"
            />
          </div>
        </div>

        {tab === 'TODO' && todo.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {selected.size > 0 ? (
                <>
                  <b>{selected.size} sélectionné(s)</b>
                  <select value={bulkTechId} onChange={e => setBulkTechId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 font-semibold bg-white">
                    <option value="">Affecter à…</option>
                    {technicians.map(t => <option key={t.id} value={t.id}>{t.fullName} ({loadOf(t.id)})</option>)}
                  </select>
                  <button onClick={assignSelected} disabled={!bulkTechId} className="px-3 py-1.5 rounded-lg bg-brand-navy-900 text-white font-bold disabled:opacity-40">Appliquer</button>
                  <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">Annuler</button>
                </>
              ) : (
                <>
                  <span className="text-slate-600">
                    <b className="text-slate-900">{ready.length}</b> prêt(s) à envoyer
                    {withoutTech.length > 0 && <> · <b className="text-amber-700">{withoutTech.length} sans technicien</b></>}
                    <span className="hidden md:inline"> · cochez des lignes pour les affecter en groupe</span>
                  </span>
                  {withoutTech.length > 0 && (
                    <button onClick={autoAssignRemaining} className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Donner les sans-technicien au moins chargé
                    </button>
                  )}
                </>
              )}
            </div>
            <button
              onClick={validate}
              disabled={ready.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-40"
            >
              <Send className="w-4 h-4" /> Valider et envoyer ({ready.length})
            </button>
          </div>
        )}

        {splitterFilter && (
          <div className="flex items-center justify-between px-3 py-2 bg-brand-orange-50 text-xs border-b border-brand-orange-400/30">
            <span>Filtre : splitter <b className="font-mono">{splitterFilter}</b></span>
            <button onClick={() => setSplitterFilter(null)} className="font-bold text-brand-orange-600 hover:underline">Retirer</button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {tab === 'TODO' && todo.length === 0 ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                Rien à affecter : tous les tickets ont été transmis.
                {onNavigateToSuivi && (
                  <button onClick={onNavigateToSuivi} className="mt-1 px-3 py-1.5 text-xs font-bold text-white bg-brand-navy-900 rounded-lg">Aller au suivi en direct</button>
                )}
              </div>
            ) : 'Aucun ticket ne correspond.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tab === 'TODO' && (
              <label className="hidden md:flex items-center gap-3 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={allVisibleSelected}
                  onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(rows.map(t => t.id)))}
                />
                <span className="flex-1">Ticket · client · zone</span>
                <span className="w-72">Technicien</span>
              </label>
            )}
            {rows.map(ticket => (
              <DispatchRow
                key={ticket.id}
                ticket={ticket}
                selectable={tab === 'TODO'}
                technicians={technicians}
                chosenTechId={chosenTechOf(ticket)}
                proposalScore={proposals.get(ticket.id)?.priorityScore}
                proposalRationale={proposals.get(ticket.id)?.rationale}
                groupSize={groupSize(ticket)}
                loadOf={loadOf}
                isSelected={selected.has(ticket.id)}
                onToggle={() => setSelected(prev => {
                  const next = new Set(prev);
                  if (next.has(ticket.id)) next.delete(ticket.id); else next.add(ticket.id);
                  return next;
                })}
                onChoose={techId => choose(ticket.id, techId)}
                onHistory={() => onOpenTicketHistory(ticket)}
                onLitige={() => setLitigeModalTicket(ticket)}
              />
            ))}
          </div>
        )}
      </div>

      <ManualTicketModal
        isOpen={isManualTicketOpen}
        currentUser={currentUser}
        onClose={() => setIsManualTicketOpen(false)}
        onCreated={(number, sent) => setManualCreatedMsg(
          sent ? `Ticket ${number} créé et envoyé au technicien sur Telegram.` : `Ticket ${number} créé : il attend dans « À affecter ».`
        )}
      />
      <LitigeResolutionModal ticket={litigeModalTicket} actorName={currentUser.name} onClose={() => setLitigeModalTicket(null)} onSuccess={() => {}} />
    </div>
  );
};

// One ticket: compact line with its situation, the technician choice and the checks on that choice
const DispatchRow: React.FC<{
  ticket: Ticket;
  selectable: boolean;
  technicians: Technician[];
  chosenTechId?: string;
  proposalScore?: number;
  proposalRationale?: string;
  groupSize: number;
  loadOf: (techId: string) => number;
  isSelected: boolean;
  onToggle: () => void;
  onChoose: (techId: string) => void;
  onHistory: () => void;
  onLitige: () => void;
}> = ({ ticket, selectable, technicians, chosenTechId, proposalScore, proposalRationale, groupSize, loadOf, isSelected, onToggle, onChoose, onHistory, onLitige }) => {
  const toAssign = TODO_STATUSES.includes(ticket.currentStatus);
  const sla = formatSLADisplay(ticket.slaRemainingHours, ticket.slaStatus);
  // Load is shown in the panel and the select: no per-row load warning (it would repeat on every line)
  const warnings = toAssign ? assignmentWarnings(ticket, chosenTechId, technicians) : [];
  const assignedName = technicians.find(t => t.id === ticket.currentAssignedTechId)?.fullName || ticket.lastVisitedTechName;
  const tag = toAssign && chosenTechId ? proposalTag(proposalScore) : '';
  const covers = (t: Technician) => !!ticket.technicalZoneId && t.zoneIds.includes(ticket.technicalZoneId);
  // Technicians covering the zone first
  const options = [...technicians].sort((a, b) => Number(covers(b)) - Number(covers(a)) || a.fullName.localeCompare(b.fullName));
  const statusLabel: Record<string, string> = {
    ASSIGNED: 'Transmis', REOPENED: '🔄 Relancé', COMPLETED: '✓ NF', LITIGE: '⚠️ Litige', SUSPENDED: '⏸ Suspendu',
  };

  return (
    <div className={`px-3 py-2.5 flex flex-col md:flex-row md:items-start gap-2 md:gap-3 ${isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50/60'} ${groupSize > 1 && !ticket.isClosed ? 'border-l-4 border-brand-orange-400' : ''}`}>
      {selectable && (
        <input type="checkbox" checked={isSelected} onChange={onToggle} className="mt-1 w-4 h-4 shrink-0" aria-label={`Sélectionner ${ticket.ticketNumber}`} />
      )}

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={onHistory} className="font-mono font-bold text-sm text-slate-900 hover:underline" title="Historique">{ticket.ticketNumber}</button>
          {!ticket.isClosed && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${ticket.slaStatus === 'EXPIRED' ? 'bg-rose-100 text-rose-800' : ticket.slaStatus === 'WARNING' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
              {sla.label}
            </span>
          )}
          {!toAssign && statusLabel[ticket.currentStatus] && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">{statusLabel[ticket.currentStatus]}</span>
          )}
          <ImportOutcomeBadge ticket={ticket} />
          {ticket.visitCount > 1 && !ticket.importOutcome && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">{ticket.visitCount}e visite</span>
          )}
          <SplitterBadge ticket={ticket} groupSize={groupSize} />
          <ManualTicketBadge ticket={ticket} />
          {ticket.currentStatus === 'ZONE_TO_MAP' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">Zone à rattacher</span>}
        </div>
        <div className="text-xs text-slate-700 truncate">
          <b className="text-slate-900">{ticket.clientName}</b> · {ticket.clientPhone} · <span className="text-slate-500">{ticket.clientAddress}</span> · <b>{ticket.rawZoneText}</b>
        </div>
        {ticket.description && <div className="text-xs text-violet-900">📝 {ticket.description}</div>}

        {ticket.currentStatus === 'LITIGE' && (
          <div className="flex flex-wrap items-center gap-2 text-xs bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
            <span className="text-rose-900"><b>Litige :</b> {ticket.lastLitigeReasonLabel}{ticket.lastLitigeRdvDate && ` · RDV ${formatCasablancaDateTime(ticket.lastLitigeRdvDate)}`}</span>
            {ticket.lastLitigeNeedsContact && <span className="font-bold text-blue-800 bg-blue-100 px-1.5 rounded">📞 Nouveau numéro demandé</span>}
            {ticket.lastLitigeNotes && <span className="italic text-rose-800">« {ticket.lastLitigeNotes} »</span>}
          </div>
        )}
        <NfSummary ticket={ticket} onOpen={onHistory} />
        <SuspendedNotice ticket={ticket} onRelaunch={onLitige} />
      </div>

      <div className="md:w-72 shrink-0 space-y-1">
        {toAssign ? (
          <>
            <select
              value={chosenTechId || ''}
              onChange={e => onChoose(e.target.value)}
              className={`w-full text-xs font-semibold border rounded-lg px-2.5 py-2 ${chosenTechId ? 'bg-white border-slate-300 text-slate-900' : 'bg-amber-50 border-amber-300 text-amber-900'}`}
            >
              <option value="">— Choisir un technicien —</option>
              {options.map(t => (
                <option key={t.id} value={t.id}>
                  {t.fullName} · {loadOf(t.id)} en charge{covers(t) ? '' : ' · hors zone'}
                </option>
              ))}
            </select>
            {tag && <div className="text-[10px] text-slate-500" title={proposalRationale}>Proposé : {tag}</div>}
            {warnings.map((w, i) => (
              <div key={i} className={`text-[11px] leading-snug px-2 py-1 rounded-md border ${w.level === 'warning' ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-sky-50 text-sky-900 border-sky-200'}`}>
                {w.level === 'warning' && <AlertTriangle className="w-3 h-3 inline -mt-0.5 mr-1" />}{w.text}
              </div>
            ))}
          </>
        ) : (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-700">{assignedName ? <>👤 <b>{assignedName}</b></> : <span className="text-slate-400">—</span>}</span>
            <div className="flex gap-1.5">
              {ticket.currentStatus === 'LITIGE' && (
                <button onClick={onLitige} className="px-2.5 py-1 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg">Traiter</button>
              )}
              <button onClick={onHistory} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="Historique"><History className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
