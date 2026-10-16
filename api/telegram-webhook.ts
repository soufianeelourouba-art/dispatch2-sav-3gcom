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
import type { Technician } from '../src/types/index.js';

// Litige reasons that need a written detail from the technician before being recorded.
const NEEDS_DETAIL: Record<string, string> = {
  RDV: '📅 Indiquez la <b>date et l\'heure du RDV</b> convenu avec le client (ex : 18/10 à 14h30) :',
  AUTRE: '✍️ Décrivez brièvement le <b>motif du litige</b> :',
};

const sessions = () => adminDb().collection('telegramSessions');

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

  // Free-text answer to a pending litige question
  const session = await sessions().doc(chatId).get();
  if (session.exists && !text.startsWith('/')) {
    const { ticketId, reasonCode, group } = session.data() as { ticketId: string; reasonCode: 'RDV' | 'AUTRE'; group?: boolean };
    await sessions().doc(chatId).delete();
    return report(base, chatId, tech, ticketId, !!group, {
      kind: 'LITIGE',
      reasonCode,
      rdvDateTime: reasonCode === 'RDV' ? text : undefined,
      notes: text,
    });
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
  const [rawAction, a, b] = String(query.data || '').split(':');
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

    case 'lr': {
      const reason = LITIGE_REASONS[Number(a)];
      const ticketId = b;
      if (!reason) return answerCallback(query.id, 'Motif inconnu.');
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, []);
      if (NEEDS_DETAIL[reason.code]) {
        await sessions().doc(chatId).set({ ticketId, reasonCode: reason.code, group, createdAt: new Date().toISOString() });
        return askForReply(chatId, NEEDS_DETAIL[reason.code]);
      }
      return report(base, chatId, tech, ticketId, group, { kind: 'LITIGE', reasonCode: reason.code });
    }

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
      return sendMessage(chatId, `🔴 <b>Litige enregistré</b> pour ${what} (${first.lastLitigeReasonLabel}). L'orienteur est prévenu.`);
    }
  } catch (err) {
    if (err instanceof AccessError) return sendMessage(chatId, `⚠️ ${err.message}`);
    throw err;
  }
}
