// One-off project initialisation, run by an administrator from their own machine:
//   node scripts/bootstrap.ts <manager-email> "<manager name>"
// Uses the Firebase CLI login (`firebase login`) as credentials — no service-account key needed.
// - creates the first MANAGER account (the password is chosen by the manager via a reset e-mail)
// - seeds the demo referential (DC, sectors, zones, aliases, technicians) when the database is empty
import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseConfig } from './admin.ts';
import {
  INITIAL_DCS,
  INITIAL_SECTORS,
  INITIAL_TECHNICAL_ZONES,
  INITIAL_ZONE_ALIASES,
  INITIAL_TECHNICIANS,
} from '../src/data/initialReferential.ts';

const [email, name = 'Manager National'] = process.argv.slice(2);
if (!email) {
  console.error('Usage : node scripts/bootstrap.ts <email-manager> "<Nom du manager>"');
  process.exit(1);
}

const auth = getAuth();
const db = getFirestore();

async function ensureManager() {
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    console.log(`Compte existant : ${email}`);
  } catch {
    uid = (await auth.createUser({
      email,
      displayName: name,
      // Throwaway password: the manager sets their own through the reset e-mail.
      password: randomBytes(24).toString('base64url'),
    })).uid;
    console.log(`Compte créé : ${email}`);
  }
  await db.doc(`users/${uid}`).set(
    { id: uid, username: email, email, name, role: 'MANAGER', sectorIds: [], createdAt: new Date().toISOString() },
    { merge: true }
  );

  // Firebase sends the password-setup e-mail itself.
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseConfig.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    }
  );
  console.log(res.ok ? `E-mail de choix du mot de passe envoyé à ${email}` : `Envoi de l'e-mail impossible (${res.status})`);
}

async function seedCollection(name: string, items: { id: string }[]) {
  const existing = await db.collection(name).limit(1).get();
  if (!existing.empty) {
    console.log(`${name} : déjà rempli, ignoré`);
    return;
  }
  const batch = db.batch();
  items.forEach(item => batch.set(db.doc(`${name}/${item.id}`), item));
  await batch.commit();
  console.log(`${name} : ${items.length} documents`);
}

await ensureManager();
await seedCollection('dcs', INITIAL_DCS);
await seedCollection('sectors', INITIAL_SECTORS);
await seedCollection('technicalZones', INITIAL_TECHNICAL_ZONES);
await seedCollection('zoneAliases', INITIAL_ZONE_ALIASES);
await seedCollection(
  'technicians',
  INITIAL_TECHNICIANS.map(t => ({
    ...t,
    sectorIds: Array.from(new Set([t.sectorId, ...(t.sectorIds || [])])),
    telegramActivationToken: `act_${randomBytes(12).toString('hex')}`,
    telegramActivationStatus: 'PENDING',
    telegramLinkDisabled: false,
  }))
);
console.log('Initialisation terminée.');
