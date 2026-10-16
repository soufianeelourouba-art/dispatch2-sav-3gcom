// Litiges validated before the "Suspendu" status existed are still stored as LITIGE.
// Recomputes their status from their events. Dry run by default:
//   npx jiti scripts/migrate-suspended.ts          → lists the tickets concerned
//   npx jiti scripts/migrate-suspended.ts --apply  → updates them
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';
import { reduceTicketStatus } from '../src/domain/tickets.ts';
import type { Ticket, TicketEvent } from '../src/types/index.ts';

const apply = process.argv.includes('--apply');
const db = getFirestore();
const litiges = await db.collection('tickets').where('currentStatus', '==', 'LITIGE').get();

let count = 0;
for (const doc of litiges.docs) {
  const ticket = doc.data() as Ticket;
  const events = (await db.collection('events').where('ticketId', '==', doc.id).get()).docs.map(d => d.data() as TicketEvent);
  if (reduceTicketStatus(events, ticket) !== 'SUSPENDED') continue;
  count++;
  console.log(`${ticket.ticketNumber} — ${ticket.lastLitigeReasonLabel || 'litige'}${ticket.lastLitigeRdvDate ? ` (RDV ${ticket.lastLitigeRdvDate})` : ''} → Suspendu`);
  if (apply) await doc.ref.update({ currentStatus: 'SUSPENDED', updatedAt: new Date().toISOString() });
}
console.log(`${litiges.size} ticket(s) en litige, ${count} déjà validé(s) ${apply ? 'passé(s) en Suspendu' : 'à passer en Suspendu (relancer avec --apply)'}.`);
