// Read-only check of the real referential against the import's zone matching:
//   node scripts/check-zones.ts [texte à tester] [...]
// For each sector, verifies that no zone can be mistaken for another one (each zone name with one
// typo still maps to itself or to nothing), then resolves the given texts.
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';
import { resolveZone } from '../src/domain/excelImport.ts';
import type { Sector, TechnicalZone } from '../src/types/index.ts';

const db = getFirestore();
const sectors = (await db.collection('sectors').get()).docs.map(d => ({ ...(d.data() as Sector), id: d.id }));
const zones = (await db.collection('technicalZones').get()).docs.map(d => ({ ...(d.data() as TechnicalZone), id: d.id }));

let risks = 0;
for (const sector of sectors) {
  const ctx = { targetSectorId: sector.id, sectors, zones, aliases: [] };
  for (const zone of zones.filter(z => z.sectorId === sector.id)) {
    const label = zone.label.toUpperCase();
    // every single-letter deletion of the label
    for (let i = 0; i < label.length; i++) {
      const typo = label.slice(0, i) + label.slice(i + 1);
      const found = resolveZone(typo, ctx);
      if (found.zoneId && found.zoneId !== zone.id) {
        risks++;
        console.log(`RISQUE : « ${typo} » (faute sur ${zone.label}) → ${found.zoneLabel}`);
      }
    }
  }
}
console.log(risks === 0 ? 'Aucune confusion possible entre zones d\'un même secteur.' : `${risks} confusion(s) possible(s).`);

for (const text of process.argv.slice(2)) {
  const results = sectors.map(s => {
    const r = resolveZone(text, { targetSectorId: s.id, sectors, zones, aliases: [] });
    return r.zoneId ? `${s.name} → ${r.zoneLabel}${r.correctedFrom ? ' (corrigé)' : ''}` : null;
  }).filter(Boolean);
  console.log(`« ${text} » : ${results.length ? results.join(' ; ') : 'non reconnu'}`);
}
