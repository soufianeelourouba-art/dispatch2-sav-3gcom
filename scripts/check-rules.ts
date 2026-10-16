// Live check of firestore.rules against the real project:
//   node scripts/check-rules.ts
// Creates a temporary orienteur (sector sec-rab-sale) and two tickets, runs allowed and
// forbidden requests with that orienteur's ID token, then deletes everything it created.
import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseConfig } from './admin.ts';

const auth = getAuth();
const db = getFirestore();
const BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const MY_SECTOR = 'sec-rab-sale';
const OTHER_SECTOR = 'sec-cas-nord';

const email = `rules-check-${randomBytes(4).toString('hex')}@example.invalid`;
const password = randomBytes(18).toString('base64url');
const user = await auth.createUser({ email, password });
await db.doc(`users/${user.uid}`).set({ id: user.uid, email, username: email, name: 'Test règles', role: 'DISPATCHER', sectorIds: [MY_SECTOR] });
await db.doc('tickets/tkt-RULES-MINE').set({ id: 'tkt-RULES-MINE', ticketNumber: 'RULES-MINE', sectorId: MY_SECTOR });
await db.doc('tickets/tkt-RULES-OTHER').set({ id: 'tkt-RULES-OTHER', ticketNumber: 'RULES-OTHER', sectorId: OTHER_SECTOR });
await db.doc('photos/ph-RULES-MINE').set({ id: 'ph-RULES-MINE', ticketId: 'tkt-RULES-MINE', sectorId: MY_SECTOR, dataUrl: 'data:image/jpeg;base64,AA==' });
await db.doc('photos/ph-RULES-OTHER').set({ id: 'ph-RULES-OTHER', ticketId: 'tkt-RULES-OTHER', sectorId: OTHER_SECTOR, dataUrl: 'data:image/jpeg;base64,AA==' });

const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
}).then(r => r.json());
const idToken: string = signIn.idToken;

async function call(method: string, path: string, body?: unknown, token: string | null = idToken) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

const inQuery = (collection: string, field: string, values: string[]) => ({
  structuredQuery: {
    from: [{ collectionId: collection }],
    where: { fieldFilter: { field: { fieldPath: field }, op: 'IN', value: { arrayValue: { values: values.map(v => ({ stringValue: v })) } } } },
  },
});

const checks: [string, boolean, Promise<number>][] = [
  ['Lire son propre profil', true, call('GET', `/users/${user.uid}`)],
  ['Lire les tickets de son secteur', true, call('POST', ':runQuery', inQuery('tickets', 'sectorId', [MY_SECTOR]))],
  ['Lire les secteurs (référentiel)', true, call('GET', '/sectors')],
  ['Créer un ticket dans son secteur', true, call('PATCH', '/tickets/tkt-RULES-NEW', { fields: { sectorId: { stringValue: MY_SECTOR } } })],
  ['Lire les tickets d\'un autre secteur', false, call('POST', ':runQuery', inQuery('tickets', 'sectorId', [OTHER_SECTOR]))],
  ['Lire un ticket d\'un autre secteur', false, call('GET', '/tickets/tkt-RULES-OTHER')],
  ['Lister tous les tickets', false, call('GET', '/tickets')],
  ['Lister tous les comptes', false, call('GET', '/users')],
  ['Se promouvoir MANAGER', false, call('PATCH', `/users/${user.uid}?updateMask.fieldPaths=role`, { fields: { role: { stringValue: 'MANAGER' } } })],
  ['Créer un ticket dans un autre secteur', false, call('PATCH', '/tickets/tkt-RULES-HACK', { fields: { sectorId: { stringValue: OTHER_SECTOR } } })],
  ['Modifier un secteur', false, call('PATCH', '/sectors/sec-rab-sale?updateMask.fieldPaths=name', { fields: { name: { stringValue: 'x' } } })],
  ['Lire sans être connecté', false, call('GET', '/sectors/sec-rab-sale', undefined, null)],
  ['Lire une photo de son secteur', true, call('GET', '/photos/ph-RULES-MINE')],
  ['Lire une photo d\'un autre secteur', false, call('GET', '/photos/ph-RULES-OTHER')],
  ['Ajouter une photo (réservé au serveur)', false, call('PATCH', '/photos/ph-RULES-HACK', { fields: { sectorId: { stringValue: MY_SECTOR } } })],
];

let failures = 0;
for (const [label, shouldPass, statusPromise] of checks) {
  const status = await statusPromise;
  const passed = status === 200;
  const ok = passed === shouldPass;
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'}  ${shouldPass ? 'autorisé' : 'bloqué  '}  ${label} (HTTP ${status})`);
}

await Promise.all([
  auth.deleteUser(user.uid),
  db.doc(`users/${user.uid}`).delete(),
  ...['tkt-RULES-MINE', 'tkt-RULES-OTHER', 'tkt-RULES-NEW', 'tkt-RULES-HACK'].map(id => db.doc(`tickets/${id}`).delete()),
  ...['ph-RULES-MINE', 'ph-RULES-OTHER', 'ph-RULES-HACK'].map(id => db.doc(`photos/${id}`).delete()),
]);
console.log(failures === 0 ? '\nToutes les règles se comportent comme prévu.' : `\n${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
