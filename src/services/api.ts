// Calls to the server functions (Vercel /api), authenticated with the Firebase ID token.
import { auth } from './firebase';
import type { User } from '../types';

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Session expirée, veuillez vous reconnecter.');
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`);
  return data as T;
}

export interface NotifyResult {
  ticketId: string;
  sent: boolean;
  reason?: string;
}

export function notifyTechnicians(ticketIds: string[]) {
  return authedPost<{ results: NotifyResult[] }>('/api/notify', { ticketIds });
}

export function setupTelegramBot() {
  return authedPost<{ username: string; webhookUrl: string }>('/api/telegram-setup', {});
}

// Staff accounts (manager only): sign-in account + profile, created or removed together
export function createStaffAccount(data: { name: string; email: string; password: string; role: User['role']; sectorIds: string[] }) {
  return authedPost<{ user: User }>('/api/accounts', { action: 'CREATE', ...data });
}

export function deleteStaffAccount(userId: string) {
  return authedPost<{ ok: true }>('/api/accounts', { action: 'DELETE', userId });
}
