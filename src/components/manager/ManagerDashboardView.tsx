import React, { useState, useMemo, useEffect } from 'react';
import { store, formatCasablancaDateTime, formatCasablancaTimeOnly, formatSLADisplay } from '../../services/storage';
import { exportTicketsToExcel, exportTechnicianMatrixToExcel } from '../../services/excelExporter';
import { Ticket, Technician, Sector } from '../../types';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  MapPin, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Building2, 
  Calendar, 
  Flame, 
  ShieldCheck, 
  Filter, 
  Search, 
  Globe, 
  Bell, 
  ChevronRight, 
  Eye, 
  ExternalLink,
  ShieldAlert,
  Phone
} from 'lucide-react';

interface ManagerDashboardViewProps {
  onOpenTicketHistory?: (ticket: Ticket) => void;
}

export const ManagerDashboardView: React.FC<ManagerDashboardViewProps> = ({
  onOpenTicketHistory,
}) => {
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('ALL');
  const [activeAlertCategory, setActiveAlertCategory] = useState<'ALL' | 'OVERDUE' | 'CRITICAL' | 'LITIGES' | 'OVERLOAD'>('ALL');
  const [alertSearchQuery, setAlertSearchQuery] = useState<string>('');
  const [, setStoreVersion] = useState(0);

  // Subscribe directly to store for real-time reactivity
  useEffect(() => {
    const unsub = store.subscribe(() => setStoreVersion(v => v + 1));
    return () => unsub();
  }, []);

  const allTickets = store.getTickets();
  const allSectors = store.getSectors();
  const allTechs = store.getTechnicians();

  const selectedSector = useMemo(() => {
    if (selectedSectorFilter === 'ALL') return null;
    return allSectors.find(s => s.id === selectedSectorFilter) || null;
  }, [allSectors, selectedSectorFilter]);

  // Tickets filtered by active sector selection
  const scopedTickets = useMemo(() => {
    if (selectedSectorFilter === 'ALL') return allTickets;
    return allTickets.filter(t => t.sectorId === selectedSectorFilter);
  }, [allTickets, selectedSectorFilter]);

  // Technicians filtered by active sector selection
  const scopedTechs = useMemo(() => {
    if (selectedSectorFilter === 'ALL') return allTechs;
    return allTechs.filter(t => t.sectorId === selectedSectorFilter);
  }, [allTechs, selectedSectorFilter]);

  // Metrics per sector with strict 24h SLA compliance (§7)
  const sectorMetrics = useMemo(() => {
    return allSectors.map(sec => {
      const secTickets = allTickets.filter(t => t.sectorId === sec.id);
      const totalVolume = secTickets.length;
      
      const inProgress = secTickets.filter(t => ['ASSIGNED', 'REOPENED'].includes(t.currentStatus)).length;
      const completed = secTickets.filter(t => t.currentStatus === 'COMPLETED').length;
      const litiges = secTickets.filter(t => t.currentStatus === 'LITIGE').length;
      
      // SLA 24h metrics
      const overdueSla = secTickets.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed).length;
      const warningSla = secTickets.filter(t => t.slaStatus === 'WARNING' && !t.isClosed).length;

      // Completion rate calculation (denominator is active volume §7 & §9)
      const displayRate = totalVolume >= 10
        ? `${Math.round((completed / (totalVolume || 1)) * 100)} %`
        : totalVolume > 0
        ? `${completed} sur ${totalVolume}`
        : '0';

      const slaComplianceRate = totalVolume >= 10
        ? `${Math.round(((totalVolume - overdueSla) / (totalVolume || 1)) * 100)} %`
        : totalVolume > 0
        ? `${totalVolume - overdueSla} sur ${totalVolume}`
        : 'N/A';

      return {
        sector: sec,
        totalVolume,
        inProgress,
        completed,
        litiges,
        overdueSla,
        warningSla,
        displayRate,
        slaComplianceRate,
      };
    });
  }, [allSectors, allTickets]);

  // Scoped KPIs depending on sector selection
  const kpiTotal = scopedTickets.length;
  const kpiCompleted = scopedTickets.filter(t => t.currentStatus === 'COMPLETED').length;
  const kpiActive = scopedTickets.filter(t => ['ASSIGNED', 'REOPENED'].includes(t.currentStatus)).length;
  const kpiLitiges = scopedTickets.filter(t => t.currentStatus === 'LITIGE').length;
  const kpiOverdue = scopedTickets.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed).length;
  const kpiWarning = scopedTickets.filter(t => t.slaStatus === 'WARNING' && !t.isClosed).length;

  const kpiSlaComplianceRate = kpiTotal >= 5
    ? `${Math.round(((kpiTotal - kpiOverdue) / (kpiTotal || 1)) * 100)} %`
    : kpiTotal > 0
    ? `${kpiTotal - kpiOverdue} sur ${kpiTotal}`
    : '100 %';

  // --- Operational Alerts Center (Kingdom or Scoped) ---
  const overdueAlerts = useMemo(() => {
    return scopedTickets.filter(t => t.slaStatus === 'EXPIRED' && !t.isClosed);
  }, [scopedTickets]);

  const criticalAlerts = useMemo(() => {
    return scopedTickets.filter(t => t.slaStatus === 'WARNING' && !t.isClosed);
  }, [scopedTickets]);

  const litigeAlerts = useMemo(() => {
    return scopedTickets.filter(t => t.currentStatus === 'LITIGE');
  }, [scopedTickets]);

  // Technicians overload or inactive
  const now = Date.now();
  const technicianAlerts = useMemo(() => {
    const list: { tech: Technician; reason: string; activeCount: number; sectorName: string }[] = [];
    scopedTechs.filter(t => t.isActive).forEach(tech => {
      const activeTkts = scopedTickets.filter(t => t.currentAssignedTechId === tech.id && !t.isClosed);
      const sec = allSectors.find(s => s.id === tech.sectorId);

      // Overload: >= 6 tickets
      if (activeTkts.length >= 6) {
        list.push({
          tech,
          reason: `Surcharge opérationnelle : ${activeTkts.length} interventions actives en cours`,
          activeCount: activeTkts.length,
          sectorName: sec?.name || 'Secteur',
        });
      }

      // Inactivity > 1.5h
      const staleTkt = activeTkts.find(t => {
        const refTime = t.lastEventAt ? new Date(t.lastEventAt).getTime() : new Date(t.updatedAt).getTime();
        return (now - refTime) / (1000 * 3600) >= 1.5;
      });

      if (staleTkt && activeTkts.length < 6) {
        list.push({
          tech,
          reason: `Inactivité constatée : aucun avancement depuis > 1h30 (Ticket ${staleTkt.ticketNumber})`,
          activeCount: activeTkts.length,
          sectorName: sec?.name || 'Secteur',
        });
      }
    });
    return list;
  }, [scopedTechs, scopedTickets, allSectors, now]);

  const totalAlertCount = overdueAlerts.length + criticalAlerts.length + litigeAlerts.length + technicianAlerts.length;

  const handleExportAll = () => {
    const prefix = selectedSector ? `rapport_${selectedSector.code.toLowerCase()}` : 'rapport_royaume_3gcom';
    exportTicketsToExcel(scopedTickets, `${prefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportTechs = () => {
    exportTechnicianMatrixToExcel(scopedTechs, scopedTickets, `matrice_techniciens_${selectedSector ? selectedSector.code.toLowerCase() : 'national'}.xlsx`);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-purple-600" />
              <span>Supervision Direction · {selectedSector ? selectedSector.name : 'Vue Royaume (Tous Secteurs)'}</span>
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">Contrat SAV Fibre Maroc Telecom</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Tableau de Bord Direction & Centre d'Alertes SLA
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Indicateurs consolidés, filtrage par secteur, détection en temps réel des dépassements SLA HD et des litiges terrain.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportTechs}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Matrice Techniciens</span>
          </button>
          
          <button
            onClick={handleExportAll}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Sector Filter Bar (§3: "dans le dashbord manager vue royaume je veux aussi avoir possiblite de filtrer par Secteur") */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
            Filtrer par Secteur :
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedSectorFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedSectorFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Vue Royaume (Tous)</span>
              <span className="ml-1 text-[11px] font-mono opacity-80">({allTickets.length})</span>
            </button>

            {allSectors.map(sec => {
              const count = allTickets.filter(t => t.sectorId === sec.id).length;
              const overdueCount = allTickets.filter(t => t.sectorId === sec.id && t.slaStatus === 'EXPIRED' && !t.isClosed).length;
              const isSelected = selectedSectorFilter === sec.id;

              return (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSectorFilter(sec.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-purple-900 text-white shadow-xs font-bold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 opacity-70" />
                  <span>{sec.name}</span>
                  <span className="ml-1 text-[11px] font-mono opacity-80">({count})</span>
                  {overdueCount > 0 && (
                    <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center font-mono ${
                      isSelected ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {overdueCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedSector && (
          <div className="text-xs text-slate-500 shrink-0 flex items-center gap-2">
            <span>Orienteur responsable : <b>{selectedSector.dispatcherName || 'Non assigné'}</b></span>
            <button
              onClick={() => setSelectedSectorFilter('ALL')}
              className="text-xs font-semibold text-purple-700 hover:underline"
            >
              Réinitialiser à Vue Royaume
            </button>
          </div>
        )}
      </div>

      {/* Dynamic High-level KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total tickets */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">Total Réclamations Reçues</span>
          <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums block mt-1">
            {kpiTotal}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            {selectedSector ? selectedSector.name : 'Ensemble des secteurs'}
          </span>
        </div>

        {/* Retards HD */}
        <div className={`p-5 rounded-2xl border shadow-xs transition-all ${
          kpiOverdue > 0 
            ? 'bg-rose-50/50 border-rose-300 ring-1 ring-rose-200' 
            : 'bg-white border-slate-200/80'
        }`}>
          <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-rose-600" />
            <span>Retards SLA HD (&gt; 24h)</span>
          </span>
          <span className="text-3xl font-bold text-rose-800 font-mono tabular-nums block mt-1">
            {kpiOverdue}
          </span>
          <span className="text-[11px] text-rose-600 block mt-1 font-semibold">
            Pénalités Maroc Telecom applicables
          </span>
        </div>

        {/* En Cours Terrain */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-blue-700 block">En Cours Terrain</span>
          <span className="text-3xl font-bold text-blue-800 font-mono tabular-nums block mt-1">
            {kpiActive}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Chez les techniciens ({scopedTechs.length} actifs)</span>
        </div>

        {/* Normalisés NF */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-emerald-700 block">Normalisés (NF)</span>
          <span className="text-3xl font-bold text-emerald-800 font-mono tabular-nums block mt-1">
            {kpiCompleted}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Fibre rétablie avec succès</span>
        </div>

        {/* Litiges LC */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-amber-700 block">Litiges Clients (LC)</span>
          <span className="text-3xl font-bold text-amber-800 font-mono tabular-nums block mt-1">
            {kpiLitiges}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">Taux de respect SLA : <b>{kpiSlaComplianceRate}</b></span>
        </div>
      </div>

      {/* Operational Alerts Section (§3: "voir des alertes") */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                Centre d'Alertes Opérationnelles & Dépassements SLA
              </h2>
              <p className="text-xs text-slate-400">
                {selectedSector ? `Alertes du secteur ${selectedSector.name}` : 'Surveillance globale Royaume'} · Détection proactive des risques de pénalité
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-rose-500 text-white">
              {totalAlertCount} alerte(s) active(s)
            </span>
          </div>
        </div>

        {/* Alert Category Tabs */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <button
              onClick={() => setActiveAlertCategory('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeAlertCategory === 'ALL' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-200'
              }`}
            >
              Toutes ({totalAlertCount})
            </button>
            <button
              onClick={() => setActiveAlertCategory('OVERDUE')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                activeAlertCategory === 'OVERDUE' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Retards HD &gt; 24h ({overdueAlerts.length})</span>
            </button>
            <button
              onClick={() => setActiveAlertCategory('CRITICAL')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                activeAlertCategory === 'CRITICAL' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>SLA Imminent &lt; 6h ({criticalAlerts.length})</span>
            </button>
            <button
              onClick={() => setActiveAlertCategory('LITIGES')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                activeAlertCategory === 'LITIGES' ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-800 hover:bg-sky-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Litiges Bloqués ({litigeAlerts.length})</span>
            </button>
            <button
              onClick={() => setActiveAlertCategory('OVERLOAD')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                activeAlertCategory === 'OVERLOAD' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Surcharge / Inactivité ({technicianAlerts.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={alertSearchQuery}
              onChange={e => setAlertSearchQuery(e.target.value)}
              placeholder="Chercher alerte..."
              className="w-full text-xs bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Alert Items List */}
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {totalAlertCount === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              Aucune anomalie ni dépassement SLA détecté pour le périmètre sélectionné.
            </div>
          ) : (
            <>
              {/* Overdue HD alerts */}
              {(activeAlertCategory === 'ALL' || activeAlertCategory === 'OVERDUE') &&
                overdueAlerts.map(ticket => {
                  const tech = allTechs.find(t => t.id === ticket.currentAssignedTechId);
                  const sec = allSectors.find(s => s.id === ticket.sectorId);

                  return (
                    <div key={`overdue-${ticket.id}`} className="p-4 bg-rose-50/40 hover:bg-rose-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                          <Flame className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900">{ticket.ticketNumber}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                              Retard HD (+{Math.abs(ticket.slaRemainingHours)}h)
                            </span>
                            <span className="text-xs text-slate-500">· Secteur : <b>{sec?.name}</b></span>
                          </div>
                          <div className="text-xs text-slate-700 font-medium mt-0.5">
                            Client : {ticket.clientName} (📞 {ticket.clientPhone}) · Zone : {ticket.rawZoneText}
                          </div>
                          <div className="text-[11px] text-rose-700 mt-0.5">
                            Technicien affecté : <b>{tech?.fullName || 'Non assigné'}</b> · Dépassé depuis {Math.abs(ticket.slaRemainingHours)} heures par rapport aux 24h contractuelles Maroc Telecom.
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {onOpenTicketHistory && (
                          <button
                            onClick={() => onOpenTicketHistory(ticket)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Historique</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Critical SLA alerts */}
              {(activeAlertCategory === 'ALL' || activeAlertCategory === 'CRITICAL') &&
                criticalAlerts.map(ticket => {
                  const tech = allTechs.find(t => t.id === ticket.currentAssignedTechId);
                  const sec = allSectors.find(s => s.id === ticket.sectorId);

                  return (
                    <div key={`crit-${ticket.id}`} className="p-4 bg-amber-50/30 hover:bg-amber-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900">{ticket.ticketNumber}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              SLA Imminent (reste {ticket.slaRemainingHours}h)
                            </span>
                            <span className="text-xs text-slate-500">· Secteur : <b>{sec?.name}</b></span>
                          </div>
                          <div className="text-xs text-slate-700 font-medium mt-0.5">
                            Client : {ticket.clientName} (📞 {ticket.clientPhone}) · Zone : {ticket.rawZoneText}
                          </div>
                          <div className="text-[11px] text-amber-800 mt-0.5">
                            Technicien : <b>{tech?.fullName || 'Non assigné'}</b> · À clore avant la fin de journée.
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {onOpenTicketHistory && (
                          <button
                            onClick={() => onOpenTicketHistory(ticket)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Historique</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Litige alerts */}
              {(activeAlertCategory === 'ALL' || activeAlertCategory === 'LITIGES') &&
                litigeAlerts.map(ticket => {
                  const tech = allTechs.find(t => t.id === ticket.currentAssignedTechId);
                  const sec = allSectors.find(s => s.id === ticket.sectorId);

                  return (
                    <div key={`lit-${ticket.id}`} className="p-4 bg-sky-50/30 hover:bg-sky-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center shrink-0 mt-0.5">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900">{ticket.ticketNumber}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full">
                              Litige : {ticket.lastLitigeReasonLabel || 'Signalé terrain'}
                            </span>
                            <span className="text-xs text-slate-500">· Secteur : <b>{sec?.name}</b></span>
                          </div>
                          <div className="text-xs text-slate-700 font-medium mt-0.5">
                            Client : {ticket.clientName} (📞 {ticket.clientPhone}) · Dernier passage : {tech?.fullName || 'Technicien'}
                          </div>
                          <div className="text-[11px] text-sky-800 mt-0.5">
                            {ticket.lastLitigeRdvDate ? `RDV programmé le : ${formatCasablancaDateTime(ticket.lastLitigeRdvDate)}` : 'En attente de recontact client ou validation orienteur.'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {onOpenTicketHistory && (
                          <button
                            onClick={() => onOpenTicketHistory(ticket)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Historique</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Technician Overload / Inactivity alerts */}
              {(activeAlertCategory === 'ALL' || activeAlertCategory === 'OVERLOAD') &&
                technicianAlerts.map((alert, idx) => (
                  <div key={`tech-alert-${idx}`} className="p-4 bg-purple-50/30 hover:bg-purple-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 mt-0.5">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{alert.tech.fullName}</span>
                          <span className="text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full">
                            {alert.activeCount} tickets actifs
                          </span>
                          <span className="text-xs text-slate-500">· Secteur : <b>{alert.sectorName}</b></span>
                        </div>
                        <div className="text-xs text-slate-700 font-medium mt-0.5">
                          📞 {alert.tech.phone} · Chat Telegram : <span className="font-mono">{alert.tech.telegramChatId || 'Non configuré'}</span>
                        </div>
                        <div className="text-[11px] text-purple-800 mt-0.5">
                          {alert.reason}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>

      {/* Sector Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-600" />
            <span>Comparatif d'Activité & Respect du SLA 24h par Secteur</span>
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {allSectors.length} secteurs actifs
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Secteur</th>
                <th className="py-3 px-4">Orienteur</th>
                <th className="py-3 px-4 text-center">Volume Reçu</th>
                <th className="py-3 px-4 text-center">Retards &gt; 24h</th>
                <th className="py-3 px-4 text-center">En Cours</th>
                <th className="py-3 px-4 text-center">Normalisés (NF)</th>
                <th className="py-3 px-4 text-center">Litiges (LC)</th>
                <th className="py-3 px-4 text-right">Respect SLA 24h</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {sectorMetrics.map(item => {
                const isSelected = selectedSectorFilter === item.sector.id;

                return (
                  <tr 
                    key={item.sector.id} 
                    onClick={() => setSelectedSectorFilter(isSelected ? 'ALL' : item.sector.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-purple-50/80 font-medium' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        {isSelected && <span className="w-2 h-2 rounded-full bg-purple-600"></span>}
                        <span>{item.sector.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {item.sector.code}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {item.sector.dispatcherName || 'Non assigné'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                      {item.totalVolume}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-rose-700 bg-rose-50/50">
                      {item.overdueSla > 0 ? `⚠️ ${item.overdueSla}` : '0'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-blue-700 font-medium">
                      {item.inProgress}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-emerald-700 font-bold">
                      {item.completed}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-amber-700 font-semibold">
                      {item.litiges}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {item.slaComplianceRate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Technicians Performance Matrix Preview */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-600" />
              <span>Productivité des Techniciens Terrain {selectedSector ? `(${selectedSector.name})` : '(Vue Consolidée)'}</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Suivi individuel des réalisations NF et des litiges signalés
            </p>
          </div>
          <button
            onClick={handleExportTechs}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export complet (.xlsx)</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Technicien</th>
                <th className="py-3 px-4">Secteur</th>
                <th className="py-3 px-4">Téléphone GSM</th>
                <th className="py-3 px-4 text-center">Interventions Reçues</th>
                <th className="py-3 px-4 text-center">NF Réalisés</th>
                <th className="py-3 px-4 text-center">Litiges Signalés</th>
                <th className="py-3 px-4 text-right">Taux de Clôture NF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {scopedTechs.filter(t => t.isActive).map(tech => {
                const techTickets = allTickets.filter(t => t.currentAssignedTechId === tech.id);
                const completed = techTickets.filter(t => t.currentStatus === 'COMPLETED').length;
                const litiges = techTickets.filter(t => t.currentStatus === 'LITIGE').length;
                const total = techTickets.length;
                const sec = allSectors.find(s => s.id === tech.sectorId);

                const rate = total >= 10 
                  ? `${Math.round((completed / total) * 100)} %` 
                  : total > 0 
                  ? `${completed} sur ${total}` 
                  : 'N/A';

                return (
                  <tr key={tech.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {tech.fullName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {sec?.name || 'Non rattaché'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {tech.phone}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                      {total}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-emerald-700 font-bold">
                      {completed}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-amber-700 font-semibold">
                      {litiges}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {rate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
