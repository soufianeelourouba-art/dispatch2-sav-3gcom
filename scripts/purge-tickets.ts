// Empties the ticket data to restart a test from an empty list, after saving it locally.
//   node scripts/purge-tickets.ts          → counts what would be deleted / kept
//   node scripts/purge-tickets.ts --apply  → saves a JSON backup in backups/, then deletes
// Keeps the referential (DC, sectors, zones, aliases), technicians, accounts and settings.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';

const apply = process.argv.includes('--apply');
const db = getFirestore();
const WIPE = ['tickets', 'events', 'photos', 'telegramMessages', 'telegramSessions'];
const KEEP = ['dcs', 'sectors', 'technicalZones', 'zoneAliases', 'technicians', 'users', 'settings'];

const backup: Record<string, unknown[]> = {};
for (const name of WIPE) {
  const snap = await db.collection(name).get();
  backup[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`${name.padEnd(17)} ${snap.size} à supprimer`);
}
for (const name of KEEP) {
  console.log(`${name.padEnd(17)} ${(await db.collection(name).count().get()).data().count} conservé(s)`);
}

if (apply) {
  mkdirSync('backups', { recursive: true });
  const file = join('backups', `tickets-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`\nSauvegarde : ${file}`);
  for (const name of WIPE) {
    const snap = await db.collection(name).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
  console.log('Données tickets supprimées.');
} else {
  console.log('\nSimulation : relancer avec --apply pour supprimer.');
}
