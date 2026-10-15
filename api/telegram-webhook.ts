// POST /api/telegram-webhook — receives every Telegram update for the bot.
// Handles technician activation (/start act_…), the NF / litige buttons and the
// free-text follow-ups (RDV date, litige detail).
import { adminDb } from './_lib/admin.js';
import { json } from './_lib/http.js';
import { answerCallback, askForReply, editButtons, sendMessage } from './_lib/telegram.js';
import { webhookSecret } from './_lib/webhookSecret.js';
import {
  AccessError,
  findTechnicianByChat,
  findTechnicianByToken,
  openTicketsOf,
  recordTechnicianReport,
  technicianIsBlocked,
  workOrderButtons,
} from './_lib/tickets.js';
import { formatTicketMessage } from '../src/domain/tickets.js';
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
  const update = await request.json();
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message?.text) await onMessage(update.message);
  } catch (err) {
    // Always answer 200: Telegram would otherwise retry the same update indefinitely.
    console.error('telegram-webhook', err);
  }
  return json({ ok: true });
}

async function onMessage(message: any) {
  const chatId = String(message.chat.id);
  const text: string = message.text.trim();

  if (text.startsWith('/start')) {
    const token = text.split(/\s+/)[1];
    if (token) return activate(chatId, token, message.from);
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
    const { ticketId, reasonCode } = session.data() as { ticketId: string; reasonCode: 'RDV' | 'AUTRE' };
    await sessions().doc(chatId).delete();
    return report(chatId, tech, ticketId, {
      kind: 'LITIGE',
      reasonCode,
      rdvDateTime: reasonCode === 'RDV' ? text : undefined,
      notes: text,
    });
  }

  if (text.startsWith('/tickets') || text.startsWith('/start')) {
    return listTickets(chatId, tech);
  }
  return sendMessage(chatId, 'Utilisez les boutons sous chaque ordre de travail, ou /tickets pour revoir vos interventions en cours.');
}

async function activate(chatId: string, token: string, from: any) {
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
  await sendMessage(chatId,
    `✅ <b>Activation réussie !</b>\n\nBonjour ${tech.fullName}, votre compte est lié au dispatch 3GCOM.\nVous recevrez ici vos ordres d'intervention.`);
  return listTickets(chatId, tech);
}

async function listTickets(chatId: string, tech: Technician) {
  const tickets = await openTicketsOf(tech.id);
  if (tickets.length === 0) return sendMessage(chatId, '📭 Aucune intervention en cours pour le moment.');
  for (const ticket of tickets) {
    await sendMessage(chatId, formatTicketMessage(ticket), workOrderButtons(ticket.id));
  }
}

async function onCallback(query: any) {
  const chatId = String(query.message?.chat?.id ?? query.from.id);
  const messageId: number | undefined = query.message?.message_id;
  const [action, a, b] = String(query.data || '').split(':');

  const tech = await findTechnicianByChat(chatId);
  if (!tech || technicianIsBlocked(tech)) {
    return answerCallback(query.id, 'Compte non lié ou suspendu.');
  }

  switch (action) {
    case 'nf': // choose NF type
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, [
        [{ text: '✅ NF standard', callback_data: `nfs:${a}` }],
        [{ text: '⚙️ NF config centrale + ONT', callback_data: `nfc:${a}` }],
        [{ text: '↩️ Retour', callback_data: `back:${a}` }],
      ]);
      return;

    case 'nfs':
    case 'nfc':
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, []);
      return report(chatId, tech, a, { kind: 'NF', nfType: action === 'nfc' ? 'CENTRAL_CONFIG' : 'STANDARD' });

    case 'lit': // choose litige reason
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, [
        ...LITIGE_REASONS.map((r, i) => [{ text: r.label, callback_data: `lr:${i}:${a}` }]),
        [{ text: '↩️ Retour', callback_data: `back:${a}` }],
      ]);
      return;

    case 'lr': {
      const reason = LITIGE_REASONS[Number(a)];
      const ticketId = b;
      if (!reason) return answerCallback(query.id, 'Motif inconnu.');
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, []);
      if (NEEDS_DETAIL[reason.code]) {
        await sessions().doc(chatId).set({ ticketId, reasonCode: reason.code, createdAt: new Date().toISOString() });
        return askForReply(chatId, NEEDS_DETAIL[reason.code]);
      }
      return report(chatId, tech, ticketId, { kind: 'LITIGE', reasonCode: reason.code });
    }

    case 'back':
      await answerCallback(query.id);
      if (messageId) await editButtons(chatId, messageId, workOrderButtons(a));
      return;

    default:
      return answerCallback(query.id);
  }
}

async function report(chatId: string, tech: Technician, ticketId: string, payload: Parameters<typeof recordTechnicianReport>[2]) {
  try {
    const ticket = await recordTechnicianReport(tech, ticketId, payload);
    const summary = payload.kind === 'NF'
      ? `🟢 <b>NF enregistré</b> pour le ticket ${ticket.ticketNumber}. Merci !`
      : `🔴 <b>Litige enregistré</b> pour le ticket ${ticket.ticketNumber} (${ticket.lastLitigeReasonLabel}). L'orienteur est prévenu.`;
    return sendMessage(chatId, summary);
  } catch (err) {
    if (err instanceof AccessError) return sendMessage(chatId, `⚠️ ${err.message}`);
    throw err;
  }
}
