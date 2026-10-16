// End-to-end check of api/ticket-owners.ts on temporary data (deleted at the end): an orienteur
// importing a file is told which tickets already belong to another sector.
//   npx jiti scripts/e2e-ticket-owners.ts
import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';
import firebaseConfig from '../firebase-applet-config.json';

const { POST: ticketOwners } = await import('../api/ticket-owners.ts');
const { ticketDocId } = await import('../src/domain/ticketId.ts');
const auth = getAuth();
const db = getFirestore();
const tag = randomBytes(3).toString('hex');
const MINE = `sec-e2e-mine-${tag}`;
const OTHER = `sec-e2e-other-${tag}`;
const numbers = { mine: `E2E${tag}A`, other: `E2E${tag}B`, unknown: `E2E${tag}C` };

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'}  ${label}${ok ? '' : ` → ${JSON.stringify(detail)}`}`);
}

const email = `e2e-owners-${tag}@example.invalid`;
const password = randomBytes(12).toString('hex');
let uid = '';
try {
  uid = (await auth.createUser({ email, password })).uid;
  await db.doc(`users/${uid}`).set({ id: uid, email, username: email, name: 'Orienteur E2E', role: 'DISPATCHER', sectorIds: [MINE], sectorId: MINE });
  await db.doc(`sectors/${OTHER}`).set({ id: OTHER, name: 'Secteur voisin E2E', code: 'E2E', dcId: 'x' });
  await db.doc(`tickets/${ticketDocId(numbers.mine)}`).set({ ticketNumber: numbers.mine, sectorId: MINE });
  await db.doc(`tickets/${ticketDocId(numbers.other)}`).set({ ticketNumber: numbers.other, sectorId: OTHER });

  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const token = (await login.json()).idToken;
  const res = await ticketOwners(new Request('https://test.local/api/ticket-owners', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketNumbers: Object.values(numbers) }),
  }));
  const { owners } = await res.json() as { owners: Record<string, string> };
  check('Ticket d\'un autre secteur : signalé avec le nom du secteur', owners[numbers.other] === 'Secteur voisin E2E', owners);
  check('Ticket de son propre secteur : pas signalé', !(numbers.mine in owners), owners);
  check('Nouveau ticket : pas signalé', !(numbers.unknown in owners), owners);

  const anonymous = await ticketOwners(new Request('https://test.local/api/ticket-owners', { method: 'POST', body: '{}' }));
  check('Sans connexion : refusé', anonymous.status === 401, anonymous.status);
} finally {
  await Promise.all([
    db.doc(`tickets/${ticketDocId(numbers.mine)}`).delete(),
    db.doc(`tickets/${ticketDocId(numbers.other)}`).delete(),
    db.doc(`sectors/${OTHER}`).delete(),
    uid ? db.doc(`users/${uid}`).delete() : null,
    uid ? auth.deleteUser(uid) : null,
  ]);
  console.log('Données de test supprimées.');
}
console.log(failures === 0 ? 'Contrôle des tickets d\'autres secteurs : tout fonctionne.' : `${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
