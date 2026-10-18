// End-to-end check of the technician API (NF form, prestation declaration, splitter incident,
// photos) on isolated test data, deleted at the end. Runs the real api/ handlers locally:
//   npx jiti scripts/e2e-prestations.ts
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';
import { GET, POST } from '../api/portal.ts';

const db = getFirestore();
const ID = `e2e${Date.now()}`;
const SECTOR = `sec-${ID}`;
const ZONE = `tz-${ID}`;
const TECH = `tech-${ID}`;
const TOKEN = `act_${ID}abcdef`;
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64');
const now = new Date().toISOString();

const ticket = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `tkt-${ID}-${n}`, ticketNumber: `${ID}-${n}`, clientNumber: 'C', clientName: `Client ${n}`, clientPhone: '0600000000',
  clientAddress: 'Test', rawZoneText: 'ZONE TEST', technicalZoneId: ZONE, sectorId: SECTOR, registeredAt: now, visitCount: 1,
  currentStatus: 'ASSIGNED', isClosed: false, currentAssignedTechId: TECH, slaDeadline: now, slaStatus: 'ON_TIME',
  slaRemainingHours: 20, createdAt: now, updatedAt: now, ...extra,
});

async function call(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const res = method === 'GET'
    ? await GET(new Request(`https://test.local/api/portal?token=${TOKEN}`))
    : await POST(new Request('https://test.local/api/portal', { method: 'POST', body: JSON.stringify({ token: TOKEN, ...body }) }));
  return { status: res.status, data: await res.json() as any };
}
const read = async (n: number) => (await db.doc(`tickets/tkt-${ID}-${n}`).get()).data()!;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'}  ${label}${ok ? '' : ` → ${JSON.stringify(detail)}`}`);
}

