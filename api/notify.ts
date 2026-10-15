// POST /api/notify { ticketIds } — sends the work orders of freshly assigned tickets
// to the technicians on Telegram. Called by the orienteur's browser after dispatch.
import { adminDb } from './_lib/admin.js';
import { requireStaff, canAccessSector, json, handleError, HttpError } from './_lib/http.js';
import { sendWorkOrder } from './_lib/tickets.js';
import type { Ticket } from '../src/types/index.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireStaff(request);
    const { ticketIds } = (await request.json()) as { ticketIds?: unknown };
    if (!Array.isArray(ticketIds) || ticketIds.length === 0 || ticketIds.length > 100 || !ticketIds.every(id => typeof id === 'string')) {
      throw new HttpError(400, 'ticketIds invalide');
    }

    const results = [];
    for (const ticketId of ticketIds as string[]) {
      const snap = await adminDb().collection('tickets').doc(ticketId).get();
      const ticket = snap.exists ? ({ ...(snap.data() as Ticket), id: snap.id }) : null;
      if (!ticket || !canAccessSector(user, ticket.sectorId)) {
        results.push({ ticketId, sent: false, reason: 'Ticket inaccessible' });
        continue;
      }
      try {
        results.push({ ticketId, ...(await sendWorkOrder(ticket)) });
      } catch (err: any) {
        results.push({ ticketId, sent: false, reason: err?.message || 'Échec Telegram' });
      }
    }
    return json({ results });
  } catch (err) {
    return handleError(err);
  }
}
