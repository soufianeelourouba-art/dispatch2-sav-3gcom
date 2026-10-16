// POST /api/accounts — staff accounts managed by the manager.
//   { action: 'CREATE', name, email, password, role, sectorIds }
//   { action: 'DELETE', userId }
// Creation and deletion cover both the sign-in account (Firebase Auth) and the profile
// (users/{uid}: role + sectors). An e-mail whose access was removed earlier (sign-in account
// left without a profile) is reused with the new password instead of being refused.
import { adminAuth, adminDb } from './_lib/admin.js';
import { requireStaff, json, handleError, HttpError } from './_lib/http.js';
import type { User } from '../src/types/index.js';

const isAuthError = (err: unknown, code: string) => (err as { code?: string })?.code === code;

async function createAccount(body: Record<string, unknown>): Promise<User> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role === 'MANAGER' || body.role === 'DISPATCHER' ? body.role : null;
  const sectorIds = Array.isArray(body.sectorIds) ? body.sectorIds.filter((s): s is string => typeof s === 'string') : [];
  if (!name) throw new HttpError(400, 'Indiquez le nom.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Adresse e-mail invalide.');
  if (password.length < 6) throw new HttpError(400, 'Mot de passe trop faible (6 caractères minimum).');
  if (!role) throw new HttpError(400, 'Rôle invalide.');

  const auth = adminAuth();
  const db = adminDb();
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    if ((await db.collection('users').doc(existing.uid).get()).exists) {
      throw new HttpError(409, 'Un compte actif existe déjà avec cette adresse e-mail.');
    }
    // Access removed earlier: same sign-in account, new password, old sessions closed
    await auth.updateUser(existing.uid, { password, displayName: name, disabled: false });
    await auth.revokeRefreshTokens(existing.uid);
    uid = existing.uid;
  } catch (err) {
    if (!isAuthError(err, 'auth/user-not-found')) throw err;
    uid = (await auth.createUser({ email, password, displayName: name })).uid;
  }

  const ids = role === 'DISPATCHER' ? sectorIds : [];
  const user: User = {
    id: uid,
    username: email,
    email,
    name,
    role,
    ...(ids[0] ? { sectorId: ids[0] } : {}),
    sectorIds: ids,
    createdAt: new Date().toISOString(),
  };
  await db.collection('users').doc(uid).set(user);
  return user;
}

async function deleteAccount(manager: User, userId: unknown) {
  if (typeof userId !== 'string' || !userId) throw new HttpError(400, 'Compte invalide.');
  if (userId === manager.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
  await adminDb().collection('users').doc(userId).delete();
  try {
    await adminAuth().deleteUser(userId);
  } catch (err) {
    if (!isAuthError(err, 'auth/user-not-found')) throw err;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const manager = await requireStaff(request);
    if (manager.role !== 'MANAGER') throw new HttpError(403, 'Réservé au manager.');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === 'CREATE') return json({ user: await createAccount(body) });
    if (body.action === 'DELETE') {
      await deleteAccount(manager, body.userId);
      return json({ ok: true });
    }
    throw new HttpError(400, 'Action inconnue.');
  } catch (err) {
    return handleError(err);
  }
}
