// Server-side ticket operations shared by the Telegram webhook, the technician portal
// and the dispatch notifications.
import { randomBytes } from 'node:crypto';
import { adminDb } from './admin.js';
import { applyEventToTicket, formatTicketMessage } from '../../src/domain/tickets.js';
import { LITIGE_REASONS } from '../../src/types/index.js';
import type { LitigeReasonCode, Technician, Ticket, TicketEvent } from '../../src/types/index.js';
import { sendMessage } from './telegram.js';

export class AccessError extends Error {}

const clean = <T extends object>(data: T): T =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T;

export async function findTechnicianByToken(token: string): Promise<Technician | null> {
  if (!/^act_[A-Za-z0-9_]{6,}$/.test(token)) return null;
  const snap = await adminDb().collection('technicians').where('telegramActivationToken', '==', token).limit(1).get();
  return snap.empty ? null : ({ ...(snap.docs[0].data() as Technician), id: snap.docs[0].id });
}

export async function findTechnicianByChat(chatId: string): Promise<Technician | null> {
  const snap = await adminDb().collection('technicians').where('telegramChatId', '==', chatId).limit(1).get();
  return snap.empty ? null : ({ ...(snap.docs[0].data() as Technician), id: snap.docs[0].id });
}

export function technicianIsBlocked(tech: Technician): boolean {
  return !tech.isActive || !!tech.telegramLinkDisabled || tech.telegramActivationStatus === 'REVOKED';
}

export async function openTicketsOf(techId: string): Promise<Ticket[]> {
  const snap = await adminDb().collection('tickets')
    .where('currentAssignedTechId', '==', techId)
    .where('isClosed', '==', false)
    .get();
  return snap.docs.map(d => ({ ...(d.data() as Ticket), id: d.id }));
}

export type TechnicianReport =
  | { kind: 'NF'; nfType: 'STANDARD' | 'CENTRAL_CONFIG'; ontSerialNumber?: string; cableLengthMeters?: number; notes?: string }
  | { kind: 'LITIGE'; reasonCode: LitigeReasonCode; rdvDateTime?: string; notes?: string };

// Appends the technician's NF / litige event and updates the ticket atomically.
// Only the technician currently assigned to an open ticket may report on it.
export async function recordTechnicianReport(tech: Technician, ticketId: string, report: TechnicianReport): Promise<Ticket> {
  const db = adminDb();
  const ticketRef = db.collection('tickets').doc(ticketId);

  return db.runTransaction(async tx => {
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists) throw new AccessError('Ticket introuvable.');
    const ticket = { ...(ticketSnap.data() as Ticket), id: ticketSnap.id };
    if (ticket.currentAssignedTechId !== tech.id) throw new AccessError('Ce ticket ne vous est plus affecté.');
    if (ticket.isClosed) throw new AccessError('Ce ticket est déjà clôturé.');

    const eventsSnap = await tx.get(db.collection('events').where('ticketId', '==', ticketId));
    const events = eventsSnap.docs.map(d => d.data() as TicketEvent);

    const base = {
      id: `evt-${Date.now()}-${randomBytes(3).toString('hex')}`,
      ticketId,
      sectorId: ticket.sectorId || null,
      actorRole: 'TECHNICIAN' as const,
      actorName: tech.fullName,
      technicianId: tech.id,
      technicianName: tech.fullName,
      createdAt: new Date().toISOString(),
    };
    const event: TicketEvent = report.kind === 'NF'
      ? {
          ...base,
          eventType: 'NF_SUBMITTED',
          nfType: report.nfType,
          ontSerialNumber: report.ontSerialNumber,
          cableLengthMeters: report.cableLengthMeters,
          notes: report.notes || `Intervention NF validée (${report.nfType === 'CENTRAL_CONFIG' ? 'config centrale' : 'standard'}).`,
        }
      : {
          ...base,
          eventType: 'LITIGE_REPORTED',
          litigeReasonCode: report.reasonCode,
          litigeReasonLabel: LITIGE_REASONS.find(r => r.code === report.reasonCode)?.label || report.reasonCode,
          rdvDateTime: report.rdvDateTime,
          notes: report.notes,
        };

    const updated = applyEventToTicket(ticket, event, [...events, event]);
    tx.set(db.collection('events').doc(event.id), clean(event));
    tx.set(ticketRef, clean(updated));
    return updated;
  });
}

export const workOrderButtons = (ticketId: string) => [[
  { text: '🟢 NF (Normalisé)', callback_data: `nf:${ticketId}` },
  { text: '🔴 Litige (LC)', callback_data: `lit:${ticketId}` },
]];

// Sends the work order to the assigned technician and records TELEGRAM_SENT.
export async function sendWorkOrder(ticket: Ticket): Promise<{ sent: boolean; reason?: string }> {
  const db = adminDb();
  if (!ticket.currentAssignedTechId) return { sent: false, reason: 'Aucun technicien affecté' };
  const techSnap = await db.collection('technicians').doc(ticket.currentAssignedTechId).get();
  if (!techSnap.exists) return { sent: false, reason: 'Technicien introuvable' };
  const tech = { ...(techSnap.data() as Technician), id: techSnap.id };
  if (!tech.telegramChatId) return { sent: false, reason: `${tech.fullName} n'a pas activé Telegram` };
  if (technicianIsBlocked(tech)) return { sent: false, reason: `Accès Telegram de ${tech.fullName} suspendu` };

  await sendMessage(tech.telegramChatId, formatTicketMessage(ticket), workOrderButtons(ticket.id));

  const event: TicketEvent = {
    id: `evt-${Date.now()}-${randomBytes(3).toString('hex')}`,
    ticketId: ticket.id,
    sectorId: ticket.sectorId || null,
    eventType: 'TELEGRAM_SENT',
    actorRole: 'SYSTEM',
    actorName: 'Bot Telegram 3GCOM',
    technicianId: tech.id,
    technicianName: tech.fullName,
    notes: `Ordre de travail transmis sur le Telegram de ${tech.fullName}.`,
    createdAt: new Date().toISOString(),
  };
  await db.collection('events').doc(event.id).set(clean(event));
  return { sent: true };
}
