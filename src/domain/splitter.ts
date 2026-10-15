// Splitter incidents: tickets of clients behind the same splitter (in the same sector) are a
// single network problem. They are dispatched to one technician and closed together.
import type { Ticket } from '../types';

const EMPTY_VALUES = new Set(['', '-', '--', '/', '0', 'N/A', 'NA', 'NON', 'AUCUN', 'NEANT', 'NÉANT']);

// "sp 12/3 " → "SP 12/3"; empty markers ("-", "N/A", "0"…) mean "no splitter".
export function normalizeSplitterRef(raw: unknown): string | undefined {
  const text = String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return EMPTY_VALUES.has(text) ? undefined : text;
}

export function splitterKey(ticket: Pick<Ticket, 'sectorId' | 'splitterRef'>): string | null {
  return ticket.splitterRef ? `${ticket.sectorId || ''}|${ticket.splitterRef}` : null;
}

export interface SplitterGroup {
  key: string;
  splitterRef: string;
  sectorId?: string;
  tickets: Ticket[];
  openCount: number;
  closedCount: number;
  // Assigned technicians among open tickets (normally one)
  technicianIds: string[];
  // Smallest remaining SLA among open tickets
  worstSlaHours: number;
}

/**
 * Groups tickets by splitter. Only splitters with at least `minOpen` open tickets are returned
 * (default 2: a single ticket on a splitter is an ordinary ticket). Most urgent first.
 */
export function groupBySplitter(tickets: Ticket[], minOpen = 2): SplitterGroup[] {
  const byKey = new Map<string, Ticket[]>();
  tickets.forEach(t => {
    const key = splitterKey(t);
    if (!key) return;
    byKey.set(key, [...(byKey.get(key) || []), t]);
  });

  const groups: SplitterGroup[] = [];
  byKey.forEach((list, key) => {
    const open = list.filter(t => !t.isClosed);
    if (open.length < minOpen) return;
    groups.push({
      key,
      splitterRef: list[0].splitterRef!,
      sectorId: list[0].sectorId,
      tickets: list,
      openCount: open.length,
      closedCount: list.length - open.length,
      technicianIds: Array.from(new Set(open.map(t => t.currentAssignedTechId).filter((id): id is string => !!id))),
      worstSlaHours: Math.min(...open.map(t => t.slaRemainingHours)),
    });
  });
  return groups.sort((a, b) => b.openCount - a.openCount || a.worstSlaHours - b.worstSlaHours);
}

// Keys of splitters that currently have at least two open tickets (collective incidents).
export function collectiveSplitterKeys(tickets: Ticket[]): Set<string> {
  return new Set(groupBySplitter(tickets).map(g => g.key));
}
