// Server-side ticket operations shared by the Telegram webhook, the technician portal
// and the dispatch notifications.
import { randomBytes } from 'node:crypto';
import { adminDb } from './admin.js';
import { applyEventToTicket, formatTicketMessage, formatSplitterGroupMessage } from '../../src/domain/tickets.js';
import { splitterKey } from '../../src/domain/splitter.js';
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
// An NF leaves the prestation "à déclarer" unless `extra` says otherwise.
export async function recordTechnicianReport(
  tech: Technician,
  ticketId: string,
  report: TechnicianReport,
  extra: Partial<Ticket> = {}
): Promise<Ticket> {
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

    const updated: Ticket = {
      ...applyEventToTicket(ticket, event, [...events, event]),
      ...(report.kind === 'NF' ? { prestationStatus: 'A_DECLARER' as const } : {}),
      ...extra,
    };
    tx.set(db.collection('events').doc(event.id), clean(event));
    tx.set(ticketRef, clean(updated));
    return updated;
  });
}

// Callback data "g.<action>:<ticketId>" applies the action to the whole splitter incident.
export const workOrderButtons = (ticketId: string, group = false) => {
  const p = group ? 'g.' : '';
  return [[
    { text: group ? '🟢 NF splitter (tous)' : '🟢 NF (Normalisé)', callback_data: `${p}nf:${ticketId}` },
    { text: group ? '🔴 Litige splitter (tous)' : '🔴 Litige (LC)', callback_data: `${p}lit:${ticketId}` },
  ]];
};

// Open tickets of the technician on the same splitter as `ticket` (including it).
export async function splitterSiblings(tech: Technician, ticket: Ticket): Promise<Ticket[]> {
  const key = splitterKey(ticket);
  if (!key) return [ticket];
  return (await openTicketsOf(tech.id)).filter(t => splitterKey(t) === key);
}

// NF / litige on every open ticket of the splitter incident (or just the ticket without splitter).
// For an NF the prestation is paid once: the ticket acted on carries it ("lead"), the others
// are "INCLUSE" and point to it. Returned list starts with the lead.
export async function recordSplitterReport(
  tech: Technician,
  ticketId: string,
  report: TechnicianReport,
  leadExtra: Partial<Ticket> = {}
): Promise<Ticket[]> {
  const snap = await adminDb().collection('tickets').doc(ticketId).get();
  if (!snap.exists) throw new AccessError('Ticket introuvable.');
  const ticket = { ...(snap.data() as Ticket), id: snap.id };
  const siblings = ticket.splitterRef ? await splitterSiblings(tech, ticket) : [ticket];
  if (siblings.length === 0) throw new AccessError('Aucun ticket ouvert sur ce splitter ne vous est affecté.');

  const notes = ticket.splitterRef && siblings.length > 1
    ? `${report.notes ? report.notes + ' — ' : ''}Compte-rendu collectif splitter ${ticket.splitterRef} (${siblings.length} tickets).`
    : report.notes;
  const ordered = [...siblings].sort((a, b) => Number(b.id === ticketId) - Number(a.id === ticketId));
  const updated: Ticket[] = [];
  for (const sibling of ordered) {
    const lead = updated[0];
    const extra = report.kind === 'NF' && lead
      ? { prestationStatus: 'INCLUSE' as const, collectiveLeadTicketId: lead.id }
      : report.kind === 'NF' ? leadExtra : {};
    try {
      updated.push(await recordTechnicianReport(tech, sibling.id, { ...report, notes }, extra));
    } catch (err) {
      if (!(err instanceof AccessError)) throw err; // a sibling closed meanwhile: skip it
    }
  }
  if (updated.length === 0) throw new AccessError('Ces tickets ne vous sont plus affectés ou sont déjà clôturés.');
  return updated;
}

async function recordTelegramSent(tech: Technician, ticket: Ticket, note: string) {
  const event: TicketEvent = {
    id: `evt-${Date.now()}-${randomBytes(3).toString('hex')}`,
    ticketId: ticket.id,
    sectorId: ticket.sectorId || null,
    eventType: 'TELEGRAM_SENT',
    actorRole: 'SYSTEM',
    actorName: 'Bot Telegram 3GCOM',
    technicianId: tech.id,
    technicianName: tech.fullName,
    notes: note,
    createdAt: new Date().toISOString(),
  };
  await adminDb().collection('events').doc(event.id).set(clean(event));
}

/**
 * Sends work orders to one technician. Tickets sharing a splitter with at least one other open
 * ticket of this technician are sent as a single grouped message. TELEGRAM_SENT is recorded for
 * the tickets listed in `recordFor` (the ones just dispatched).
 */
export async function sendWorkOrdersTo(tech: Technician, tickets: Ticket[], recordFor: Set<string> = new Set()) {
  if (!tech.telegramChatId) throw new AccessError(`${tech.fullName} n'a pas activé Telegram`);
  if (technicianIsBlocked(tech)) throw new AccessError(`Accès Telegram de ${tech.fullName} suspendu`);

  const allOpen = await openTicketsOf(tech.id);
  const handled = new Set<string>();
  for (const ticket of tickets) {
    if (handled.has(ticket.id)) continue;
    const key = splitterKey(ticket);
    const group = key ? allOpen.filter(t => splitterKey(t) === key) : [];
    if (group.length > 1) {
      group.forEach(t => handled.add(t.id));
      await sendMessage(tech.telegramChatId, formatSplitterGroupMessage(ticket.splitterRef!, group), workOrderButtons(ticket.id, true));
      for (const t of group.filter(t => recordFor.has(t.id))) {
        await recordTelegramSent(tech, t, `Incident splitter ${ticket.splitterRef} (${group.length} tickets) transmis sur le Telegram de ${tech.fullName}.`);
      }
    } else {
      handled.add(ticket.id);
      await sendMessage(tech.telegramChatId, formatTicketMessage(ticket), workOrderButtons(ticket.id));
      if (recordFor.has(ticket.id)) {
        await recordTelegramSent(tech, ticket, `Ordre de travail transmis sur le Telegram de ${tech.fullName}.`);
      }
    }
  }
}
