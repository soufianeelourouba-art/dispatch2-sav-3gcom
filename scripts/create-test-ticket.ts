// Creates a demo ticket (status TO_ASSIGN) in the zone of the technician who most recently
// linked Telegram, to test the dispatch → Telegram → NF / litige loop end to end.
//   node scripts/create-test-ticket.ts
import { randomBytes } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';
import { computeTicketSLA } from '../src/domain/tickets.ts';
import type { Technician, Ticket, TicketEvent } from '../src/types/index.ts';

const db = getFirestore();

const settings = await db.doc('settings/telegram_info').get();
console.log('Bot connecté :', settings.exists ? `@${settings.data()!.username}` : 'aucun');

const linked = (await db.collection('technicians').where('telegramActivationStatus', '==', 'ACTIVATED').get())
  .docs.map(d => ({ ...(d.data() as Technician), id: d.id }))
  .filter(t => t.telegramChatId && !t.telegramChatId.startsWith('chat_'))
  .sort((a, b) => (b.telegramActivatedAt || '').localeCompare(a.telegramActivatedAt || ''));
if (linked.length === 0) {
  console.log('Aucun technicien lié à Telegram pour le moment.');
  process.exit(1);
}
const tech = linked[0];
const zoneId = tech.zoneIds[0];
const zone = zoneId ? (await db.doc(`technicalZones/${zoneId}`).get()).data() : undefined;
const sector = (await db.doc(`sectors/${tech.sectorId}`).get()).data();
console.log(`Technicien : ${tech.fullName} — secteur ${sector?.name ?? tech.sectorId}, zone ${zone?.label ?? 'aucune'}`);

const number = `TEST-${randomBytes(3).toString('hex').toUpperCase()}`;
const now = new Date().toISOString();
const ticket: Ticket = {
  id: `tkt-${number}`,
  ticketNumber: number,
  clientNumber: '0522000000',
  clientName: 'Client Test',
  clientPhone: '+212 600 000000',
  clientAddress: '12 rue du Test',
  rawZoneText: zone?.msanCode || zone?.label || 'ZONE TEST',
  technicalZoneId: zoneId,
  sectorId: tech.sectorId,
  registeredAt: now,
  visitCount: 1,
  currentStatus: 'TO_ASSIGN',
  isClosed: false,
  ...computeTicketSLA(now),
  createdAt: now,
  updatedAt: now,
};
const event: TicketEvent = {
  id: `evt-${Date.now()}-${randomBytes(3).toString('hex')}`,
  ticketId: ticket.id,
  sectorId: ticket.sectorId,
  eventType: 'IMPORT',
  actorRole: 'SYSTEM',
  actorName: 'Ticket de test',
  notes: 'Ticket créé pour tester la boucle Telegram.',
  createdAt: now,
};
await db.doc(`tickets/${ticket.id}`).set(JSON.parse(JSON.stringify(ticket)));
await db.doc(`events/${event.id}`).set(event);
console.log(`Ticket ${number} créé (à affecter).`);
