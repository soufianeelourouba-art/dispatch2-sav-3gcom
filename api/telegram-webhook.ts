// POST /api/telegram-webhook — receives every Telegram update for the bot.
// Handles technician activation (/start act_…), the NF / litige buttons, the free-text
// follow-ups (RDV date, litige detail) and the commands of the "Menu" button.
// Forms (NF config centrale, prestation declaration) open the technician app as a Mini App.
import { adminDb } from './_lib/admin.js';
import { json } from './_lib/http.js';
import { answerCallback, askForReply, editButtons, sendMessage } from './_lib/telegram.js';
import { webhookSecret } from './_lib/webhookSecret.js';
import {
  AccessError,
  findTechnicianByChat,
  findTechnicianByToken,
  openTicketsOf,
  recordSplitterReport,
  recordTechnicianReport,
  sendWorkOrdersTo,
  technicianIsBlocked,
  workOrderButtons,
  type TechnicianReport,
} from './_lib/tickets.js';
import { technicianPrestations } from './_lib/prestations.js';
import { afterTechnicianReport } from './_lib/afterReport.js';
import { appBaseUrl, configNfButton, declareButton, setTechnicianMenu, technicianAppUrl, webAppButton } from './_lib/miniapp.js';
import { LITIGE_REASONS } from '../src/types/index.js';
import { RDV_SLOTS, dayLabel, parseRdvText, rdvDayOptions, rdvToIso } from '../src/domain/litiges.js';
import { formatCasablancaDateTime } from '../src/domain/format.js';
import { computeTicketSLA } from '../src/domain/tickets.js';
import type { Technician } from '../src/types/index.js';

// Questions asked when a litige needs typed information (the answer comes as a message).
// RDV_DATE: date + time typed ("autre date"); RDV_TIME: time typed for a chosen day.
type SessionStep = 'RDV_DATE' | 'RDV_TIME' | 'DETAIL';
interface LitigeSession {
  ticketId: string;
  reasonCode: 'RDV' | 'AUTRE';
  group?: boolean;
  step?: SessionStep; // absent in sessions created by older versions
  day?: string; // RDV_TIME: chosen day code
}
const QUESTIONS: Record<SessionStep, string> = {
  RDV_DATE: '📅 Indiquez la <b>date et l\'heure du RDV</b> (ex : <code>18/10 14h30</code>) :',
  RDV_TIME: '🕐 Indiquez l\'<b>heure du RDV</b> (ex : <code>15h30</code>) :',
  DETAIL: '✍️ Décrivez brièvement le <b>motif du litige</b> :',
};

const sessions = () => adminDb().collection('telegramSessions');

async function ask(chatId: string, session: LitigeSession) {
  await sessions().doc(chatId).set({ ...session, createdAt: new Date().toISOString() });
  return askForReply(chatId, QUESTIONS[session.step!]);
}

// Litige buttons, "g." prefix = whole splitter incident
function rdvDayButtons(p: string, ticketId: string) {
  return [
    ...rdvDayOptions().map(d => [{ text: `📅 ${d.label}`, callback_data: `${p}rd:${d.code}:${ticketId}` }]),
    [{ text: '📅 Autre date', callback_data: `${p}rdx:${ticketId}` }],
    [{ text: '↩️ Retour', callback_data: `${p}lit:${ticketId}` }],
  ];
}
function rdvSlotButtons(p: string, day: string, ticketId: string) {
  const slots = RDV_SLOTS.map((s, i) => ({ text: s.replace(':00', 'h'), callback_data: `${p}rs:${day}:${i}:${ticketId}` }));
  return [
    [{ text: `RDV le ${dayLabel(day)} à :`, callback_data: 'done' }],
    slots.slice(0, 3),
    slots.slice(3, 6),
    [{ text: '🕐 Autre heure', callback_data: `${p}rh:${day}:${ticketId}` }],
    [{ text: '↩️ Retour', callback_data: `${p}lr:${LITIGE_REASONS.findIndex(r => r.code === 'RDV')}:${ticketId}` }],
  ];
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) {
    return json({ error: 'forbidden' }, 401);
  }
  const base = appBaseUrl(request);
  const update = await request.json();
  try {
    if (update.callback_query) await onCallback(base, update.callback_query);
    else if (update.message?.text) await onMessage(base, update.message);
  } catch (err) {
    // Always answer 200: Telegram would otherwise retry the same update indefinitely.
    console.error('telegram-webhook', err);
  }
  return json({ ok: true });
}

