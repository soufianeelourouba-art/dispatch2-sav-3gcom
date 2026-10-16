import React, { useState, useMemo } from 'react';
import { Ticket, Technician, User, TechnicalZone, SLAStatus } from '../../types';
import { store } from '../../services/storage';
import { formatCasablancaDateTime, formatSLADisplay } from '../../domain/format';
import { calculateDispatchProposals } from '../../services/dispatchEngine';
import { telegramGateway } from '../../services/telegramSimulator';
import { LitigeResolutionModal } from './LitigeResolutionModal';
import { ManualTicketModal } from '../tickets/ManualTicketModal';
import { SplitterBadge, ManualTicketBadge, NfSummary, SuspendedNotice } from '../tickets/TicketBadges';
import { SplitterIncidentsPanel } from '../tickets/SplitterIncidentsPanel';
import { splitterKey, groupBySplitter } from '../../domain/splitter';
import { 
  Send, 
  RotateCcw, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle, 
  ArrowRight, 
  FileText, 
  Search, 
  Filter,
  UserCheck,
  AlertTriangle,
  Clock,
  Flame,
  ShieldAlert,
  ChevronDown,
  Sparkles,
  Cable,
  Plus,
  X
} from 'lucide-react';

interface DispatchViewProps {
  currentUser: User;
  onOpenTicketHistory: (ticket: Ticket) => void;
  onNavigateToImport: () => void;
  onNavigateToSuivi?: () => void;
}

