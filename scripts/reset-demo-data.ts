// Removes the demo referential and test tickets before real use. Dry run by default:
//   node scripts/reset-demo-data.ts          → lists what would be deleted / kept
//   node scripts/reset-demo-data.ts --apply  → deletes
// Keeps: user accounts, settings (bot), and technicians linked to a real Telegram chat.
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';
import type { Technician } from '../src/types/index.ts';

const apply = process.argv.includes('--apply');
const db = getFirestore();
const WIPE = ['tickets', 'events', 'zoneAliases', 'technicalZones', 'sectors', 'dcs', 'telegramSessions'];

const isRealTelegram = (t: Technician) => !!t.telegramChatId && !t.telegramChatId.startsWith('chat_');

let total = 0;
for (const name of WIPE) {
  const snap = await db.collection(name).get();
  console.log(`${name.padEnd(16)} ${snap.size} à supprimer`);
  total += snap.size;
  if (apply) {
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

const techs = await db.collection('technicians').get();
for (const doc of techs.docs) {
  const tech = doc.data() as Technician;
  if (isRealTelegram(tech)) {
    console.log(`technicians      garde « ${tech.fullName} » (lié à Telegram) — secteur et zones à réaffecter`);
    if (apply) await doc.ref.update({ zoneIds: [] });
  } else {
    total++;
    console.log(`technicians      supprime « ${tech.fullName} »`);
    if (apply) await doc.ref.delete();
  }
}

const users = await db.collection('users').get();
users.docs.forEach(d => console.log(`users            garde ${d.data().email} (${d.data().role})`));
console.log(`\n${total} document(s) ${apply ? 'supprimé(s)' : 'à supprimer (relancer avec --apply)'}.`);
