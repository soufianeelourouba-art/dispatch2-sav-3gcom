import React from 'react';
import { Sector, Technician, Ticket } from '../../types';
import { groupBySplitter } from '../../domain/splitter';
import { formatSLADisplay } from '../../domain/format';
import { Cable } from 'lucide-react';

interface SplitterIncidentsPanelProps {
  tickets: Ticket[];
  technicians: Technician[];
  sectors: Sector[];
  onSelectSplitter?: (splitterRef: string) => void;
}

// Open collective incidents: splitters with at least two open tickets, most impacting first.
export const SplitterIncidentsPanel: React.FC<SplitterIncidentsPanelProps> = ({
  tickets,
  technicians,
  sectors,
  onSelectSplitter,
}) => {
  const groups = groupBySplitter(tickets);
  if (groups.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-brand-orange-400/50 shadow-xs overflow-hidden">
      <div className="px-5 py-3 bg-brand-orange-50 border-b border-brand-orange-400/30 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Cable className="w-4 h-4 text-brand-orange-600" />
          <span>Incidents splitter en cours ({groups.length})</span>
        </h2>
        <span className="text-[11px] text-slate-600">Une intervention résout tous les tickets du splitter</span>
      </div>
      <div className="divide-y divide-slate-100">
        {groups.map(group => {
          const techNames = group.technicianIds
            .map(id => technicians.find(t => t.id === id)?.fullName || 'Technicien inconnu');
          const sectorName = sectors.find(s => s.id === group.sectorId)?.name;
          const worstSla = formatSLADisplay(group.worstSlaHours, group.worstSlaHours <= 0 ? 'EXPIRED' : group.worstSlaHours < 6 ? 'WARNING' : 'ON_TIME');
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => onSelectSplitter?.(group.splitterRef)}
              className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-48">
                <span className="font-mono font-bold text-slate-900 text-sm">{group.splitterRef}</span>
                {sectorName && <span className="text-[11px] text-slate-500">{sectorName}</span>}
              </div>
              <div className="text-xs text-slate-700 flex-1">
                <b className="text-brand-orange-600">{group.openCount} clients impactés</b>
                {group.closedCount > 0 && <span className="text-emerald-700"> · {group.closedCount} déjà clôturé(s)</span>}
              </div>
              <div className="text-xs text-slate-700 sm:w-56">
                {techNames.length === 0
                  ? <span className="text-amber-700 font-semibold">À affecter</span>
                  : techNames.length === 1
                    ? <span>👤 {techNames[0]}</span>
                    : <span className="text-rose-700 font-semibold">⚠️ {techNames.length} techniciens : {techNames.join(', ')}</span>}
              </div>
              <div className={`text-xs font-mono font-bold sm:w-36 sm:text-right ${
                group.worstSlaHours <= 0 ? 'text-rose-700' : group.worstSlaHours < 6 ? 'text-amber-700' : 'text-emerald-700'
              }`}>
                SLA : {worstSla.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
