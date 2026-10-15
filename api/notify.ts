// POST /api/notify { ticketIds } — sends the work orders of freshly assigned tickets
// to the technicians on Telegram (splitter incidents grouped). Called after dispatch.
import { adminDb } from './_lib/admin.js';
import { requireStaff, canAccessSector, json, handleError, HttpError } from './_lib/http.js';
import { sendWorkOrdersTo } from './_lib/tickets.js';
import type { Technician, Ticket } from '../src/types/index.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireStaff(request);
    const { ticketIds } = (await request.json()) as { ticketIds?: unknown };
    if (!Array.isArray(ticketIds) || ticketIds.length === 0 || ticketIds.length > 100 || !ticketIds.every(id => typeof id === 'string')) {
      throw new HttpError(400, 'ticketIds invalide');
    }

    const db = adminDb();
    const results: { ticketId: string; sent: boolean; reason?: string }[] = [];
    const byTech = new Map<string, Ticket[]>();

    for (const ticketId of ticketIds as string[]) {
      const snap = await db.collection('tickets').doc(ticketId).get();
      const ticket = snap.exists ? ({ ...(snap.data() as Ticket), id: snap.id }) : null;
      if (!ticket || !canAccessSector(user, ticket.sectorId)) {
        results.push({ ticketId, sent: false, reason: 'Ticket inaccessible' });
      } else if (!ticket.currentAssignedTechId) {
        results.push({ ticketId, sent: false, reason: 'Aucun technicien affecté' });
      } else {
        byTech.set(ticket.currentAssignedTechId, [...(byTech.get(ticket.currentAssignedTechId) || []), ticket]);
      }
    }

    for (const [techId, tickets] of byTech) {
      const techSnap = await db.collection('technicians').doc(techId).get();
      if (!techSnap.exists) {
        tickets.forEach(t => results.push({ ticketId: t.id, sent: false, reason: 'Technicien introuvable' }));
        continue;
      }
      const tech = { ...(techSnap.data() as Technician), id: techSnap.id };
      try {
        await sendWorkOrdersTo(tech, tickets, new Set(tickets.map(t => t.id)));
        tickets.forEach(t => results.push({ ticketId: t.id, sent: true }));
      } catch (err: any) {
        tickets.forEach(t => results.push({ ticketId: t.id, sent: false, reason: err?.message || 'Échec Telegram' }));
      }
    }
    return json({ results });
  } catch (err) {
    return handleError(err);
  }
}