async function onMessage(base: string, message: any) {
  const chatId = String(message.chat.id);
  const text: string = message.text.trim();

  if (text.startsWith('/start')) {
    const token = text.split(/\s+/)[1];
    if (token) return activate(base, chatId, token, message.from);
  }

  const tech = await findTechnicianByChat(chatId);
  if (!tech) {
    return sendMessage(chatId,
      '👋 Bienvenue sur le bot 3GCOM Dispatch.\nPour lier votre compte technicien, ouvrez le lien d\'activation personnel envoyé par votre superviseur.');
  }
  if (technicianIsBlocked(tech)) {
    return sendMessage(chatId, '🚫 Votre accès a été suspendu par votre superviseur.');
  }

  // Typed answer to a pending litige question
  const snap = await sessions().doc(chatId).get();
  if (snap.exists && !text.startsWith('/')) {
    const session = snap.data() as LitigeSession;
    const step: SessionStep = session.step || (session.reasonCode === 'RDV' ? 'RDV_DATE' : 'DETAIL');
    if (step === 'DETAIL') {
      await sessions().doc(chatId).delete();
      return report(base, chatId, tech, session.ticketId, !!session.group, { kind: 'LITIGE', reasonCode: 'AUTRE', notes: text });
    }
    const rdv = step === 'RDV_TIME' ? rdvToIso(session.day || '', text.replace(/\s/g, '').replace(/h$/i, 'h00')) : parseRdvText(text);
    if (!rdv) {
      // Not understood: ask again instead of recording an unusable date
      return askForReply(chatId, `⚠️ Je n'ai pas compris « ${text} ».\n${QUESTIONS[step]}`);
    }
    await sessions().doc(chatId).delete();
    return report(base, chatId, tech, session.ticketId, !!session.group, { kind: 'LITIGE', reasonCode: 'RDV', rdvDateTime: rdv });
  }

  if (text.startsWith('/a_declarer')) return listToDeclare(base, chatId, tech);
  if (text.startsWith('/tickets') || text.startsWith('/start')) {
    await setTechnicianMenu(base, tech).catch(() => {});
    return listTickets(chatId, tech);
  }
  return sendMessage(chatId, 'Utilisez les boutons sous chaque ordre de travail, ou le bouton <b>Menu</b> : /tickets, /a_declarer, « Mon espace ».');
}

async function activate(base: string, chatId: string, token: string, from: any) {
  const tech = await findTechnicianByToken(token);
  if (!tech) {
    return sendMessage(chatId, '⚠️ Lien d\'activation non reconnu ou réinitialisé.\nDemandez un nouveau lien à votre superviseur.');
  }
  if (tech.telegramLinkDisabled || tech.telegramActivationStatus === 'REVOKED') {
    return sendMessage(chatId, '🚫 Ce lien d\'activation a été suspendu par votre superviseur.');
  }
  const username = from?.username ? `@${from.username}` : undefined;
  await adminDb().collection('technicians').doc(tech.id).set({
    telegramChatId: chatId,
    ...(username ? { telegramUsername: username } : {}),
    telegramActivationStatus: 'ACTIVATED',
    telegramActivatedAt: new Date().toISOString(),
  }, { merge: true });
  await setTechnicianMenu(base, { ...tech, telegramChatId: chatId }).catch(() => {});
  await sendMessage(chatId,
    `✅ <b>Activation réussie !</b>\n\nBonjour ${tech.fullName}, votre compte est lié au dispatch 3GCOM.\n` +
    `Vous recevrez ici vos ordres d'intervention. Le bouton <b>Mon espace</b> (en bas à gauche) ouvre vos interventions et vos prestations à déclarer.`);
  return listTickets(chatId, tech);
}

