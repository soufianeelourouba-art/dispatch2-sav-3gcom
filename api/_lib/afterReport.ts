// What happens in the technician's Telegram chat after an NF / litige / declaration, whatever
// the channel used (bot buttons, technician app, form): the buttons of the ticket's messages are
// removed and the NF is confirmed. The work done (prestation) is declared only in the technician
// app ("Mon espace" → À déclarer): no declaration button in the chat, to keep it simple.
import { sendMessage } from './telegram.js';
import { removeButtons } from './telegramMessages.js';
import type { Technician, Ticket } from '../../src/types/index.js';

export async function afterTechnicianReport(_base: string, tech: Technician, tickets: Ticket[], kind: 'NF' | 'LITIGE') {
  if (tickets.length === 0) return;
  await removeButtons(tickets.map(t => t.id));
  // Declaration buttons sent by the former version are removed too once the ticket is handled
  await removeButtons(tickets.map(t => t.id), 'declare');
  if (kind !== 'NF' || !tech.telegramChatId) return;

  const lead = tickets[0];
  const what = tickets.length > 1 ? `${tickets.length} tickets (Splitter ${lead.splitterRef})` : `Ticket ${lead.ticketNumber}`;
  const nf = lead.nfType === 'CENTRAL_CONFIG' ? `NF Config (ONT ${lead.ontSerialNumber})` : 'NF';
  await sendMessage(tech.telegramChatId, `🟢 <b>تم تسجيل ${nf}</b> : ${what}. شكرا !`);
}

export async function afterDeclaration(ticketId: string) {
  await removeButtons([ticketId], 'declare');
}
