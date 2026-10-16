// Pure ticket rules, shared by the browser (storage.ts) and the server (api/).
// No Firebase or browser imports here.
import type { ManualTicketNature, SLAStatus, SumCheckResult, Ticket, TicketEvent, TicketStatus } from '../types';
import { MANUAL_TICKET_NATURES } from '../types/index.js';
import { formatPhonesIntl } from './litiges.js';
import { formatCasablancaDateTime, formatSLADisplay } from './format.js';

// --- SLA Invariant (24-Hour Strict SLA) ---
export function computeTicketSLA(registeredAt: string, now: number = Date.now()): {
  slaDeadline: string;
  slaStatus: SLAStatus;
  slaRemainingHours: number;
} {
  const regTime = new Date(registeredAt).getTime();
  const deadlineTime = regTime + 24 * 3600 * 1000; // 24 hours deadline
  const diffMs = deadlineTime - now;
  const slaRemainingHours = Math.round((diffMs / (3600 * 1000)) * 10) / 10;

  let slaStatus: SLAStatus = 'ON_TIME';
  if (diffMs <= 0) {
    slaStatus = 'EXPIRED';
  } else if (diffMs < 6 * 3600 * 1000) {
    slaStatus = 'WARNING'; // Less than 6 hours remaining
  }

  return {
    slaDeadline: new Date(deadlineTime).toISOString(),
    slaStatus,
    slaRemainingHours,
  };
}

// --- Invariant 2: Pure status reducer from append-only events (§8.2) ---
// Events recorded on a ticket that do not change its operational status
const NON_STATUS_EVENTS = new Set<TicketEvent['eventType']>(['PRESTATION_DECLARED']);

export function reduceTicketStatus(events: TicketEvent[], ticket: Partial<Ticket>): TicketStatus {
  const sorted = events.filter(e => !NON_STATUS_EVENTS.has(e.eventType)).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  if (!ticket.technicalZoneId && !ticket.sectorId) {
    return 'ZONE_TO_MAP';
  }

  if (sorted.length === 0) {
    return 'TO_ASSIGN';
  }

  const lastEvent = sorted[sorted.length - 1];

  switch (lastEvent.eventType) {
    case 'NF_SUBMITTED':
      return 'COMPLETED';
    case 'LITIGE_REPORTED':
      return 'LITIGE';
    // Litige reason accepted by the orienteur (RDV, GC…): on hold until sent back
    case 'LITIGE_VALIDATED':
      return 'SUSPENDED';
    case 'LITIGE_REOPENED':
      return 'REOPENED';
    case 'ASSIGNED':
    case 'REASSIGNED':
    case 'TELEGRAM_SENT':
      return 'ASSIGNED';
    case 'PROPOSED':
      return 'PROPOSED';
    case 'IMPORT':
    default:
      if (!ticket.technicalZoneId) {
        return 'ZONE_TO_MAP';
      }
      return 'TO_ASSIGN';
  }
}

