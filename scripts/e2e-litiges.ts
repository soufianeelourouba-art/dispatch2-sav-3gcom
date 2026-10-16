// End-to-end check of the litige flows through the real Telegram webhook and technician API,
// on isolated test data (deleted at the end). Calls to Telegram are intercepted: nothing is sent.
//   npx jiti scripts/e2e-litiges.ts
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';

process.env.TELEGRAM_BOT_TOKEN = 'e2e-fake-token';
const telegramCalls: { method: string; body: any }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (url.startsWith('https://api.telegram.org/')) {
    telegramCalls.push({ method: url.split('/').pop()!, body: JSON.parse(init?.body || '{}') });
    return new Response(JSON.stringify({ ok: true, result: { message_id: telegramCalls.length } }));
  }
  return realFetch(input, init);
}) as typeof fetch;

const { POST: webhook } = await import('../api/telegram-webhook.ts');
const { POST: portal } = await import('../api/portal.ts');
const { webhookSecret } = await import('../api/_lib/webhookSecret.ts');
const { rdvDayOptions, RDV_SLOTS } = await import('../src/domain/litiges.ts');
const { LITIGE_REASONS } = await import('../src/types/index.ts');

const db = getFirestore();
const ID = `e2el${Date.now()}`;
const SECTOR = `sec-${ID}`;
const TECH = `tech-${ID}`;
const CHAT = `${Date.now()}`;
const TOKEN = `act_${ID}abcdef`;
const now = new Date().toISOString();
const reasonIndex = (code: string) => LITIGE_REASONS.findIndex(r => r.code === code);
const tid = (n: number) => `tkt-${ID}-${n}`;

const update = (body: any) => webhook(new Request('https://test.local/api/telegram-webhook', {
  method: 'POST',
  headers: { 'x-telegram-bot-api-secret-token': webhookSecret() },
  body: JSON.stringify(body),
}));
const press = (data: string) => update({ callback_query: { id: 'cb', data, from: { id: CHAT }, message: { chat: { id: CHAT }, message_id: 42 } } });
const say = (text: string) => update({ message: { chat: { id: CHAT }, from: { id: CHAT }, text } });
const read = async (n: number) => (await db.doc(`tickets/${tid(n)}`).get()).data()!;
const lastKeyboard = () => [...telegramCalls].reverse().find(c => c.method === 'editMessageReplyMarkup')?.body.reply_markup.inline_keyboard.flat() || [];

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'}  ${label}${ok ? '' : ` → ${JSON.stringify(detail)}`}`);
}

