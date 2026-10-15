import { adminAuth, adminDb } from './admin.js';
import type { User } from '../../src/types/index.js';

export const json = (data: unknown, status = 200) => Response.json(data, { status });

// Resolves the signed-in staff member (manager / orienteur) from the Firebase ID token.
export async function requireStaff(request: Request): Promise<User> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Non authentifié');
  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    throw new HttpError(401, 'Session invalide');
  }
  const profile = await adminDb().collection('users').doc(uid).get();
  if (!profile.exists) throw new HttpError(403, 'Aucun profil associé à ce compte');
  return { ...(profile.data() as User), id: uid };
}

export function canAccessSector(user: User, sectorId?: string | null): boolean {
  if (user.role === 'MANAGER') return true;
  return !!sectorId && (user.sectorIds || []).includes(sectorId);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function handleError(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: 'Erreur interne' }, 500);
}
