import { createHash } from 'node:crypto';

// Secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token on every webhook call,
// derived from the bot token so no extra environment variable is needed.
export function webhookSecret(): string {
  return createHash('sha256').update(`webhook:${process.env.TELEGRAM_BOT_TOKEN || ''}`).digest('hex').slice(0, 48);
}