// Ticket after appending `newEvent` (already included in `allTicketEvents`).
export function applyEventToTicket(ticket: Ticket, newEvent: TicketEvent, allTicketEvents: TicketEvent[]): Ticket {
  const newStatus = reduceTicketStatus(allTicketEvents, ticket);

  const updatedTicket: Ticket = {
    ...ticket,
    currentStatus: newStatus,
    isClosed: newStatus === 'COMPLETED',
    updatedAt: newEvent.createdAt,
    lastEventAt: newEvent.createdAt,
  };

  if (newEvent.technicianId) {
    updatedTicket.currentAssignedTechId = newEvent.technicianId;
  }

  if (newEvent.eventType === 'NF_SUBMITTED') {
    updatedTicket.completedAt = newEvent.createdAt;
  }

  if (newEvent.nfType) {
    updatedTicket.nfType = newEvent.nfType;
    updatedTicket.ontSerialNumber = newEvent.ontSerialNumber;
    updatedTicket.cableLengthMeters = newEvent.cableLengthMeters;
  }

  if (newEvent.litigeReasonCode) {
    updatedTicket.lastLitigeReasonCode = newEvent.litigeReasonCode;
    updatedTicket.lastLitigeReasonLabel = newEvent.litigeReasonLabel;
    updatedTicket.lastLitigeRdvDate = newEvent.rdvDateTime;
    updatedTicket.lastLitigeNotes = newEvent.notes;
    updatedTicket.lastLitigeNeedsContact = !!newEvent.requestNewContact;
    updatedTicket.lastVisitedTechName = newEvent.technicianName;
    updatedTicket.lastVisitedAt = newEvent.createdAt;
  }

  // The orienteur has handled the litige: no pending number request anymore
  if (newEvent.eventType === 'LITIGE_REOPENED' || newEvent.eventType === 'LITIGE_VALIDATED' || newEvent.eventType === 'REASSIGNED') {
    updatedTicket.lastLitigeNeedsContact = false;
  }

  // Each relance replaces the previous one: its note, and the new number with the one it replaces
  if (newEvent.eventType === 'LITIGE_REOPENED') {
    updatedTicket.lastDispatcherUpdateNotes = newEvent.dispatcherUpdateNotes || '';
    updatedTicket.reopenedWithNewPhone = newEvent.newClientPhone || '';
    updatedTicket.previousClientPhone = newEvent.newClientPhone ? ticket.clientPhone : '';
  }

  if (newEvent.newClientPhone) {
    updatedTicket.clientPhone = newEvent.newClientPhone;
    updatedTicket.reopenedWithNewPhone = newEvent.newClientPhone;
  }

  if (newEvent.dispatcherUpdateNotes) {
    updatedTicket.lastDispatcherUpdateNotes = newEvent.dispatcherUpdateNotes;
  }

  return updatedTicket;
}

const escapeHtml = (value: string | number | undefined) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Placeholder references ("N/A", "—") are not shown to the technician.
const hasClientRef = (ref?: string) => !!ref && !['N/A', '—', '-', ''].includes(ref.trim());

// Deadline line at the top of every work order, computed when the message is sent: the
// technician sees at once which interventions are late (24 h SLA from the claim).
export function formatSlaBanner(registeredAt: string | undefined, now: number = Date.now()): string {
  if (!registeredAt || isNaN(Date.parse(registeredAt))) return '';
  const sla = computeTicketSLA(registeredAt, now);
  const { text } = formatSLADisplay(sla.slaRemainingHours, sla.slaStatus);
  const due = escapeHtml(formatCasablancaDateTime(sla.slaDeadline));
  if (sla.slaStatus === 'EXPIRED') return `🔴 <b>HORS DÉLAI — PRIORITAIRE</b>\n⏱ En retard de <b>${text}</b> (échéance ${due})\n`;
  if (sla.slaStatus === 'WARNING') return `🟠 <b>URGENT</b> : plus que <b>${text}</b> avant hors délai (${due})\n`;
  return `🟢 Délai : reste ${text} (avant le ${due})\n`;
}

