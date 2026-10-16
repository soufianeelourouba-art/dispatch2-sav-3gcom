// End-to-end check of the staff accounts API (api/accounts.ts) on temporary accounts
// (deleted at the end): create, delete, re-create with the same e-mail, reuse of an e-mail
// whose profile was removed by the former version of the app.
//   npx jiti scripts/e2e-accounts.ts
import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';
import firebaseConfig from '../firebase-applet-config.json';

const { POST: accounts } = await import('../api/accounts.ts');
const auth = getAuth();
const db = getFirestore();
const tag = randomBytes(3).toString('hex');
const email = (n: string) => `e2e-acc-${n}-${tag}@example.invalid`;
const created = new Set<string>();

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'}  ${label}${ok ? '' : ` → ${JSON.stringify(detail)}`}`);
}

// ID token of a temporary account (password sign-in through the Auth REST API)
async function idTokenOf(mail: string, password: string) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail, password, returnSecureToken: true }),
  });
  return (await res.json()).idToken as string;
}

const call = async (token: string, body: unknown) => {
  const res = await accounts(new Request('https://test.local/api/accounts', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() as any };
};
const signIn = async (mail: string, password: string) => (await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail, password, returnSecureToken: true }) },
)).ok;

try {
  const managerPassword = randomBytes(12).toString('hex');
  const manager = await auth.createUser({ email: email('manager'), password: managerPassword });
  created.add(manager.uid);
  await db.doc(`users/${manager.uid}`).set({ id: manager.uid, email: email('manager'), username: email('manager'), name: 'Manager E2E', role: 'MANAGER', sectorIds: [] });
  const token = await idTokenOf(email('manager'), managerPassword);

  const orienteur = { name: 'Orienteur E2E', email: email('orienteur'), password: 'motdepasse1', role: 'DISPATCHER', sectorIds: ['sec-x'] };
  const first = await call(token, { action: 'CREATE', ...orienteur });
  created.add(first.data.user?.id);
  check('Création : compte et profil', first.status === 200 && (await db.doc(`users/${first.data.user.id}`).get()).data()?.sectorIds?.[0] === 'sec-x', first);
  check('Création : connexion avec le mot de passe', await signIn(orienteur.email, orienteur.password));

  const duplicate = await call(token, { action: 'CREATE', ...orienteur });
  check('Adresse d\'un compte actif : refusée', duplicate.status === 409, duplicate);

  const removed = await call(token, { action: 'DELETE', userId: first.data.user.id });
  check('Suppression : profil supprimé', removed.status === 200 && !(await db.doc(`users/${first.data.user.id}`).get()).exists, removed);
  check('Suppression : connexion impossible', !(await signIn(orienteur.email, orienteur.password)));

  const again = await call(token, { action: 'CREATE', ...orienteur, password: 'nouveau22' });
  created.add(again.data.user?.id);
  check('Recréation avec la même adresse', again.status === 200 && await signIn(orienteur.email, 'nouveau22'), again);

  // Former behaviour: profile deleted, sign-in account left behind
  const orphan = await auth.createUser({ email: email('orphelin'), password: 'ancien123' });
  created.add(orphan.uid);
  const reused = await call(token, { action: 'CREATE', name: 'Orphelin', email: email('orphelin'), password: 'neuf1234', role: 'DISPATCHER', sectorIds: [] });
  check('Adresse d\'un ancien compte supprimé : réutilisée', reused.status === 200 && reused.data.user.id === orphan.uid, reused);
  check('Ancien compte : nouveau mot de passe actif, ancien refusé', await signIn(email('orphelin'), 'neuf1234') && !(await signIn(email('orphelin'), 'ancien123')));

  const self = await call(token, { action: 'DELETE', userId: manager.uid });
  check('Le manager ne peut pas supprimer son propre compte', self.status === 400, self);

  const orienteurToken = await idTokenOf(orienteur.email, 'nouveau22');
  const forbidden = await call(orienteurToken, { action: 'CREATE', name: 'X', email: email('x'), password: 'abcdef12', role: 'MANAGER', sectorIds: [] });
  check('Un orienteur ne peut pas créer de compte', forbidden.status === 403, forbidden);
} finally {
  for (const uid of created) {
    if (!uid) continue;
    await db.doc(`users/${uid}`).delete();
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`Comptes de test supprimés (${created.size}).`);
}
console.log(failures === 0 ? 'Gestion des comptes : tout fonctionne.' : `${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
