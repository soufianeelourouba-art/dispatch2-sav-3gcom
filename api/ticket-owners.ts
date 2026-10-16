// POST /api/ticket-owners { ticketNumbers } — before an import: which of these tickets already
// belong to a sector the orienteur cannot see. Only the sector name is returned. Without this
// check, the orienteur's browser takes them for new tickets and the access rules then refuse
// to overwrite them: they appear, then vanish.
import { adminDb } from './_lib/admin.js';
import { requireStaff, canAccessSector, json, handleError, HttpError } from './_lib/http.js';
import { ticketDocId } from '../src/domain/ticketId.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireStaff(request);
    const { ticketNumbers } = (await request.json().catch(() => ({}))) as { ticketNumbers?: unknown };
    if (!Array.isArray(ticketNumbers) || ticketNumbers.length > 5000 || !ticketNumbers.every(n => typeof n === 'string' && n.trim())) {
      throw new HttpError(400, 'ticketNumbers invalide');
    }
    const db = adminDb();
    const numbers = [...new Set(ticketNumbers as string[])];
    const owners: Record<string, string> = {};
    const sectorNames = new Map<string, string>();

    for (let i = 0; i < numbers.length; i += 300) {
      const part = numbers.slice(i, i + 300);
      const snaps = part.length ? await db.getAll(...part.map(n => db.collection('tickets').doc(ticketDocId(n)))) : [];
      for (const [k, snap] of snaps.entries()) {
        const sectorId = snap.exists ? (snap.get('sectorId') as string | undefined) : undefined;
        if (!snap.exists || canAccessSector(user, sectorId)) continue;
        if (sectorId && !sectorNames.has(sectorId)) {
          const sector = await db.collection('sectors').doc(sectorId).get();
          sectorNames.set(sectorId, (sector.get('name') as string) || 'autre secteur');
        }
        owners[part[k]] = (sectorId && sectorNames.get(sectorId)) || 'autre secteur';
      }
    }
    return json({ owners });
  } catch (err) {
    return handleError(err);
  }
}