try {
  await db.doc(`sectors/${SECTOR}`).set({ id: SECTOR, dcId: 'x', code: 'E2E', name: 'Secteur test E2E', createdAt: now });
  await db.doc(`technicians/${TECH}`).set({
    id: TECH, sectorId: SECTOR, sectorIds: [SECTOR], fullName: 'Technicien Test E2E', normalizedName: 'technicien test e2e', phone: '',
    zoneIds: [], isActive: true, telegramActivationToken: TOKEN, telegramChatId: CHAT, telegramActivationStatus: 'ACTIVATED', createdAt: now,
  });
  for (const n of [1, 2, 3, 4, 5]) {
    await db.doc(`tickets/${tid(n)}`).set({
      id: tid(n), ticketNumber: `${ID}-${n}`, clientNumber: 'C', clientName: `Client ${n}`, clientPhone: '0661223344', clientAddress: 'Test',
      rawZoneText: 'ZONE', sectorId: SECTOR, technicalZoneId: 'z', registeredAt: now, visitCount: 1, currentStatus: 'ASSIGNED', isClosed: false,
      currentAssignedTechId: TECH, slaDeadline: now, slaStatus: 'ON_TIME', slaRemainingHours: 20, createdAt: now, updatedAt: now,
    });
  }
  const day = rdvDayOptions()[1]; // tomorrow

  // 1. RDV with day + slot buttons
  await press(`lit:${tid(1)}`);
  check('Litige : la liste des motifs s\'affiche', lastKeyboard().some((b: any) => b.callback_data === `lr:${reasonIndex('RDV')}:${tid(1)}`));
  await press(`lr:${reasonIndex('RDV')}:${tid(1)}`);
  check('RDV : choix du jour (demain proposé)', lastKeyboard().some((b: any) => b.callback_data === `rd:${day.code}:${tid(1)}`), lastKeyboard());
  await press(`rd:${day.code}:${tid(1)}`);
  check('RDV : choix du créneau', lastKeyboard().some((b: any) => b.callback_data === `rs:${day.code}:3:${tid(1)}`));
  await press(`rs:${day.code}:3:${tid(1)}`);
  const t1 = await read(1);
  check(`RDV enregistré demain à ${RDV_SLOTS[3]}`, t1.currentStatus === 'LITIGE' && t1.lastLitigeReasonCode === 'RDV' && t1.lastLitigeRdvDate?.endsWith('T14:00:00.000Z'), t1.lastLitigeRdvDate);

  // 2. Client unreachable + request for another number
  await press(`lr:${reasonIndex('CLIENT_UNREACHABLE')}:${tid(2)}`);
  check('Injoignable : bouton « Demander un autre numéro »', lastKeyboard().some((b: any) => b.callback_data === `ln:1:${tid(2)}`));
  await press(`ln:1:${tid(2)}`);
  const t2 = await read(2);
  check('Demande de nouveau numéro enregistrée', t2.currentStatus === 'LITIGE' && t2.lastLitigeNeedsContact === true, t2);

  // 3. RDV typed: unreadable text asks again, readable text is recorded
  await press(`rdx:${tid(3)}`);
  const callsBefore = telegramCalls.length;
  await say('demain matin');
  check('Date incomprise : la question est reposée', (await read(3)).currentStatus === 'ASSIGNED'
    && telegramCalls.slice(callsBefore).some(c => c.method === 'sendMessage' && /pas compris/.test(c.body.text)));
  await say('25/12 15h30');
  const t3 = await read(3);
  check('Date tapée enregistrée (25/12 à 15h30)', t3.currentStatus === 'LITIGE' && /-12-25T15:30:00\.000Z$/.test(t3.lastLitigeRdvDate || ''), t3.lastLitigeRdvDate);

  // 4. Other reason with a typed detail
  await press(`lr:${reasonIndex('AUTRE')}:${tid(4)}`);
  await say('Portail fermé, syndic absent');
  const t4 = await read(4);
  check('Motif « autre » avec commentaire', t4.currentStatus === 'LITIGE' && t4.lastLitigeNotes === 'Portail fermé, syndic absent', t4);
  check('Les boutons du ticket sont retirés', telegramCalls.some(c => c.method === 'editMessageReplyMarkup' && c.body.reply_markup.inline_keyboard.length === 0));

  // 5. Technician app: RDV without a date is refused
  const res = await portal(new Request('https://test.local/api/portal', {
    method: 'POST',
    body: JSON.stringify({ token: TOKEN, action: 'REPORT', ticketId: tid(5), report: { kind: 'LITIGE', reasonCode: 'RDV' } }),
  }));
  check('App technicien : RDV sans date refusé', res.status === 400 && (await read(5)).currentStatus === 'ASSIGNED', res.status);
} finally {
  const refs = [
    ...(await db.collection('events').where('sectorId', '==', SECTOR).get()).docs.map(d => d.ref),
    ...[1, 2, 3, 4, 5].flatMap(n => [db.doc(`tickets/${tid(n)}`), db.doc(`telegramMessages/${tid(n)}`)]),
    db.doc(`telegramSessions/${CHAT}`), db.doc(`technicians/${TECH}`), db.doc(`sectors/${SECTOR}`),
  ];
  const batch = db.batch();
  refs.forEach(ref => batch.delete(ref));
  await batch.commit();
  console.log(`Données de test supprimées (${refs.length} documents). Appels Telegram interceptés : ${telegramCalls.length}.`);
}
console.log(failures === 0 ? 'Tous les parcours litige fonctionnent.' : `${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
