// Removes references to sectors / zones that no longer exist (e.g. after deleting the demo data)
// from accounts and technicians. Dry run by default:
//   node scripts/clean-stale-sectors.ts          → lists what would change
//   node scripts/clean-stale-sectors.ts --apply  → writes
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import './admin.ts';

const apply = process.argv.includes('--apply');
const db = getFirestore();
const sectorIds = new Set((await db.collection('sectors').get()).docs.map(d => d.id));
const zoneIds = new Set((await db.collection('technicalZones').get()).docs.map(d => d.id));

let changes = 0;
async function fix(collection: string, label: (d: FirebaseFirestore.DocumentData) => string) {
  for (const doc of (await db.collection(collection).get()).docs) {
    const data = doc.data();
    const update: Record<string, unknown> = {};
    const validSectors = (data.sectorIds || []).filter((id: string) => sectorIds.has(id));
    if ((data.sectorIds || []).length !== validSectors.length) update.sectorIds = validSectors;
    if (data.sectorId && !sectorIds.has(data.sectorId)) {
      update.sectorId = validSectors[0] ?? FieldValue.delete();
    }
    if (Array.isArray(data.zoneIds)) {
      const validZones = data.zoneIds.filter((id: string) => zoneIds.has(id));
      if (validZones.length !== data.zoneIds.length) update.zoneIds = validZones;
    }
    if (Object.keys(update).length === 0) continue;
    changes++;
    const shown = Object.fromEntries(Object.entries(update).map(([k, v]) => [k, v instanceof FieldValue ? '(supprimé)' : v]));
    console.log(`${collection}/${label(data)} : ${JSON.stringify(shown)}`);
    if (apply) await doc.ref.update(update);
  }
}

await fix('users', d => d.email);
await fix('technicians', d => d.fullName);
console.log(`${changes} fiche(s) ${apply ? 'nettoyée(s)' : 'à nettoyer (relancer avec --apply)'}.`);