async function listTickets(chatId: string, tech: Technician) {
  const tickets = await openTicketsOf(tech.id);
  if (tickets.length === 0) return sendMessage(chatId, '📭 Aucune intervention en cours pour le moment.');
  // Oldest claims first, so the late ones come first, with a short summary
  tickets.sort((a, b) => (a.registeredAt || '').localeCompare(b.registeredAt || ''));
  const late = tickets.filter(t => t.registeredAt && computeTicketSLA(t.registeredAt).slaStatus === 'EXPIRED').length;
  await sendMessage(chatId, `📋 <b>${tickets.length} intervention(s) en cours</b>` + (late ? `\n🔴 <b>${late} hors délai</b> : à traiter en priorité` : ''));
  await sendWorkOrdersTo(tech, tickets);
}

async function listToDeclare(base: string, chatId: string, tech: Technician) {
  const { toDeclare } = await technicianPrestations(tech.id);
  if (toDeclare.length === 0) return sendMessage(chatId, '✅ Aucune prestation à déclarer. Merci !');
  const shown = toDeclare.slice(0, 10);
  await sendMessage(
    chatId,
    `📝 <b>${toDeclare.length} prestation(s) à déclarer</b>\n` +
      shown.map(t => `• ${t.ticketNumber} — ${t.clientName}${t.splitterRef ? ` (splitter ${t.splitterRef})` : ''}`).join('\n') +
      (toDeclare.length > shown.length ? `\n… et ${toDeclare.length - shown.length} autre(s) dans « Mon espace ».` : ''),
    [
      ...shown.map(t => [declareButton(base, tech, t.id)].map(b => ({ ...b, text: `📝 ${t.ticketNumber}` }))),
      [webAppButton('📂 Ouvrir Mon espace', technicianAppUrl(base, tech, { tab: 'declare' }))],
    ]
  );
}