try {
  await db.doc(`sectors/${SECTOR}`).set({ id: SECTOR, dcId: 'x', code: 'E2E', name: 'Secteur test E2E', createdAt: now });
  await db.doc(`technicalZones/${ZONE}`).set({ id: ZONE, sectorId: SECTOR, label: 'Zone test', msanCode: 'ZONE TEST', createdAt: now });
  await db.doc(`technicians/${TECH}`).set({
    id: TECH, sectorId: SECTOR, sectorIds: [SECTOR], fullName: 'Technicien Test E2E', normalizedName: 'technicien test e2e',
    phone: '', zoneIds: [ZONE], isActive: true, telegramActivationToken: TOKEN, createdAt: now,
  });
  await db.doc(`tickets/tkt-${ID}-1`).set(ticket(1));
  await db.doc(`tickets/tkt-${ID}-2`).set(ticket(2, { splitterRef: 'SP-E2E' }));
  await db.doc(`tickets/tkt-${ID}-3`).set(ticket(3, { splitterRef: 'SP-E2E' }));

  let r = await call('GET');
  check('Mon espace : 3 interventions à faire', r.status === 200 && r.data.tickets.length === 3, r.data);

  r = await call('POST', { action: 'NF_FORM', ticketId: `tkt-${ID}-1`, nfType: 'CENTRAL_CONFIG' });
  check('NF config sans numéro de série → refusée', r.status === 400 && /N° série ONT/.test(r.data.error), r);
  check('… et le ticket reste ouvert', (await read(1)).isClosed === false);

  r = await call('POST', {
    action: 'NF_FORM', ticketId: `tkt-${ID}-1`, nfType: 'CENTRAL_CONFIG', ontSerialNumber: 'alcl b123 4567', serialPhotos: [PHOTO],
    declaration: { code: 'FO_01_02', raccordements: 2, materials: { joints: 0, splitters: 0, cableMeters: 50 } },
  });
  check('Matériel sans photo → refusé avant clôture', r.status === 400 && /صورة واحدة على الأقل للمعدات/.test(r.data.error), r);
  check('… et le ticket reste ouvert', (await read(1)).isClosed === false);

  r = await call('POST', {
    action: 'NF_FORM', ticketId: `tkt-${ID}-1`, nfType: 'CENTRAL_CONFIG', ontSerialNumber: 'alcl b123 4567', serialPhotos: [PHOTO],
    declaration: { code: 'FO_01_02', raccordements: 2, materials: { joints: 0, splitters: 0, cableMeters: 50 }, materialPhotos: [PHOTO] },
  });
  const t1 = await read(1);
  check('NF config complète + prestation', r.status === 200 && t1.currentStatus === 'COMPLETED' && t1.prestationStatus === 'DECLAREE', { r, t1 });
  check('Numéro de série normalisé', t1.ontSerialNumber === 'ALCLB1234567', t1.ontSerialNumber);
  check('Prestation 01-02 FO × 2, 50 m de câble', t1.prestation?.code === 'FO_01_02' && t1.prestation?.raccordements === 2 && t1.prestation?.materials.cableMeters === 50, t1.prestation);
  check('Photos enregistrées (1 étiquette + 1 matériel)', t1.serialPhotoIds?.length === 1 && t1.prestation?.photoIds.length === 1);

  r = await call('POST', { action: 'REPORT', ticketId: `tkt-${ID}-2`, scope: 'SPLITTER', report: { kind: 'NF' } });
  const [t2, t3] = [await read(2), await read(3)];
  check('NF splitter : 2 tickets clôturés', r.status === 200 && r.data.ticketNumbers.length === 2 && t2.isClosed && t3.isClosed, r);
  check('Une seule prestation à déclarer (ticket 2), ticket 3 inclus', t2.prestationStatus === 'A_DECLARER' && t3.prestationStatus === 'INCLUSE' && t3.collectiveLeadTicketId === t2.id, { t2: t2.prestationStatus, t3: t3.prestationStatus });

  r = await call('GET');
  check('À déclarer : uniquement le ticket 2', r.data.toDeclare.length === 1 && r.data.toDeclare[0].id === t2.id, r.data.toDeclare);
  check('Mes prestations : le ticket 1', r.data.declared.length === 1 && r.data.declared[0].prestation.photoCount === 1, r.data.declared);

  r = await call('POST', { action: 'DECLARE', ticketId: `tkt-${ID}-3`, declaration: { code: 'FO_32' } });
  check('Déclarer un ticket inclus → refusé', r.status === 409, r);

  r = await call('POST', { action: 'DECLARE', ticketId: `tkt-${ID}-2`, declaration: { code: 'FO_32' } });
  check('Déclarer le splitter (32 FO, sans matériel)', r.status === 200 && (await read(2)).prestationStatus === 'DECLAREE', r);

  r = await call('POST', { action: 'DECLARE', ticketId: `tkt-${ID}-2`, declaration: { code: 'FO_32' } });
  check('Déclarer deux fois → refusé', r.status === 409, r);

  // Reprise ≤ 7 days: not billable for the technician of the previous intervention, billable for another one
  await db.doc(`tickets/tkt-${ID}-4`).set(ticket(4, { importOutcome: 'REPRISE', repriseOfTechId: TECH, preferredTechId: TECH, visitCount: 2 }));
  await db.doc(`tickets/tkt-${ID}-5`).set(ticket(5, { importOutcome: 'REPRISE', repriseOfTechId: 'tech-autre', visitCount: 2 }));
  r = await call('GET');
  check('App technicien : sa reprise est signalée non facturable', r.data.tickets.find((t: any) => t.id === `tkt-${ID}-4`)?.nonBillable === true
    && r.data.tickets.find((t: any) => t.id === `tkt-${ID}-5`)?.nonBillable === false);
  r = await call('POST', { action: 'REPORT', ticketId: `tkt-${ID}-4`, report: { kind: 'NF' } });
  check('Reprise de sa propre intervention → NF non facturable', (await read(4)).prestationStatus === 'NON_FACTURABLE', (await read(4)).prestationStatus);
  r = await call('POST', { action: 'NF_FORM', ticketId: `tkt-${ID}-5`, nfType: 'STANDARD' });
  check('Reprise d\'un autre technicien → prestation à déclarer (facturable)', (await read(5)).prestationStatus === 'A_DECLARER', (await read(5)).prestationStatus);
  r = await call('GET');
  check('À déclarer : la reprise non facturable n\'y figure pas', !r.data.toDeclare.some((t: any) => t.id === `tkt-${ID}-4`) && r.data.toDeclare.some((t: any) => t.id === `tkt-${ID}-5`));
  r = await call('POST', { action: 'DECLARE', ticketId: `tkt-${ID}-4`, declaration: { code: 'FO_04' } });
  check('Déclarer une reprise non facturable → refusé', r.status === 409, r);

  const events = (await db.collection('events').where('ticketId', '==', `tkt-${ID}-2`).get()).docs.map(d => d.data().eventType);
  check('Historique : NF puis prestation, statut toujours NF', events.includes('NF_SUBMITTED') && events.includes('PRESTATION_DECLARED') && (await read(2)).currentStatus === 'COMPLETED', events);
} finally {
  const refs = [
    ...(await db.collection('events').where('sectorId', '==', SECTOR).get()).docs.map(d => d.ref),
    ...(await db.collection('photos').where('sectorId', '==', SECTOR).get()).docs.map(d => d.ref),
    ...[1, 2, 3, 4, 5].map(n => db.doc(`tickets/tkt-${ID}-${n}`)),
    db.doc(`technicians/${TECH}`), db.doc(`technicalZones/${ZONE}`), db.doc(`sectors/${SECTOR}`),
  ];
  const batch = db.batch();
  refs.forEach(ref => batch.delete(ref));
  await batch.commit();
  console.log(`Données de test supprimées (${refs.length} documents).`);
}
console.log(failures === 0 ? 'Tous les parcours technicien fonctionnent.' : `${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
