import React from 'react';
import type { TicketStatus } from '../../types';

// Ticket status in French, same wording and colors on every screen
export const STATUS_LABELS: Record<TicketStatus, { label: string; className: string }> = {
  TO_ASSIGN: { label: 'À affecter', className: 'bg-brand-orange-50 text-brand-orange-600' },
  PROPOSED: { label: 'À affecter', className: 'bg-brand-orange-50 text-brand-orange-600' },
  ZONE_TO_MAP: { label: 'Zone à rattacher', className: 'bg-amber-100 text-amber-900' },
  ASSIGNED: { label: 'Transmis', className: 'bg-sky-100 text-sky-800' },
  REOPENED: { label: 'Relancé', className: 'bg-indigo-100 text-indigo-800' },
  LITIGE: { label: 'Litige', className: 'bg-rose-100 text-rose-800' },
  SUSPENDED: { label: 'Suspendu', className: 'bg-slate-200 text-slate-700' },
  COMPLETED: { label: 'NF', className: 'bg-emerald-100 text-emerald-800' },
};

export const StatusPill: React.FC<{ status: TicketStatus }> = ({ status }) => {
  const s = STATUS_LABELS[status] || { label: status, className: 'bg-slate-100 text-slate-700' };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${s.className}`}>{s.label}</span>;
};
