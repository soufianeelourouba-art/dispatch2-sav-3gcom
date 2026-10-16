// Prestations over a period, per technician: what each one is paid for (Prestations screen and
// its Excel export). Pure module (tested).
//
// One line per intervention closed in NF during the period (Morocco day of the NF), plus the
// declarations of earlier cycles of reopened tickets (reprise / new claim), dated by their declaration.
import type { Technician, Ticket } from '../types';
import { toMoroccoWallClock } from './moroccoTime.js';
import { PRESTATIONS, type MaterialsInstalled, type PrestationCode, type PrestationDeclaration, type PrestationStatus } from './prestations.js';

export interface Period {
  from: string; // YYYY-MM-DD (Morocco), inclusive
  to: string;   // YYYY-MM-DD (Morocco), inclusive
}

// Unit price in DH per prestation (01-02 FO: per raccordement). 0 / missing = not set.
export type Tarifs = Partial<Record<PrestationCode, number>>;

export interface PrestationLine {
  ticketId: string;
  ticketNumber: string;
  clientName: string;
  sectorId?: string | null;
  manual: boolean;
  techId?: string;
  techName: string;
  date: string; // ISO: NF date, or declaration date for earlier cycles
  status: PrestationStatus;
  code?: PrestationCode;
  units: number; // paid units (raccordements for 01-02 FO, 1 otherwise, 0 if not paid)
  materials: MaterialsInstalled;
  photoCount: number;
  leadTicketId?: string;
  earlierCycle: boolean;
}

export interface TechnicianSummary {
  techId?: string;
  techName: string;
  nf: number;
  declared: number;
  toDeclare: number;
  nonBillable: number;
  included: number;
  units: Record<PrestationCode, number>;
  materials: MaterialsInstalled;
  amount: number;
  lines: PrestationLine[];
}

const NO_MATERIALS: MaterialsInstalled = { joints: 0, splitters: 0, cableMeters: 0 };

// Morocco calendar day of an instant, YYYY-MM-DD
export function moroccoDay(date: Date): string {
  return toMoroccoWallClock(date).toISOString().slice(0, 10);
}

export function inPeriod(iso: string | undefined, period: Period): boolean {
  if (!iso) return false;
  const day = moroccoDay(new Date(iso));
  return day >= period.from && day <= period.to;
}

export function unitsOf(declaration?: PrestationDeclaration): number {
  if (!declaration) return 0;
  return declaration.code === 'FO_01_02' ? declaration.raccordements || 1 : 1;
}

function techOf(technicians: Technician[], id?: string, name?: string): { techId?: string; techName: string } {
  const byId = id ? technicians.find(t => t.id === id) : undefined;
  if (byId) return { techId: byId.id, techName: byId.fullName };
  const byName = name ? technicians.find(t => t.fullName.trim().toLowerCase() === name.trim().toLowerCase()) : undefined;
  if (byName) return { techId: byName.id, techName: byName.fullName };
  return { techId: id, techName: name || 'Technicien inconnu' };
}

export function prestationLines(tickets: Ticket[], technicians: Technician[], period: Period): PrestationLine[] {
  const lines: PrestationLine[] = [];
  for (const ticket of tickets) {
    const base = {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      clientName: ticket.clientName,
      sectorId: ticket.sectorId,
      manual: ticket.origin === 'MANUAL',
    };

    // Earlier cycles: declarations kept when the ticket was reopened
    for (const previous of ticket.previousPrestations || []) {
      if (!inPeriod(previous.declaredAt, period)) continue;
      lines.push({
        ...base,
        ...techOf(technicians, previous.declaredByTechId, previous.declaredBy),
        date: previous.declaredAt,
        status: 'DECLAREE',
        code: previous.code,
        units: unitsOf(previous),
        materials: previous.materials || NO_MATERIALS,
        photoCount: previous.photoIds?.length || 0,
        earlierCycle: true,
      });
    }

    // Current cycle, closed in NF during the period
    const nfDate = ticket.completedAt || ticket.lastEventAt;
    if (ticket.currentStatus !== 'COMPLETED' || !inPeriod(nfDate, period)) continue;
    const status: PrestationStatus = ticket.prestationStatus || 'A_DECLARER';
    const declared = status === 'DECLAREE' ? ticket.prestation : undefined;
    lines.push({
      ...base,
      ...techOf(technicians, ticket.currentAssignedTechId, ticket.prestation?.declaredBy || ticket.lastVisitedTechName),
      date: nfDate!,
      status,
      code: declared?.code,
      units: unitsOf(declared),
      materials: declared?.materials || NO_MATERIALS,
      photoCount: declared?.photoIds?.length || 0,
      leadTicketId: ticket.collectiveLeadTicketId,
      earlierCycle: false,
    });
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}

export function amountOf(line: PrestationLine, tarifs: Tarifs): number {
  return line.code ? line.units * (tarifs[line.code] || 0) : 0;
}

export function hasTarifs(tarifs: Tarifs): boolean {
  return PRESTATIONS.some(p => (tarifs[p.code] || 0) > 0);
}

// One row per technician, highest amount (then most NF) first
export function summarizeByTechnician(lines: PrestationLine[], tarifs: Tarifs = {}): TechnicianSummary[] {
  const byTech = new Map<string, TechnicianSummary>();
  for (const line of lines) {
    const key = line.techId || `name:${line.techName}`;
    let row = byTech.get(key);
    if (!row) {
      row = {
        techId: line.techId,
        techName: line.techName,
        nf: 0, declared: 0, toDeclare: 0, nonBillable: 0, included: 0,
        units: { FO_01_02: 0, FO_04: 0, FO_08: 0, FO_32: 0 },
        materials: { ...NO_MATERIALS },
        amount: 0,
        lines: [],
      };
      byTech.set(key, row);
    }
    row.lines.push(line);
    if (!line.earlierCycle) row.nf++;
    if (line.status === 'DECLAREE') row.declared++;
    if (line.status === 'A_DECLARER') row.toDeclare++;
    if (line.status === 'NON_FACTURABLE') row.nonBillable++;
    if (line.status === 'INCLUSE') row.included++;
    if (line.code) row.units[line.code] += line.units;
    row.materials.joints += line.materials.joints;
    row.materials.splitters += line.materials.splitters;
    row.materials.cableMeters += line.materials.cableMeters;
    row.amount += amountOf(line, tarifs);
  }
  return [...byTech.values()].sort((a, b) => b.amount - a.amount || b.nf - a.nf || a.techName.localeCompare(b.techName));
}

// Period presets (Morocco days)
export function periodPreset(kind: 'TODAY' | 'WEEK' | 'MONTH' | 'LAST_MONTH', now = new Date()): Period {
  const today = moroccoDay(now);
  const [y, m, d] = today.split('-').map(Number);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (kind === 'TODAY') return { from: today, to: today };
  if (kind === 'WEEK') {
    const date = new Date(Date.UTC(y, m - 1, d));
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000);
    return { from: iso(monday), to: today };
  }
  if (kind === 'MONTH') return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: today };
  return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) };
}