// Work order sent to the technician on Telegram (HTML parse mode).
// Separators are kept short so they never wrap on a phone screen.
export function formatTicketMessage(ticket: Ticket, now: number = Date.now()): string {
  let historyBanner = '';
  if (ticket.importOutcome === 'REPRISE') {
    historyBanner = `\n\n🔁 <b>REPRISE</b> : le client a de nouveau réclamé après l'intervention` +
      (ticket.completedAt ? ` du ${escapeHtml(formatCasablancaDateTime(ticket.completedAt))}` : '') +
      `.\n<i>Reprise de votre intervention : non facturable.</i>`;
  } else if (ticket.importOutcome === 'RETOUR_CLIENT') {
    historyBanner = `\n\n↩️ <b>RETOUR CLIENT</b> : ticket de nouveau réclamé.\n` +
      `• Litige précédent : ${escapeHtml(ticket.lastLitigeReasonLabel || 'Non précisé')}`;
  } else if (ticket.visitCount > 1) {
    historyBanner = `\n\n⚠️ <b>NOUVELLE RÉCLAMATION</b> (visite n°${ticket.visitCount})` +
      (ticket.lastVisitedTechName ? `\n• Ancien technicien : ${escapeHtml(ticket.lastVisitedTechName)}` : '');
  }

  let reopenBanner = '';
  if (ticket.lastDispatcherUpdateNotes) {
    reopenBanner = `\n\n🔄 <b>MISE À JOUR DE L'ORIENTEUR :</b>\n` +
      `"${escapeHtml(ticket.lastDispatcherUpdateNotes)}"\n` +
      (ticket.reopenedWithNewPhone ? `📞 Nouveau contact : <b>${escapeHtml(ticket.reopenedWithNewPhone)}</b>\n` : '');
  }

  const manualBanner = ticket.origin === 'MANUAL'
    ? `🛠 <b>${escapeHtml(manualNatureLabel(ticket.manualNature).toUpperCase())}</b> (hors ticket opérateur)\n` +
      (ticket.description ? `📝 ${escapeHtml(ticket.description)}\n` : '')
    : '';

  return (
    `🚨 <b>INTERVENTION FIBRE OPTIQUE 3GCOM</b>\n` +
    `━━━━━━━━━━━━━━\n` +
    formatSlaBanner(ticket.registeredAt, now) +
    manualBanner +
    `📋 <b>Ticket :</b> ${escapeHtml(ticket.ticketNumber)}\n` +
    `👤 <b>Abonné :</b> ${escapeHtml(ticket.clientName)}${hasClientRef(ticket.clientNumber) ? ` (Réf : ${escapeHtml(ticket.clientNumber)})` : ''}\n` +
    `📞 <b>Téléphone :</b> ${escapeHtml(formatPhonesIntl(ticket.clientPhone))}\n` +
    `📍 <b>Adresse :</b> ${escapeHtml(ticket.clientAddress)}\n` +
    `🏢 <b>Zone MSAN :</b> ${escapeHtml(ticket.rawZoneText)}` +
    (ticket.splitterRef ? `\n🔌 <b>Splitter :</b> ${escapeHtml(ticket.splitterRef)}` : '') +
    historyBanner +
    reopenBanner +
    `\n━━━━━━━━━━━━━━\n` +
    `<i>Répondez avec l'un des boutons ci-dessous.</i>`
  );
}

// Litige sent back by the orienteur: the message must read at a glance as a return from the
// office, with what changed first (new number to call, instructions), then a reminder of the
// ticket. Phone numbers are tappable in Telegram.
export function formatRelanceMessage(ticket: Ticket, now: number = Date.now()): string {
  const newPhone = ticket.reopenedWithNewPhone;
  const litigeDate = ticket.lastVisitedAt ? ` (le ${escapeHtml(formatCasablancaDateTime(ticket.lastVisitedAt))})` : '';
  return (
    `↩️ <b>RETOUR DE L'ORIENTEUR</b>\n` +
    `<b>Ticket ${escapeHtml(ticket.ticketNumber)}</b> : à reprendre\n` +
    `━━━━━━━━━━━━━━\n` +
    formatSlaBanner(ticket.registeredAt, now) +
    (newPhone
      ? `\n📞 <b>NOUVEAU NUMÉRO À APPELER</b>\n👉 <b>${escapeHtml(formatPhonesIntl(newPhone))}</b>\n` +
        (ticket.previousClientPhone ? `<s>Ancien : ${escapeHtml(formatPhonesIntl(ticket.previousClientPhone))}</s>\n` : '')
      : '') +
    (ticket.lastDispatcherUpdateNotes
      ? `\n💬 <b>Consigne de l'orienteur :</b>\n« ${escapeHtml(ticket.lastDispatcherUpdateNotes)} »\n`
      : '') +
    `━━━━━━━━━━━━━━\n` +
    `👤 ${escapeHtml(ticket.clientName)}\n` +
    (newPhone ? '' : `📞 ${escapeHtml(formatPhonesIntl(ticket.clientPhone))}\n`) +
    `📍 ${escapeHtml(ticket.clientAddress)} · ${escapeHtml(ticket.rawZoneText)}` +
    (ticket.splitterRef ? `\n🔌 Splitter ${escapeHtml(ticket.splitterRef)}` : '') +
    (ticket.lastLitigeReasonLabel ? `\n❌ Votre litige : ${escapeHtml(ticket.lastLitigeReasonLabel)}${litigeDate}` : '') +
    `\n━━━━━━━━━━━━━━\n` +
    `<i>Répondez avec les boutons ci-dessous.</i>`
  );
}

