// Pure ticket rules, shared by the browser (storage.ts) and the server (api/).
// No Firebase or browser imports here.
import type { SLAStatus, Ticket, TicketEvent, TicketStatus } from '../types';

// --- SLA Invariant (24-Hour Strict SLA) ---
export function computeTicketSLA(registeredAt: string): {
  slaDeadline: string;
  slaStatus: SLAStatus;
  slaRemainingHours: number;
} {
  const regTime = new Date(registeredAt).getTime();
  const deadlineTime = regTime + 24 * 3600 * 1000; // 24 hours deadline
  const now = Date.now();
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
export function reduceTicketStatus(events: TicketEvent[], ticket: Partial<Ticket>): TicketStatus {
  const sorted = [...events].sort(
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
    case 'LITIGE_VALIDATED':
      return 'LITIGE';
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

  if (newEvent.nfType) {
    updatedTicket.nfType = newEvent.nfType;
    updatedTicket.ontSerialNumber = newEvent.ontSerialNumber;
    updatedTicket.cableLengthMeters = newEvent.cableLengthMeters;
  }

  if (newEvent.litigeReasonCode) {
    updatedTicket.lastLitigeReasonCode = newEvent.litigeReasonCode;
    updatedTicket.lastLitigeReasonLabel = newEvent.litigeReasonLabel;
    updatedTicket.lastLitigeRdvDate = newEvent.rdvDateTime;
    updatedTicket.lastVisitedTechName = newEvent.technicianName;
    updatedTicket.lastVisitedAt = newEvent.createdAt;
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

// Work order sent to the technician on Telegram (HTML parse mode).
export function formatTicketMessage(ticket: Ticket): string {
  let historyBanner = '';
  if (ticket.visitCount > 1) {
    historyBanner = `\n\n⚠️ <b>DEUXIÈME VISITE (SAV RÉCLAMATION)</b>\n` +
      `• Précédent échec : ${escapeHtml(ticket.lastLitigeReasonLabel || 'Litige précédent')}\n` +
      `• Ancien technicien : ${escapeHtml(ticket.lastVisitedTechName || 'Non précisé')}`;
  }

  let reopenBanner = '';
  if (ticket.lastDispatcherUpdateNotes) {
    reopenBanner = `\n\n🔄 <b>MISE À JOUR DE L'ORIENTEUR :</b>\n` +
      `"${escapeHtml(ticket.lastDispatcherUpdateNotes)}"\n` +
      (ticket.reopenedWithNewPhone ? `📞 Nouveau contact : <b>${escapeHtml(ticket.reopenedWithNewPhone)}</b>\n` : '');
  }

  return (
    `🚨 <b>INTERVENTION FIBRE OPTIQUE 3GCOM</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Ticket :</b> ${escapeHtml(ticket.ticketNumber)}\n` +
    `👤 <b>Abonné :</b> ${escapeHtml(ticket.clientName)} (Réf : ${escapeHtml(ticket.clientNumber)})\n` +
    `📞 <b>Téléphone :</b> ${escapeHtml(ticket.clientPhone)}\n` +
    `📍 <b>Adresse :</b> ${escapeHtml(ticket.clientAddress)}\n` +
    `🏢 <b>Zone MSAN :</b> ${escapeHtml(ticket.rawZoneText)}` +
    historyBanner +
    reopenBanner +
    `\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Répondez avec l'un des boutons ci-dessous.</i>`
  );
}
