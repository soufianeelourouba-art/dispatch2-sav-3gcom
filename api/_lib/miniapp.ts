// Links opening the technician app (the portal) inside Telegram as a Mini App.
import { telegram, type InlineButton } from './telegram.js';
import type { Technician } from '../../src/types/index.js';

export function appBaseUrl(request: Request): string {
  return new URL(request.url).origin;
}

// ?act=<secret token> identifies the technician; mode/ticket open a form directly.
export function technicianAppUrl(base: string, tech: Technician, params: Record<string, string> = {}): string {
  const url = new URL(base);
  url.searchParams.set('act', tech.telegramActivationToken || '');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

export const webAppButton = (text: string, url: string): InlineButton => ({ text, web_app: { url } });

export const declareButton = (base: string, tech: Technician, ticketId: string) =>
  webAppButton('📝 Déclarer la prestation', technicianAppUrl(base, tech, { mode: 'declare', ticket: ticketId }));

export const configNfButton = (base: string, tech: Technician, ticketId: string, group: boolean) =>
  webAppButton(
    group ? '⚙️ NF Config (كل الـ Splitter)' : '⚙️ NF Config',
    technicianAppUrl(base, tech, { mode: 'nf', nfType: 'CENTRAL_CONFIG', ticket: ticketId, ...(group ? { scope: 'SPLITTER' } : {}) })
  );

// Telegram "Menu" button of the technician's chat → "Mon espace"
export async function setTechnicianMenu(base: string, tech: Technician) {
  if (!tech.telegramChatId || !tech.telegramActivationToken) return;
  await telegram('setChatMenuButton', {
    chat_id: tech.telegramChatId,
    menu_button: { type: 'web_app', text: 'Mon espace', web_app: { url: technicianAppUrl(base, tech) } },
  });
}

export const BOT_COMMANDS = [
  { command: 'tickets', description: 'تدخلاتي الجارية' },
  { command: 'a_declarer', description: 'الأشغال التي يجب تسجيلها' },
];