export function manualNatureLabel(nature?: ManualTicketNature): string {
  return MANUAL_TICKET_NATURES.find(n => n.code === nature)?.label || 'Intervention hors ticket';
}

// One work order for every ticket of a splitter incident: a single repair closes them all.
export function formatSplitterGroupMessage(splitterRef: string, tickets: Ticket[], now: number = Date.now()): string {
  const oldest = tickets.map(t => t.registeredAt).filter(Boolean).sort()[0];
  const lines = tickets.map((t, i) =>
    `${i + 1}. <b>${escapeHtml(t.ticketNumber)}</b> — ${escapeHtml(t.clientName)} · 📞 ${escapeHtml(formatPhonesIntl(t.clientPhone))}\n` +
    `    📍 ${escapeHtml(t.clientAddress)}`
  );
  return (
    `🔴 <b>INCIDENT SPLITTER ${escapeHtml(splitterRef)}</b>\n` +
    `━━━━━━━━━━━━━━\n` +
    formatSlaBanner(oldest, now) +
    `👥 <b>${tickets.length} clients impactés</b> · Zone ${escapeHtml(tickets[0]?.rawZoneText)}\n` +
    `Priorité : un seul problème à résoudre sur le splitter.\n\n` +
    lines.join('\n') +
    `\n━━━━━━━━━━━━━━\n` +
    `<i>Le compte-rendu (NF ou litige) s'applique aux ${tickets.length} tickets.</i>`
  );
}

// --- Strict Sum Check Invariant: every ticket is counted in exactly one category ---
export function computeSumCheck(tickets: Ticket[]): SumCheckResult {
  const totalTickets = tickets.length;

  let toAssign = 0;
  let zoneToMap = 0;
  let assigned = 0;
  let reopened = 0;
  let completed = 0;
  let litige = 0;
  let suspended = 0;

  const culpritTickets: { id: string; ticketNumber: string; reason: string }[] = [];

  tickets.forEach(t => {
    switch (t.currentStatus) {
      case 'TO_ASSIGN':
      case 'PROPOSED':
        toAssign++;
        break;
      case 'ZONE_TO_MAP':
        zoneToMap++;
        break;
      case 'ASSIGNED':
        assigned++;
        break;
      case 'REOPENED':
        reopened++;
        break;
      case 'COMPLETED':
        completed++;
        break;
      case 'LITIGE':
        litige++;
        break;
      case 'SUSPENDED':
        suspended++;
        break;
      default:
        culpritTickets.push({
          id: t.id,
          ticketNumber: t.ticketNumber,
          reason: `Statut inconnu : ${(t as any).currentStatus}`,
        });
    }
  });

  const sumOfCategories = toAssign + zoneToMap + assigned + reopened + completed + litige + suspended;
  const isBalanced = sumOfCategories === totalTickets;
  const discrepancy = totalTickets - sumOfCategories;

  return {
    totalTickets,
    sumOfCategories,
    isBalanced,
    discrepancy,
    breakdown: {
      toAssign,
      zoneToMap,
      assigned,
      reopened,
      completed,
      litige,
      suspended,
    },
    culpritTickets,
  };
}