async function onCallback(base: string, query: any) {
  const chatId = String(query.message?.chat?.id ?? query.from.id);
  const messageId: number | undefined = query.message?.message_id;
  const [rawAction, a, b, c] = String(query.data || '').split(':');
  // "g." prefix: the action applies to the whole splitter incident
  const group = rawAction.startsWith('g.');
  const action = group ? rawAction.slice(2) : rawAction;
  const p = group ? 'g.' : '';

  const tech = await findTechnicianByChat(chatId);
  if (!tech || technicianIsBlocked(tech)) {
    return answerCallback(query.id, 'Compte non lié ou suspendu.');
  }

  switch (action) {
    case 'nf': // choose NF type
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, [
        [{ text: group ? '✅ NF standard (tout le splitter)' : '✅ NF standard', callback_data: `${p}nfs:${a}` }],
        [configNfButton(base, tech, a, group)],
        [{ text: '↩️ Retour', callback_data: `${p}back:${a}` }],
      ]);
      return;

    case 'nfs':
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, []);
      return report(base, chatId, tech, a, group, { kind: 'NF', nfType: 'STANDARD' });

    case 'nfc': // older messages: config centrale now needs the form (serial + photo)
      await answerCallback(query.id);
      return sendMessage(chatId, '⚙️ La NF config centrale demande le numéro de série et sa photo :', [[configNfButton(base, tech, a, group)]]);

    case 'lit': // choose litige reason
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, [
        ...LITIGE_REASONS.map((r, i) => [{ text: r.label, callback_data: `${p}lr:${i}:${a}` }]),
        [{ text: '↩️ Retour', callback_data: `${p}back:${a}` }],
      ]);
      return;

    case 'lr': { // litige reason chosen
      const reason = LITIGE_REASONS[Number(a)];
      const ticketId = b;
      if (!reason) return answerCallback(query.id, 'Motif inconnu.');
      await answerCallback(query.id);
      if (reason.code === 'RDV') {
        if (messageId) await editButtons(chatId, messageId, rdvDayButtons(p, ticketId));
        return;
      }
      if (reason.code === 'CLIENT_UNREACHABLE') {
        if (messageId) await editButtons(chatId, messageId, [
          [{ text: '📞 Demander un autre numéro', callback_data: `${p}ln:1:${ticketId}` }],
          [{ text: '✔️ Enregistrer sans demande', callback_data: `${p}ln:0:${ticketId}` }],
          [{ text: '↩️ Retour', callback_data: `${p}lit:${ticketId}` }],
        ]);
        return;
      }
      if (messageId) await editButtons(chatId, messageId, []);
      if (reason.code === 'AUTRE') return ask(chatId, { ticketId, reasonCode: 'AUTRE', group, step: 'DETAIL' });
      return report(base, chatId, tech, ticketId, group, { kind: 'LITIGE', reasonCode: reason.code });
    }

    case 'ln': // client unreachable, with or without a request for another number
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, []);
      return report(base, chatId, tech, b, group, { kind: 'LITIGE', reasonCode: 'CLIENT_UNREACHABLE', requestNewContact: a === '1' });

    case 'rd': // RDV day chosen → time slots
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, rdvSlotButtons(p, a, b));
      return;

    case 'rs': { // RDV slot chosen → recorded
      const rdv = rdvToIso(a, RDV_SLOTS[Number(b)] || '');
      if (!rdv) return answerCallback(query.id, 'Créneau inconnu.');
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, []);
      return report(base, chatId, tech, c, group, { kind: 'LITIGE', reasonCode: 'RDV', rdvDateTime: rdv });
    }

    case 'rdx': // RDV on another date → typed
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, []);
      return ask(chatId, { ticketId: a, reasonCode: 'RDV', group, step: 'RDV_DATE' });

    case 'rh': // chosen day, another time → typed
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, []);
      return ask(chatId, { ticketId: b, reasonCode: 'RDV', group, step: 'RDV_TIME', day: a });

    case 'back':
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, workOrderButtons(a, group));
      return;

    case 'done': // status label of a ticket already handled
      return answerCallback(query.id, 'Déjà traité ✅');

    default:
      return answerCallback(query.id);
  }
}

async function report(base: string, chatId: string, tech: Technician, ticketId: string, group: boolean, payload: TechnicianReport) {
  try {
    const tickets = group
      ? await recordSplitterReport(tech, ticketId, payload)
      : [await recordTechnicianReport(tech, ticketId, payload)];
    const first = tickets[0];
    const what = tickets.length > 1
      ? `les <b>${tickets.length} tickets</b> du splitter ${first.splitterRef}`
      : `le ticket ${first.ticketNumber}`;
    // Buttons of the ticket's messages become a status; after an NF, offer the declaration
    await afterTechnicianReport(base, tech, tickets, payload.kind);
    if (payload.kind === 'LITIGE') {
      const details = [
        first.lastLitigeRdvDate ? `📅 RDV le <b>${formatCasablancaDateTime(first.lastLitigeRdvDate)}</b>` : '',
        first.lastLitigeNeedsContact ? '📞 Demande de nouveau numéro transmise à l\'orienteur.' : '',
      ].filter(Boolean).join('\n');
      return sendMessage(chatId, `🔴 <b>Litige enregistré</b> pour ${what} (${first.lastLitigeReasonLabel}). L'orienteur est prévenu.${details ? `\n${details}` : ''}`);
    }
  } catch (err) {
    if (err instanceof AccessError) return sendMessage(chatId, `⚠️ ${err.message}`);
    throw err;
  }
}
