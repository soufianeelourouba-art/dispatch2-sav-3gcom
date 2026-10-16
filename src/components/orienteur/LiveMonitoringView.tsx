import React, { useState, useMemo } from 'react';
import { Ticket, Technician, User } from '../../types';
import { store } from '../../services/storage';
import { formatCasablancaDateTime, formatCasablancaTimeOnly, formatSLADisplay } from '../../domain/format';
import { exportTicketsToExcel } from '../../services/excelExporter';
import { LitigeResolutionModal } from './LitigeResolutionModal';
import { SplitterBadge, ManualTicketBadge, NfSummary, SuspendedNotice } from '../tickets/TicketBadges';
import { SplitterIncidentsPanel } from '../tickets/SplitterIncidentsPanel';
import { splitterKey, groupBySplitter } from '../../domain/splitter';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  MapPin, 
  Phone, 
  Download, 
  Search, 
  Filter,
  UserCheck,
  RefreshCw,
  ExternalLink,
  Flame,
  Smartphone
} from 'lucide-react';

interface LiveMonitoringViewProps {
  currentUser: User;
  onOpenTicketHistory: (ticket: Ticket) => void;
  onOpenSimulator: () => void;
}

export const LiveMonitoringView: React.FC<LiveMonitoringViewProps> = ({
  currentUser,
  onOpenTicketHistory,
  onOpenSimulator,
}) => {
  const userSectors = store.getSectors(currentUser);
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [slaFilter, setSlaFilter] = useState<'ALL' | 'OVERDUE' | 'CRITICAL' | 'LITIGES' | 'ON_TIME'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('ALL');
  const [litigeModalTicket, setLitigeModalTicket] = useState<Ticket | null>(null);
  const [alertSuccessMsg, setAlertSuccessMsg] = useState<string | null>(null);
  const [, setStoreVersion] = useState(0);

  // Subscribe directly to store for real-time reactivity
  React.useEffect(() => {
    const unsub = store.subscribe(() => setStoreVersion(v => v + 1));
    return () => unsub();
  }, []);

  const tickets = store.getTickets(currentUser, selectedSectorFilter);
  const technicians = store.getTechnicians(currentUser, selectedSectorFilter).filter(t => t.isActive);

  // SLA Counter metrics (§2 & §5)
  const overdueTickets = useMemo(() => tickets.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed), [tickets]);
  const criticalTickets = useMemo(() => tickets.filter(t => t.slaStatus === 'WARNING' && !t.isClosed), [tickets]);
  const litigeTickets = useMemo(() => tickets.filter(t => t.currentStatus === 'LITIGE'), [tickets]);
  const onTimeTickets = useMemo(() => tickets.filter(t => t.slaStatus === 'ON_TIME' && !t.isClosed), [tickets]);

  // Inactivity threshold: tickets assigned > 1.5 hours without update
  const now = Date.now();
  const inactiveTickets = useMemo(() => {
    return tickets.filter(t => {
      if (t.currentStatus !== 'ASSIGNED' || t.isClosed) return false;
      const refTime = t.lastEventAt ? new Date(t.lastEventAt).getTime() : new Date(t.updatedAt).getTime();
      const diffHours = (now - refTime) / (1000 * 60 * 60);
      return diffHours >= 1.5;
    });
  }, [tickets, now]);

  // Real-time workload per technician
  const technicianLoads = useMemo(() => {
    return technicians.map(tech => {
      const techTickets = tickets.filter(t => t.currentAssignedTechId === tech.id);
      const completed = techTickets.filter(t => t.currentStatus === 'COMPLETED').length;
      const litige = techTickets.filter(t => t.currentStatus === 'LITIGE').length;
      const assigned = techTickets.filter(t => t.currentStatus === 'ASSIGNED' || t.currentStatus === 'REOPENED').length;
      const activeTotal = assigned;

      return {
        tech,
        completed,
        litige,
        assigned,
        activeTotal,
        totalToday: techTickets.length,
        isOverloaded: activeTotal >= 6,
      };
    });
  }, [technicians, tickets]);

  const [splitterFilter, setSplitterFilter] = useState<string | null>(null);
  const splitterGroupSize = useMemo(() => {
    const sizes = new Map<string, number>();
    groupBySplitter(tickets).forEach(g => sizes.set(g.key, g.openCount));
    return (ticket: Ticket) => {
      const key = splitterKey(ticket);
      return key ? sizes.get(key) || 1 : 1;
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    let list = [...tickets];

    if (splitterFilter) {
      list = list.filter(t => t.splitterRef === splitterFilter);
    }

    // SLA filter
    if (slaFilter === 'OVERDUE') {
      list = list.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed);
    } else if (slaFilter === 'CRITICAL') {
      list = list.filter(t => t.slaStatus === 'WARNING' && !t.isClosed);
    } else if (slaFilter === 'LITIGES') {
      list = list.filter(t => t.currentStatus === 'LITIGE');
    } else if (slaFilter === 'ON_TIME') {
      list = list.filter(t => t.slaStatus === 'ON_TIME' && !t.isClosed);
    }

    // Status filter
    if (selectedStatusFilter !== 'ALL') {
      list = list.filter(t => t.currentStatus === selectedStatusFilter);
    }

    // Technician filter
    if (selectedTechFilter !== 'ALL') {
      list = list.filter(t => t.currentAssignedTechId === selectedTechFilter);
    }

    // Search query
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

    // Open first, splitter incidents grouped on top, then HD (expired), critical, normal
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
  }, [tickets, slaFilter, selectedStatusFilter, selectedTechFilter, searchQuery, splitterFilter, splitterGroupSize]);

  const handleExport = () => {
    exportTicketsToExcel(filteredTickets, `suivi_interventions_${currentUser.sectorId || 'secteur'}.xlsx`);
  };

  const handlePingTechnician = (ticket: Ticket) => {
    if (!ticket.currentAssignedTechId) return;
    const tech = technicians.find(t => t.id === ticket.currentAssignedTechId);
    setAlertSuccessMsg(`Relance prioritaire envoyée à ${tech?.fullName || 'technicien'} pour le ticket ${ticket.ticketNumber} !`);
    setTimeout(() => setAlertSuccessMsg(null), 4000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {userSectors.length > 1 ? (
              <div className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-800">Secteur actif :</span>
                <select
                  value={selectedSectorFilter}
                  onChange={e => setSelectedSectorFilter(e.target.value)}
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
            Suivi Opérationnel & Traitement des Retards SLA HD
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Surveillance en temps réel des techniciens 3GCOM · Incitation prioritaire sur les dossiers Hors Délai (&gt; 24h)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Relance alert feedback */}
      {alertSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 p-3.5 rounded-2xl text-xs text-emerald-900 flex items-center gap-2 animate-in fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{alertSuccessMsg}</span>
        </div>
      )}

      {/* SLA & HD Alert Dashboard Strip (§2: Dashboard incitant au suivi des HD) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Overdue HD Card */}
        <button
          onClick={() => setSlaFilter(slaFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            slaFilter === 'OVERDUE'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-300 shadow-xs'
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
          <span className="text-[11px] text-rose-700 block mt-1 font-semibold">
            Pénalités Maroc Telecom · À traiter d'urgence
          </span>
        </button>

        {/* Warning Card (< 6h) */}
        <button
          onClick={() => setSlaFilter(slaFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            slaFilter === 'CRITICAL'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>SLA Imminent (&lt; 6h)</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold font-mono text-xs flex items-center justify-center">
              {criticalTickets.length}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {criticalTickets.length} ticket(s)
          </div>
          <span className="text-[11px] text-amber-800 block mt-1 font-medium">
            À clôturer avant la fin de la vacation
          </span>
        </button>

        {/* Litiges Card */}
        <button
          onClick={() => setSlaFilter(slaFilter === 'LITIGES' ? 'ALL' : 'LITIGES')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            slaFilter === 'LITIGES'
              ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-sky-600" />
              <span>Litiges Signalés (LC)</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold font-mono text-xs flex items-center justify-center">
              {litigeTickets.length}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {litigeTickets.length} dossier(s)
          </div>
          <span className="text-[11px] text-sky-700 block mt-1 font-medium">
            À réorienter ou valider par l'orienteur
          </span>
        </button>

        {/* On Time Card */}
        <button
          onClick={() => setSlaFilter(slaFilter === 'ON_TIME' ? 'ALL' : 'ON_TIME')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            slaFilter === 'ON_TIME'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Dans les Délais (&lt; 24h)</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold font-mono text-xs flex items-center justify-center">
              {onTimeTickets.length}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {onTimeTickets.length} ticket(s)
          </div>
          <span className="text-[11px] text-emerald-700 block mt-1 font-medium">
            Déroulement normalisé conforme SLA
          </span>
        </button>
      </div>

      <SplitterIncidentsPanel
        tickets={tickets}
        technicians={technicians}
        sectors={userSectors}
        onSelectSplitter={ref => setSplitterFilter(ref)}
      />

      {splitterFilter && (
        <div className="flex items-center justify-between gap-3 bg-brand-orange-50 border border-brand-orange-400/50 px-4 py-2.5 rounded-xl text-xs">
          <span className="font-semibold text-slate-800">Filtre : tickets du splitter <b className="font-mono">{splitterFilter}</b></span>
          <button onClick={() => setSplitterFilter(null)} className="font-bold text-brand-orange-600 hover:underline">Retirer le filtre</button>
        </div>
      )}

      {/* Active Filter Reminder with Reset */}
      {slaFilter !== 'ALL' && (
        <div className="bg-slate-100 border border-slate-300 p-3 rounded-xl flex items-center justify-between text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span>
              Filtre actif :{' '}
              <b className="font-bold text-slate-900">
                {slaFilter === 'OVERDUE' ? 'Retard Critique HD (> 24h)' :
                 slaFilter === 'CRITICAL' ? 'SLA Imminent (< 6h)' :
                 slaFilter === 'LITIGES' ? 'Litiges Signalés' : 'Dans les délais'}
              </b>{' '}
              ({filteredTickets.length} ticket(s) affiché(s))
            </span>
          </div>
          <button
            onClick={() => setSlaFilter('ALL')}
            className="text-xs font-bold text-slate-900 hover:underline"
          >
            Réinitialiser le filtre
          </button>
        </div>
      )}

      {/* Inactivity Alert Banner */}
      {inactiveTickets.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl text-xs text-amber-900 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-950 text-sm">
                Alerte Inactivité : {inactiveTickets.length} ticket(s) sans réponse depuis plus d'1h30
              </div>
              <div className="text-xs text-amber-800 mt-0.5">
                Tickets concernés : {inactiveTickets.map(t => `${t.ticketNumber} (${t.lastVisitedTechName || 'Technicien assigné'})`).join(', ')}.
                Relance recommandée.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Technician Workload Cards */}
      <div>
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Charge Active par Technicien ({technicians.length})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {technicianLoads.map(item => (
            <div
              key={item.tech.id}
              onClick={() => setSelectedTechFilter(selectedTechFilter === item.tech.id ? 'ALL' : item.tech.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                selectedTechFilter === item.tech.id
                  ? 'bg-slate-50 border-slate-900 shadow-xs ring-1 ring-slate-900'
                  : 'bg-white border-slate-200/90 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm truncate max-w-[150px]">
                  {item.tech.fullName}
                </span>
                {item.isOverloaded && (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    Surcharge (≥6)
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500 font-mono mt-0.5">
                {item.tech.phone}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">En cours actif :</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{item.activeTotal}</span>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span className="text-emerald-700 font-medium">✓ {item.completed} NF</span>
                <span className="text-rose-700 font-medium">⚠️ {item.litige} Litiges</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto text-xs font-semibold">
          <button
            onClick={() => setSelectedStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              selectedStatusFilter === 'ALL' ? 'bg-brand-navy-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tous ({tickets.length})
          </button>
          <button
            onClick={() => setSelectedStatusFilter('ASSIGNED')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              selectedStatusFilter === 'ASSIGNED' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Transmis ({tickets.filter(t => t.currentStatus === 'ASSIGNED').length})
          </button>
          <button
            onClick={() => setSelectedStatusFilter('LITIGE')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              selectedStatusFilter === 'LITIGE' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-rose-700 hover:bg-slate-200'
            }`}
          >
            Litiges LC ({tickets.filter(t => t.currentStatus === 'LITIGE').length})
          </button>
          <button
            onClick={() => setSelectedStatusFilter('COMPLETED')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              selectedStatusFilter === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-emerald-700 hover:bg-slate-200'
            }`}
          >
            Normalisés NF ({tickets.filter(t => t.currentStatus === 'COMPLETED').length})
          </button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filtrer interventions..."
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Tickets Cards List */}
      <div className="space-y-3">
        {filteredTickets.map(ticket => {
          const assignedTech = technicians.find(t => t.id === ticket.currentAssignedTechId);
          const slaDisplay = formatSLADisplay(ticket.slaRemainingHours, ticket.slaStatus);

          return (
            <div
              key={ticket.id}
              className={`bg-white rounded-2xl border p-5 shadow-xs transition-all hover:shadow-md ${
                splitterGroupSize(ticket) > 1 && !ticket.isClosed ? 'border-brand-orange-400 border-l-4' :
                ticket.currentStatus === 'LITIGE' ? 'border-rose-300' : 'border-slate-200/90'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {ticket.ticketNumber}
                    </span>

                    {/* SLA status */}
                    {!ticket.isClosed && (
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                        ticket.slaStatus === 'EXPIRED' ? 'bg-rose-100 text-rose-800' :
                        ticket.slaStatus === 'WARNING' ? 'bg-amber-100 text-amber-800' :
                        'bg-emerald-50 text-emerald-800'
                      }`}>
                        SLA : {slaDisplay.label}
                      </span>
                    )}

                    {/* Status badge */}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      ticket.currentStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                      ticket.currentStatus === 'LITIGE' ? 'bg-rose-100 text-rose-800' :
                      ticket.currentStatus === 'REOPENED' ? 'bg-blue-100 text-blue-800' :
                      ticket.currentStatus === 'SUSPENDED' ? 'bg-slate-200 text-slate-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {ticket.currentStatus === 'COMPLETED' ? '✓ NF (Normalisé)' :
                       ticket.currentStatus === 'LITIGE' ? '⚠️ Litige Signalé' :
                       ticket.currentStatus === 'REOPENED' ? '🔄 Réouvert (En cours)' :
                       ticket.currentStatus === 'SUSPENDED' ? '⏸ Suspendu' :
                       'Transmis'}
                    </span>

                    <SplitterBadge ticket={ticket} groupSize={splitterGroupSize(ticket)} />
                    <ManualTicketBadge ticket={ticket} />
                  </div>

                  {ticket.description && (
                    <div className="text-xs text-violet-900 bg-violet-50 rounded-lg px-2.5 py-1.5">📝 {ticket.description}</div>
                  )}

                  <NfSummary ticket={ticket} onOpen={() => onOpenTicketHistory(ticket)} />
                  <SuspendedNotice ticket={ticket} onRelaunch={() => setLitigeModalTicket(ticket)} />

                  <div className="text-xs">
                    <span className="font-bold text-slate-900 text-sm">{ticket.clientName}</span>
                    <span className="text-slate-500 font-mono ml-2">📞 {ticket.clientPhone}</span>
                    <div className="text-slate-600 mt-0.5">{ticket.clientAddress} · Zone : <b>{ticket.rawZoneText}</b></div>
                  </div>

                  {/* HD Overdue Urgency Banner (§2) */}
                  {ticket.slaStatus === 'EXPIRED' && !ticket.isClosed && (
                    <div className="bg-rose-100/90 border border-rose-300 text-rose-900 px-3 py-2 rounded-xl text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          DÉPASSEMENT CRITIQUE HD : Dépassé de <b>{Math.abs(ticket.slaRemainingHours)}h</b> par rapport aux 24h contractuelles. Pénalités applicables.
                        </span>
                      </div>
                      <button
                        onClick={() => handlePingTechnician(ticket)}
                        className="px-2.5 py-1 text-[11px] font-bold bg-rose-700 hover:bg-rose-800 text-white rounded-lg transition-colors shrink-0 shadow-2xs"
                      >
                        ⚡ Relancer technicien
                      </button>
                    </div>
                  )}

                  {/* Warning SLA Banner */}
                  {ticket.slaStatus === 'WARNING' && !ticket.isClosed && (
                    <div className="bg-amber-100/80 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>
                        Échéance SLA imminente : plus que <b>{ticket.slaRemainingHours}h restantes</b> pour clore l'intervention avant pénalité.
                      </span>
                    </div>
                  )}

                  {/* NF details */}
                  {ticket.currentStatus === 'COMPLETED' && (
                    <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-lg font-medium inline-block">
                      ✓ Clôture NF {ticket.nfType === 'CENTRAL_CONFIG' ? `avec config centrale (ONT : ${ticket.ontSerialNumber})` : 'Standard'} · {ticket.cableLengthMeters || 0}m de câble
                    </div>
                  )}

                  {/* Litige details */}
                  {ticket.currentStatus === 'LITIGE' && (
                    <div className="text-[11px] text-rose-800 bg-rose-50 p-2 rounded-lg font-medium">
                      ⚠️ Litige : <b>{ticket.lastLitigeReasonLabel}</b>
                      {ticket.lastLitigeRdvDate && ` · RDV prévu : ${formatCasablancaDateTime(ticket.lastLitigeRdvDate)}`}
                      {ticket.lastLitigeNeedsContact && (
                        <span className="ml-2 font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">📞 Nouveau numéro demandé</span>
                      )}
                      {ticket.lastLitigeNotes && <div className="mt-0.5 italic">« {ticket.lastLitigeNotes} »</div>}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 shrink-0">
                  <div className="text-right text-xs">
                    <span className="font-bold text-slate-900 block">{assignedTech?.fullName || 'Non assigné'}</span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {formatCasablancaTimeOnly(ticket.lastEventAt || ticket.updatedAt)}
                    </span>
                  </div>

                  {ticket.currentStatus === 'LITIGE' && (
                    <button
                      onClick={() => setLitigeModalTicket(ticket)}
                      className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs"
                    >
                      Traiter le litige
                    </button>
                  )}

                  <button
                    onClick={() => onOpenTicketHistory(ticket)}
                    className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    Historique
                  </button>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Litige Resolution Modal */}
      <LitigeResolutionModal
        ticket={litigeModalTicket}
        actorName={currentUser.name}
        onClose={() => setLitigeModalTicket(null)}
        onSuccess={() => {}}
      />

    </div>
  );
};