export const DispatchView: React.FC<DispatchViewProps> = ({
  currentUser,
  onOpenTicketHistory,
  onNavigateToImport,
  onNavigateToSuivi,
}) => {
  const userSectors = store.getSectors(currentUser);
  const [selectedSectorId, setSelectedSectorId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewScope, setViewScope] = useState<'PENDING_DISPATCH' | 'ALREADY_SENT' | 'SUSPENDED' | 'ALL'>('PENDING_DISPATCH');
  const [activeSlaFilter, setActiveSlaFilter] = useState<'ALL' | 'OVERDUE' | 'CRITICAL' | 'LITIGES' | 'SPLITTER'>('ALL');
  const [splitterFilter, setSplitterFilter] = useState<string | null>(null);
  const [isManualTicketOpen, setIsManualTicketOpen] = useState(false);
  const [manualCreatedMsg, setManualCreatedMsg] = useState<string | null>(null);
  const [selectedTechChanges, setSelectedTechChanges] = useState<Record<string, string>>({});
  const [isSuccessSent, setIsSuccessSent] = useState(false);
  const [justSentCount, setJustSentCount] = useState<number>(0);
  const [litigeModalTicket, setLitigeModalTicket] = useState<Ticket | null>(null);

  const [, setStoreVersion] = useState(0);

  // Subscribe directly to store for real-time reactivity
  React.useEffect(() => {
    const unsub = store.subscribe(() => setStoreVersion(v => v + 1));
    return () => unsub();
  }, []);

  const tickets = store.getTickets(currentUser, selectedSectorId);
  const technicians = store.getTechnicians(currentUser, selectedSectorId).filter(t => t.isActive);

  // Tickets eligible for dispatch (§5: PENDING, PROPOSED, TO_ASSIGN, ZONE_TO_MAP, REOPENED)
  const dispatchableTickets = useMemo(() => {
    return tickets.filter(t => ['PROPOSED', 'TO_ASSIGN', 'ZONE_TO_MAP', 'REOPENED'].includes(t.currentStatus));
  }, [tickets]);

  // Tickets already sent today
  const alreadySentTickets = useMemo(() => {
    return tickets.filter(t => ['ASSIGNED', 'COMPLETED', 'LITIGE'].includes(t.currentStatus));
  }, [tickets]);

  // SLA Counter metrics
  const overdueTickets = useMemo(() => tickets.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed), [tickets]);
  const criticalTickets = useMemo(() => tickets.filter(t => t.slaStatus === 'WARNING' && !t.isClosed), [tickets]);
  const litigeTickets = useMemo(() => tickets.filter(t => t.currentStatus === 'LITIGE'), [tickets]);

  // Splitter incidents: open tickets sharing a splitter (same sector) — one intervention for all
  const splitterGroups = useMemo(() => groupBySplitter(tickets), [tickets]);
  const splitterGroupSize = useMemo(() => {
    const sizes = new Map<string, number>();
    splitterGroups.forEach(g => sizes.set(g.key, g.openCount));
    return (ticket: Ticket) => {
      const key = splitterKey(ticket);
      return key ? sizes.get(key) || 1 : 1;
    };
  }, [splitterGroups]);

  // Run dispatch engine on dispatchable tickets for the selected sector scope
  const simulationResult = useMemo(() => {
    return calculateDispatchProposals(
      dispatchableTickets, 
      // "All my sectors": no sector restriction — technicians are already limited to the
      // orienteur's sectors and each ticket is matched on its own zone.
      selectedSectorId !== 'ALL' ? selectedSectorId : undefined
    );
  }, [dispatchableTickets, selectedSectorId]);

  const proposalsMap = useMemo(() => {
    const map = new Map<string, { techId: string | null; techName: string | null; rationale: string; isSecondVisit: boolean }>();
    simulationResult.proposals.forEach(p => {
      map.set(p.ticketId, {
        techId: p.technicianId,
        techName: p.technicianName,
        rationale: p.rationale,
        isSecondVisit: p.isSecondVisit,
      });
    });
    return map;
  }, [simulationResult]);

  // Count unassigned tickets
  const unassignedTickets = useMemo(() => {
    return dispatchableTickets.filter(ticket => {
      const overriddenTechId = selectedTechChanges[ticket.id];
      const proposed = proposalsMap.get(ticket.id);
      const chosenTechId = overriddenTechId !== undefined ? overriddenTechId : proposed?.techId;
      return !chosenTechId;
    });
  }, [dispatchableTickets, selectedTechChanges, proposalsMap]);

  // Auto-assign any unassigned tickets to least-loaded active technicians
  const handleAutoAssignAllRemaining = () => {
    if (technicians.length === 0) return;
    const updates: Record<string, string> = { ...selectedTechChanges };
    
    // Sort technicians by current assigned count
    const techCounts: Record<string, number> = {};
    technicians.forEach(t => {
      techCounts[t.id] = tickets.filter(tk => tk.currentAssignedTechId === t.id && !tk.isClosed).length;
    });

    unassignedTickets.forEach(ticket => {
      // Find technician with minimum load
      const sortedTechs = [...technicians].sort((a, b) => (techCounts[a.id] || 0) - (techCounts[b.id] || 0));
      const chosen = sortedTechs[0];
      if (chosen) {
        updates[ticket.id] = chosen.id;
        techCounts[chosen.id] = (techCounts[chosen.id] || 0) + 1;
      }
    });

    setSelectedTechChanges(updates);
  };

  // Litiges accepted by the orienteur, waiting to be sent back (earliest RDV first)
  const suspendedTickets = useMemo(
    () => tickets
      .filter(t => t.currentStatus === 'SUSPENDED')
      .sort((a, b) => (a.lastLitigeRdvDate || '9999').localeCompare(b.lastLitigeRdvDate || '9999')),
    [tickets]
  );

  // Base list depending on view scope
  const baseList = useMemo(() => {
    if (viewScope === 'PENDING_DISPATCH') {
      return dispatchableTickets;
    } else if (viewScope === 'ALREADY_SENT') {
      return alreadySentTickets;
    } else if (viewScope === 'SUSPENDED') {
      return suspendedTickets;
    }
    return tickets;
  }, [viewScope, dispatchableTickets, alreadySentTickets, suspendedTickets, tickets]);

  // Filtered tickets
  const displayedTickets = useMemo(() => {
    let list = [...baseList];

    if (activeSlaFilter === 'OVERDUE') {
      list = list.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed);
    } else if (activeSlaFilter === 'CRITICAL') {
      list = list.filter(t => t.slaStatus === 'WARNING' && !t.isClosed);
    } else if (activeSlaFilter === 'LITIGES') {
      list = list.filter(t => t.currentStatus === 'LITIGE');
    } else if (activeSlaFilter === 'SPLITTER') {
      list = list.filter(t => splitterGroupSize(t) > 1);
    }

    if (splitterFilter) {
      list = list.filter(t => t.splitterRef === splitterFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.clientPhone.toLowerCase().includes(q) ||
        t.rawZoneText.toLowerCase().includes(q) ||
        (t.splitterRef || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }

    // Sort order: open first, splitter incidents (biggest first, tickets kept together), then SLA
    return list.sort((a, b) => {
      if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
      const ga = splitterGroupSize(a), gb = splitterGroupSize(b);
      if (ga !== gb) return gb - ga;
      if (ga > 1) {
        const byKey = (splitterKey(a) || '').localeCompare(splitterKey(b) || '');
        if (byKey !== 0) return byKey;
      }
      return a.slaRemainingHours - b.slaRemainingHours;
    });
  }, [baseList, activeSlaFilter, searchQuery, splitterFilter, splitterGroupSize]);

  // Choosing a technician for a splitter ticket applies to every pending ticket of that splitter
  const handleManualReassign = (ticketId: string, newTechId: string) => {
    const ticket = dispatchableTickets.find(t => t.id === ticketId);
    const key = ticket ? splitterKey(ticket) : null;
    const siblings = key ? dispatchableTickets.filter(t => splitterKey(t) === key) : [];
    setSelectedTechChanges(prev => {
      const next = { ...prev, [ticketId]: newTechId };
      siblings.forEach(t => { next[t.id] = newTechId; });
      return next;
    });
  };

  const handleValidateAndSend = () => {
    const assignments: { ticketId: string; technicianId: string; technicianName: string }[] = [];

    dispatchableTickets.forEach(ticket => {
      const overriddenTechId = selectedTechChanges[ticket.id];
      const proposed = proposalsMap.get(ticket.id);

      const targetTechId = overriddenTechId !== undefined ? overriddenTechId : proposed?.techId;
      if (targetTechId) {
        const tech = technicians.find(t => t.id === targetTechId);
        if (tech) {
          assignments.push({
            ticketId: ticket.id,
            technicianId: tech.id,
            technicianName: tech.fullName,
          });

          telegramGateway.queueTicketDispatch(ticket, tech.id, tech.fullName);
        }
      }
    });

    if (assignments.length === 0) {
      if (unassignedTickets.length > 0) {
        alert(`${unassignedTickets.length} ticket(s) n'ont pas de technicien sélectionné. Veuillez leur affecter un technicien ou cliquer sur 'Affecter automatiquement'.`);
      } else {
        alert('Aucun ticket sélectionné avec technicien valide.');
      }
      return;
    }

    store.validateDispatch(assignments, currentUser.name);
    setSelectedTechChanges({});
    setJustSentCount(assignments.length);
    setIsSuccessSent(true);

    // If all dispatchable tickets have been sent, or user has onNavigateToSuivi
    setTimeout(() => {
      setIsSuccessSent(false);
    }, 6000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {userSectors.length > 1 ? (
              <div className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-800">Secteur actif :</span>
                <select
                  value={selectedSectorId}
                  onChange={e => setSelectedSectorId(e.target.value)}
                  className="bg-white border border-emerald-300 rounded-lg px-2 py-0.5 text-xs font-bold text-emerald-900 focus:outline-none"
                >
                  <option value="ALL">Tous mes secteurs ({userSectors.length})</option>
                  {userSectors.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Secteur {userSectors[0]?.name || 'Périmètre SAV'}
              </span>
            )}
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">Contrat SAV Maroc Telecom</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Pilotage & Priorité SLA des Interventions
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Engagement 24h strict : les tickets dépassés (HD) ou proches de l'échéance sont automatiquement placés en tête de file.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => setIsManualTicketOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Créer un ticket</span>
          </button>
          {isSuccessSent && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-3.5 py-2 rounded-xl border border-emerald-200 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{justSentCount} ticket(s) validés et transmis sur Telegram !</span>
            </div>
          )}

          <button
            onClick={handleValidateAndSend}
            disabled={dispatchableTickets.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            <span>Valider le dispatch ({dispatchableTickets.length} prêts)</span>
          </button>
        </div>
      </div>

      {/* SLA & HD Alert Dashboard Strip (§2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Overdue HD Card */}
        <button
          onClick={() => setActiveSlaFilter(activeSlaFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeSlaFilter === 'OVERDUE'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-rose-600" />
              <span>Retard Critique HD (&gt; 24h)</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 font-bold font-mono text-xs flex items-center justify-center">
              {overdueTickets.length}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {overdueTickets.length} ticket(s)
          </div>
          <span className="text-[11px] text-rose-600 block mt-1 font-medium">
            Heures Dépassées (Pénalités Maroc Telecom)
          </span>
        </button>

        {/* Warning Card (< 6h) */}
        <button
          onClick={() => setActiveSlaFilter(activeSlaFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeSlaFilter === 'CRITICAL'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>SLA Imminent (&lt; 6h restantes)</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold font-mono text-xs flex items-center justify-center">
              {criticalTickets.length}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {criticalTickets.length} ticket(s)
          </div>
          <span className="text-[11px] text-amber-700 block mt-1 font-medium">
            À finaliser avant la fin de la vacation
          </span>
        </button>

        {/* Litiges Card */}
        <button
          onClick={() => setActiveSlaFilter(activeSlaFilter === 'LITIGES' ? 'ALL' : 'LITIGES')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeSlaFilter === 'LITIGES'
              ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-200'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-800 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-sky-600" />
              <span>Litiges Signalés (LC)</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold font-mono text-xs flex items-center justify-center">
              {litigeTickets.length}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {litigeTickets.length} dossier(s)
          </div>
          <span className="text-[11px] text-sky-600 block mt-1 font-medium">
            À réorienter ou valider par l'orienteur
          </span>
        </button>

        {/* Splitter incidents Card */}
        <button
          onClick={() => setActiveSlaFilter(activeSlaFilter === 'SPLITTER' ? 'ALL' : 'SPLITTER')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeSlaFilter === 'SPLITTER'
              ? 'bg-brand-orange-50 border-brand-orange-500 ring-2 ring-brand-orange-400/40'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-orange-600 flex items-center gap-1.5">
              <Cable className="w-4 h-4" />
              <span>Incidents splitter</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-brand-orange-50 text-brand-orange-600 font-bold font-mono text-xs flex items-center justify-center">
              {splitterGroups.length}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {splitterGroups.reduce((n, g) => n + g.openCount, 0)} ticket(s)
          </div>
          <span className="text-[11px] text-brand-orange-600 block mt-1 font-medium">
            Prioritaires : une intervention par splitter
          </span>
        </button>
      </div>

      {manualCreatedMsg && (
        <div className="bg-violet-50 border border-violet-200 p-3.5 rounded-2xl text-xs text-violet-900 font-semibold flex items-center justify-between gap-3">
          <span>{manualCreatedMsg}</span>
          <button onClick={() => setManualCreatedMsg(null)} className="text-violet-500 hover:text-violet-800" aria-label="Fermer"><X className="w-4 h-4" /></button>
        </div>
      )}

      <SplitterIncidentsPanel
        tickets={tickets}
        technicians={technicians}
        sectors={userSectors}
        onSelectSplitter={ref => { setSplitterFilter(ref); setViewScope('ALL'); }}
      />

      {splitterFilter && (
        <div className="flex items-center justify-between gap-3 bg-brand-orange-50 border border-brand-orange-400/50 px-4 py-2.5 rounded-xl text-xs">
          <span className="font-semibold text-slate-800">Filtre : tickets du splitter <b className="font-mono">{splitterFilter}</b></span>
          <button onClick={() => setSplitterFilter(null)} className="font-bold text-brand-orange-600 hover:underline">Retirer le filtre</button>
        </div>
      )}

      {/* Scope Toggles (§1: "quand je clique sur valider la liste reste toujours visible en bas") */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto text-xs font-semibold">
          <button
            onClick={() => setViewScope('PENDING_DISPATCH')}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              viewScope === 'PENDING_DISPATCH' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            En attente de dispatch ({dispatchableTickets.length})
          </button>
          <button
            onClick={() => setViewScope('ALREADY_SENT')}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              viewScope === 'ALREADY_SENT' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Déjà transmis au terrain ({alreadySentTickets.length})
          </button>
          <button
            onClick={() => setViewScope('SUSPENDED')}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              viewScope === 'SUSPENDED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⏸ Suspendus ({suspendedTickets.length})
          </button>
          <button
            onClick={() => setViewScope('ALL')}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              viewScope === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tous les tickets ({tickets.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher ticket, client, tel..."
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Success banner after validation */}
      {isSuccessSent && (
        <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="font-bold text-emerald-950 text-xs">
                {justSentCount} intervention(s) validée(s) et transmise(s) aux techniciens sur Telegram !
              </div>
              <div className="text-[11px] text-emerald-800">
                Les techniciens ont reçu leurs notifications d'intervention. Suivez leur progression et les SLA HD en temps réel.
              </div>
            </div>
          </div>
          {onNavigateToSuivi && (
            <button
              onClick={onNavigateToSuivi}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl transition-colors shrink-0 shadow-xs"
            >
              <span>Passer au Suivi en direct</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Unassigned tickets alert banner if any remain */}
      {viewScope === 'PENDING_DISPATCH' && unassignedTickets.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-950 text-xs">
                {unassignedTickets.length} ticket(s) en attente d'affectation (non inclus dans le dispatch)
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5">
                Ces tickets n'ont pas de technicien proposé (zone technique non reconnue ou sans technicien qualifié). Affectez un technicien manuellement ci-dessous ou utilisez l'attribution automatique pour les valider.
              </div>
            </div>
          </div>
          <button
            onClick={handleAutoAssignAllRemaining}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-200 rounded-xl transition-colors shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Affecter automatiquement au moins chargé</span>
          </button>
        </div>
      )}

      {/* Zero State if Pending Dispatch Queue is Cleared (§1) */}
      {viewScope === 'PENDING_DISPATCH' && dispatchableTickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            File de dispatch vide : Tous les tickets ont été validés et transmis !
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Les interventions ont été envoyées sur Telegram aux techniciens. Suivez leur avancement minute par minute sur l'écran de suivi en direct.
          </p>
          <div className="flex items-center justify-center gap-3 mt-5">
            {onNavigateToSuivi && (
              <button
                onClick={onNavigateToSuivi}
                className="px-4 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl transition-colors shadow-xs"
              >
                Aller au suivi en direct
              </button>
            )}
            <button
              onClick={() => setViewScope('ALREADY_SENT')}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Voir les tickets transmis ({alreadySentTickets.length})
            </button>
            <button
              onClick={onNavigateToImport}
              className="px-4 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
            >
              Importer un nouveau fichier
            </button>
          </div>
        </div>
      ) : displayedTickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
          Aucun ticket ne correspond aux critères de recherche actuels.
        </div>
      ) : (
        /* Ticket Cards */
        <div className="space-y-3">
          {displayedTickets.map(ticket => {
            const proposed = proposalsMap.get(ticket.id);
            const isSecondVisit = ticket.visitCount > 1;
            const currentChoice = selectedTechChanges[ticket.id] !== undefined 
              ? selectedTechChanges[ticket.id] 
              : (ticket.currentAssignedTechId || proposed?.techId || '');
            const assignedTech = technicians.find(t => t.id === currentChoice);
            const slaDisplay = formatSLADisplay(ticket.slaRemainingHours, ticket.slaStatus);

            return (
              <div
                key={ticket.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md ${
                  splitterGroupSize(ticket) > 1 && !ticket.isClosed ? 'border-brand-orange-400 border-l-4' :
                  ticket.slaStatus === 'EXPIRED' && !ticket.isClosed ? 'border-rose-300 ring-1 ring-rose-200' :
                  ticket.slaStatus === 'WARNING' && !ticket.isClosed ? 'border-amber-300' :
                  ticket.currentStatus === 'LITIGE' ? 'border-sky-300' :
                  'border-slate-200/90'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  
                  {/* Column 1: Ticket identity, Client and SLA indicator */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {ticket.ticketNumber}
                      </span>

                      {/* SLA HD Badge */}
                      {!ticket.isClosed && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono inline-flex items-center gap-1 ${
                          ticket.slaStatus === 'EXPIRED' 
                            ? 'bg-rose-100 text-rose-800' 
                            : ticket.slaStatus === 'WARNING'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}>
                          <Clock className="w-3 h-3" />
                          <span>SLA 24h : {slaDisplay.label}</span>
                        </span>
                      )}

                      {isSecondVisit && (
                        <span className="bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          {ticket.visitCount}e passage (SAV)
                        </span>
                      )}

                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        ticket.currentStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                        ticket.currentStatus === 'LITIGE' ? 'bg-rose-100 text-rose-800' :
                        ticket.currentStatus === 'REOPENED' ? 'bg-blue-100 text-blue-800' :
                        ticket.currentStatus === 'SUSPENDED' ? 'bg-slate-200 text-slate-800' :
                        ticket.currentStatus === 'ASSIGNED' ? 'bg-slate-100 text-slate-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {ticket.currentStatus === 'COMPLETED' ? '✓ NF (Normalisé)' :
                         ticket.currentStatus === 'LITIGE' ? '⚠️ Litige Client' :
                         ticket.currentStatus === 'REOPENED' ? '🔄 Réouvert mise à jour' :
                         ticket.currentStatus === 'SUSPENDED' ? '⏸ Suspendu' :
                         ticket.currentStatus === 'ASSIGNED' ? 'Transmis au technicien' :
                         'En attente dispatch'}
                      </span>

                      <SplitterBadge ticket={ticket} groupSize={splitterGroupSize(ticket)} />
                      <ManualTicketBadge ticket={ticket} />
                    </div>

                    {ticket.description && (
                      <div className="text-xs text-violet-900 bg-violet-50 rounded-lg px-2.5 py-1.5">📝 {ticket.description}</div>
                    )}

                    <NfSummary ticket={ticket} onOpen={() => onOpenTicketHistory(ticket)} />
                    <SuspendedNotice ticket={ticket} onRelaunch={() => setLitigeModalTicket(ticket)} />

                    <div className="text-xs space-y-0.5">
                      <div className="font-bold text-slate-900 text-sm">
                        {ticket.clientName}
                        <span className="font-normal text-slate-500 font-mono text-xs ml-2">
                          (Réf : {ticket.clientNumber}) · 📞 {ticket.clientPhone}
                        </span>
                      </div>
                      <div className="text-slate-600 flex items-center gap-1.5">
                        <span>{ticket.clientAddress}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-semibold text-slate-800">Zone : {ticket.rawZoneText}</span>
                      </div>
                    </div>

                    {ticket.currentStatus === 'LITIGE' && (
                      <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-900 flex items-center justify-between">
                        <div>
                          <b>Litige signalé :</b> {ticket.lastLitigeReasonLabel}
                          {ticket.lastLitigeRdvDate && (
                            <span className="ml-2 font-mono text-[11px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                              RDV : {formatCasablancaDateTime(ticket.lastLitigeRdvDate)}
                            </span>
                          )}
                          {ticket.lastLitigeNeedsContact && (
                            <span className="ml-2 text-[11px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                              📞 Nouveau numéro demandé
                            </span>
                          )}
                          {ticket.lastLitigeNotes && <div className="mt-1 text-rose-800 italic">« {ticket.lastLitigeNotes} »</div>}
                        </div>
                        <button
                          onClick={() => setLitigeModalTicket(ticket)}
                          className="px-3 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors shrink-0"
                        >
                          Traiter le litige
                        </button>
                      </div>
                    )}

                    {proposed?.rationale && ticket.currentStatus !== 'COMPLETED' && (
                      <div className="text-[11px] text-slate-500 italic">
                        Suggestion moteur : {proposed.rationale}
                      </div>
                    )}
                  </div>

                  {/* Column 2: Technician assignment selector & Action buttons */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-end gap-3 shrink-0">
                    <div className="w-full sm:w-60">
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Technicien affecté :
                      </label>
                      <select
                        value={currentChoice}
                        onChange={e => handleManualReassign(ticket.id, e.target.value)}
                        disabled={ticket.isClosed}
                        className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="">-- Choisir un technicien --</option>
                        {technicians.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.fullName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      {ticket.currentStatus === 'LITIGE' && (
                        <button
                          onClick={() => setLitigeModalTicket(ticket)}
                          className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-xl transition-colors"
                        >
                          Traiter litige
                        </button>
                      )}

                      <button
                        onClick={() => onOpenTicketHistory(ticket)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        Historique
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      <ManualTicketModal
        isOpen={isManualTicketOpen}
        currentUser={currentUser}
        onClose={() => setIsManualTicketOpen(false)}
        onCreated={(number, sent) => setManualCreatedMsg(
          sent ? `Ticket ${number} créé et envoyé au technicien sur Telegram.` : `Ticket ${number} créé : il attend dans la file de dispatch.`
        )}
      />

      {/* Litige Resolution Modal for Dispatcher */}
      <LitigeResolutionModal
        ticket={litigeModalTicket}
        actorName={currentUser.name}
        onClose={() => setLitigeModalTicket(null)}
        onSuccess={() => {}}
      />

    </div>
  );
};
