// What happens in the technician's Telegram chat after an NF / litige / declaration, whatever
// the channel used (bot buttons, technician app, form): the buttons of the ticket's messages are
// removed, and after an NF the bot offers "Déclarer la prestation" (unless done).
import { sendMessage } from './telegram.js';
import { removeButtons, trackMessage } from './telegramMessages.js';
import { declareButton } from './miniapp.js';
import type { Technician, Ticket } from '../../src/types/index.js';

export async function afterTechnicianReport(base: string, tech: Technician, tickets: Ticket[], kind: 'NF' | 'LITIGE') {
  if (tickets.length === 0) return;
  await removeButtons(tickets.map(t => t.id));
  if (kind !== 'NF' || !tech.telegramChatId) return;

  const lead = tickets[0];
  const what = tickets.length > 1
    ? `les <b>${tickets.length} tickets</b> du splitter ${lead.splitterRef}`
    : `le ticket ${lead.ticketNumber}`;
  const nf = lead.nfType === 'CENTRAL_CONFIG' ? `NF config centrale (ONT ${lead.ontSerialNumber})` : 'NF';

  if (lead.prestationStatus === 'NON_FACTURABLE') {
    await sendMessage(tech.telegramChatId, `🟢 <b>${nf} enregistrée</b> pour ${what}. Reprise de votre intervention : pas de prestation à déclarer.`);
    return;
  }

  if (lead.prestationStatus === 'DECLAREE') {
    await removeButtons([lead.id], 'declare');
    await sendMessage(tech.telegramChatId, `🟢 <b>${nf} enregistrée</b> pour ${what}, prestation déclarée. Merci !`);
    return;
  }
  const sent = await sendMessage(
    tech.telegramChatId,
    `🟢 <b>${nf} enregistrée</b> pour ${what}. Merci !\n` +
      (tickets.length > 1 ? `Une seule prestation à déclarer pour cet incident (ticket ${lead.ticketNumber}).\n` : '') +
      `Déclarez la prestation maintenant ou plus tard depuis <b>Menu → Mon espace</b>.`,
    [[declareButton(base, tech, lead.id)]]
  );
  await trackMessage([lead.id], tech.telegramChatId, sent, 'declare');
}

export async function afterDeclaration(ticketId: string) {
  await removeButtons([ticketId], 'declare');
}
