// Checks shown to the orienteur when a technician is chosen for a ticket, and the technicians'
// load during dispatch. Pure module (tested).
import type { Technician, Ticket } from '../types';

export const LOAD_WARNING = 6;
export const LOAD_ALERT = 10;

export interface AssignmentWarning {
  level: 'info' | 'warning';
  text: string;
}

const name = (techs: Technician[], id?: string) => techs.find(t => t.id === id)?.fullName;

export function assignmentWarnings(
  ticket: Ticket,
  chosenTechId: string | undefined,
  technicians: Technician[],
  loadOf: (techId: string) => number = () => 0
): AssignmentWarning[] {
  if (!chosenTechId) return [];
  const chosen = technicians.find(t => t.id === chosenTechId);
  if (!chosen) return [];
  const warnings: AssignmentWarning[] = [];

  // Reprise ≤ 7 days: paid only if someone else does it
  if (ticket.importOutcome === 'REPRISE' && ticket.repriseOfTechId) {
    warnings.push(chosenTechId === ticket.repriseOfTechId
      ? { level: 'info', text: `🔁 Reprise de sa propre intervention : non facturable pour ${chosen.fullName}.` }
      : { level: 'warning', text: `🔁 Reprise de ${name(technicians, ticket.repriseOfTechId) || 'un autre technicien'} confiée à ${chosen.fullName} : facturable pour lui.` });
  }

  // Retour client / second visit: who handled it before, and why it failed
  const previousId = ticket.preferredTechId || undefined;
  const previousName = name(technicians, previousId) || ticket.lastVisitedTechName;
  const reason = ticket.lastLitigeReasonLabel ? ` (litige : ${ticket.lastLitigeReasonLabel})` : '';
  if (ticket.importOutcome !== 'REPRISE' && (ticket.importOutcome === 'RETOUR_CLIENT' || ticket.visitCount > 1) && previousName) {
    const samePerson = previousId ? previousId === chosenTechId : previousName.trim().toLowerCase() === chosen.fullName.trim().toLowerCase();
    warnings.push(samePerson
      ? { level: 'info', text: `Même technicien qu'au passage précédent${reason}.` }
      : { level: 'warning', text: `⚠️ ${ticket.visitCount > 1 ? `${ticket.visitCount}e visite` : 'Retour client'} : précédent technicien ${previousName}${reason}.` });
  }

  if (ticket.lastLitigeReasonCode === 'HORS_ZONE' && ticket.lastVisitedTechName
    && ticket.lastVisitedTechName.trim().toLowerCase() === chosen.fullName.trim().toLowerCase()) {
    warnings.push({ level: 'warning', text: `📍 ${chosen.fullName} avait signalé ce ticket hors de sa zone.` });
  }

  if (ticket.technicalZoneId && !chosen.zoneIds.includes(ticket.technicalZoneId)) {
    warnings.push({ level: 'warning', text: `${chosen.fullName} ne couvre pas cette zone.` });
  }
  if (!chosen.telegramChatId) {
    warnings.push({ level: 'warning', text: `${chosen.fullName} n'a pas activé Telegram : il ne recevra pas l'ordre.` });
  }
  const load = loadOf(chosenTechId);
  if (load >= LOAD_WARNING) {
    warnings.push({ level: 'warning', text: `${chosen.fullName} a déjà ${load} interventions.` });
  }
  return warnings;
}

// Technicians' load during dispatch: open interventions + tickets proposed / chosen now
export interface TechnicianLoad {
  technician: Technician;
  inProgress: number;
  planned: number;
  total: number;
}

export function technicianLoads(
  technicians: Technician[],
  openTickets: Ticket[],
  plannedTechIds: (string | undefined)[]
): TechnicianLoad[] {
  return technicians
    .map(technician => {
      const inProgress = openTickets.filter(t =>
        t.currentAssignedTechId === technician.id && (t.currentStatus === 'ASSIGNED' || t.currentStatus === 'REOPENED')).length;
      const planned = plannedTechIds.filter(id => id === technician.id).length;
      return { technician, inProgress, planned, total: inProgress + planned };
    })
    .sort((a, b) => b.total - a.total || a.technician.fullName.localeCompare(b.technician.fullName));
}
