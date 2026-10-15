// Repairs text that was decoded as Windows-1252 then re-saved as UTF-8 ("MaÃ¢rif" → "Maârif")
// in every document of the main collections. Dry run by default:
//   node scripts/repair-encoding.ts          → lists what would change
//   node scripts/repair-encoding.ts --apply  → writes the fixes
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';

const COLLECTIONS = ['dcs', 'sectors', 'technicalZones', 'zoneAliases', 'technicians', 'tickets', 'events', 'users', 'settings'];
const apply = process.argv.includes('--apply');

// Windows-1252 bytes 0x80–0x9F that are not Latin-1
const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

export function repairMojibake(text: string): string {
  if (!/[ÃÂâ][\u0080-ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(text)) return text;
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x100) bytes.push(code);
    else if (CP1252[ch] !== undefined) bytes.push(CP1252[ch]);
    else return text; // not a cp1252 round-trip: leave untouched
  }
  const decoded = Buffer.from(bytes).toString('utf8');
  return decoded.includes('�') ? text : decoded;
}

function repairValue(value: unknown): unknown {
  if (typeof value === 'string') return repairMojibake(value);
  if (Array.isArray(value)) return value.map(repairValue);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, repairValue(v)]));
  }
  return value;
}

const db = getFirestore();
let changedDocs = 0;
for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const fixed = repairValue(data) as Record<string, unknown>;
    const changes = Object.keys(data).filter(k => JSON.stringify(data[k]) !== JSON.stringify(fixed[k]));
    if (changes.length === 0) continue;
    changedDocs++;
    console.log(`${name}/${doc.id} : ${changes.map(k => `${k}="${String(fixed[k]).slice(0, 40)}"`).join(', ')}`);
    if (apply) await doc.ref.update(Object.fromEntries(changes.map(k => [k, fixed[k]])));
  }
}
console.log(`${changedDocs} document(s) ${apply ? 'réparé(s)' : 'à réparer (relancer avec --apply)'}.`);
