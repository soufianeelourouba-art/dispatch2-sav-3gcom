// Keeps track of the bot messages carrying buttons for a ticket, so that once the ticket is
// handled (from Telegram, the technician app or the form) the buttons are replaced by a status
// and nothing actionable stays in the chat. Stored in "telegramMessages/{ticketId}" (server only).
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin.js';
import { editButtons } from './telegram.js';

type Kind = 'orders' | 'declare';
interface MessageRef {
  chatId: string;
  messageId: number;
}

const ref = (ticketId: string) => adminDb().collection('telegramMessages').doc(ticketId);

export async function trackMessage(ticketIds: string[], chatId: string, message: { message_id?: number } | undefined, kind: Kind) {
  if (!message?.message_id) return;
  const entry: MessageRef = { chatId, messageId: message.message_id };
  await Promise.all(ticketIds.map(id => ref(id).set({ [kind]: FieldValue.arrayUnion(entry) }, { merge: true })));
}

// Replaces the buttons of the tracked messages by a single status label (e.g. "✅ NF enregistrée").
export async function settleMessages(ticketIds: string[], label: string, kind: Kind = 'orders') {
  const seen = new Set<string>();
  for (const id of ticketIds) {
    const snap = await ref(id).get();
    for (const m of ((snap.data()?.[kind] || []) as MessageRef[])) {
      const key = `${m.chatId}:${m.messageId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // The message may be too old or already settled: never fail the user action for this
      await editButtons(m.chatId, m.messageId, [[{ text: label, callback_data: 'done' }]]).catch(() => {});
    }
  }
}

export const STATUS_LABELS = {
  NF: '✅ NF enregistrée',
  LITIGE: '🔴 Litige signalé',
  DECLARED: '✅ Prestation déclarée',
};
