import React from 'react';
import { SumCheckResult } from '../types';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface SumCheckBannerProps {
  sumCheck: SumCheckResult;
}

export const SumCheckBanner: React.FC<SumCheckBannerProps> = ({ sumCheck }) => {
  const { totalTickets, sumOfCategories, isBalanced, discrepancy, breakdown, culpritTickets } = sumCheck;

  return (
    <div className="bg-white border-b border-slate-200/80 py-2.5 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        
        {/* Left side: Strict Sum Check Breakdown */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
          <span className="font-bold text-slate-900">
            Encours secteur : <span className="font-mono tabular-nums">{totalTickets}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            À affecter : <span className="font-mono tabular-nums font-semibold text-slate-800">{breakdown.toAssign}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Zone inconnue : <span className="font-mono tabular-nums font-semibold text-amber-700">{breakdown.zoneToMap}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Transmis : <span className="font-mono tabular-nums font-semibold text-sky-700">{breakdown.assigned}</span>
          </span>
          {breakdown.reopened > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span>
                Réouverts : <span className="font-mono tabular-nums font-semibold text-blue-700">{breakdown.reopened}</span>
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Normalisés (NF) : <span className="font-mono tabular-nums font-semibold text-emerald-700">{breakdown.completed}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Litiges (LC) : <span className="font-mono tabular-nums font-semibold text-rose-700">{breakdown.litige}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            Suspendus : <span className="font-mono tabular-nums font-semibold text-slate-700">{breakdown.suspended}</span>
          </span>
        </div>

        {/* Right side: Strict Sum Validation (§8.3) */}
        <div className="flex items-center gap-2 shrink-0">
          {isBalanced ? (
            <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Contrôle conforme : <span className="font-mono tabular-nums">{sumOfCategories} = {totalTickets}</span></span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                Écart détecté ({discrepancy > 0 ? `+${discrepancy}` : discrepancy} tickets) !
              </span>
              {culpritTickets.length > 0 && (
                <span className="text-[11px] text-rose-600 font-mono">
                  ({culpritTickets.map(c => c.ticketNumber).join(', ')})
                </span>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
