// What an imported row means for a ticket already known (same ticket number).
// The operator's file mixes new claims and tickets still open, so a known ticket is only a new
// claim when it had already been handled (NF, litige, suspended).
import type { Ticket, TicketStatus } from '../types';

export type ImportOutcome =
  | 'NOUVEAU'              // unknown ticket: normal dispatch
  | 'EN_COURS'             // not handled yet: unchanged (same technician, same SLA)
  | 'REPRISE'              // back within 7 days after an NF: same technician, not billable for him
  | 'NOUVELLE_RECLAMATION' // back more than 7 days after an NF: normal dispatch, billable
  | 'RETOUR_CLIENT';       // back while in litige / suspended: same technician, billable

export const REPRISE_WINDOW_DAYS = 7;

export const IMPORT_OUTCOME_LABELS: Record<ImportOutcome, string> = {
  NOUVEAU: 'Nouveau',
  EN_COURS: 'Déjà en cours (inchangé)',
  REPRISE: 'Reprise ≤ 7 j (non facturable)',
  NOUVELLE_RECLAMATION: 'Nouvelle réclamation (> 7 j)',
  RETOUR_CLIENT: 'Retour client (litige / suspendu)',
};

const NOT_HANDLED: TicketStatus[] = ['ZONE_TO_MAP', 'TO_ASSIGN', 'PROPOSED', 'ASSIGNED', 'REOPENED'];

// Date of the NF closing the ticket (older tickets: last known activity)
export function completedAtOf(ticket: Ticket): string | undefined {
  return ticket.completedAt || ticket.lastEventAt || ticket.updatedAt;
}

export function classifyKnownTicket(existing: Ticket | undefined, now = new Date()): ImportOutcome {
  if (!existing) return 'NOUVEAU';
  if (NOT_HANDLED.includes(existing.currentStatus)) return 'EN_COURS';
  if (existing.currentStatus === 'LITIGE' || existing.currentStatus === 'SUSPENDED') return 'RETOUR_CLIENT';
  // COMPLETED
  const closedAt = Date.parse(completedAtOf(existing) || '');
  const withinWindow = !Number.isNaN(closedAt) && now.getTime() - closedAt <= REPRISE_WINDOW_DAYS * 86400_000;
  return withinWindow ? 'REPRISE' : 'NOUVELLE_RECLAMATION';
}

// Technician who handled the previous claim (to send the ticket back to him)
export function previousTechnicianId(existing: Ticket): string | undefined {
  return existing.currentAssignedTechId;
}

// The outcomes that open a new intervention on the ticket
export function opensNewCycle(outcome: ImportOutcome): boolean {
  return outcome === 'REPRISE' || outcome === 'NOUVELLE_RECLAMATION' || outcome === 'RETOUR_CLIENT';
}

// Ticket after a new claim on an already handled ticket (reprise, new claim, retour client):
// new intervention cycle, previous declaration archived, same technician when expected.
export function buildReopenedTicket(
  existing: Ticket,
  fromFile: Partial<Ticket>,
  outcome: ImportOutcome,
  sla: Pick<Ticket, 'slaDeadline' | 'slaStatus' | 'slaRemainingHours'>,
  now: string
): Ticket {
  const previousTech = previousTechnicianId(existing);
  return {
    ...existing,
    ...fromFile,
    sectorId: existing.sectorId || fromFile.sectorId,
    visitCount: existing.visitCount + 1,
    ...sla,
    importOutcome: outcome,
    // Reprise and retour client go back to the same technician; a new claim is dispatched normally.
    // null (not undefined) so that the stored value is cleared.
    preferredTechId: outcome === 'NOUVELLE_RECLAMATION' ? (null as any) : previousTech,
    repriseOfTechId: outcome === 'REPRISE' ? previousTech : (null as any),
    previousPrestations: existing.prestation
      ? [...(existing.previousPrestations || []), existing.prestation]
      : existing.previousPrestations,
    prestation: null as any,
    prestationStatus: null as any,
    collectiveLeadTicketId: null as any,
    lastLitigeNeedsContact: false,
    updatedAt: now,
  };
}
