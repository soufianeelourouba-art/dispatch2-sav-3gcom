// POST /api/telegram-setup — manager only. Checks the bot token configured on the server,
// points the Telegram webhook to this deployment and publishes the bot's public username.
import { adminDb } from './_lib/admin.js';
import { requireStaff, json, handleError, HttpError } from './_lib/http.js';
import { telegram } from './_lib/telegram.js';
import { webhookSecret } from './_lib/webhookSecret.js';
import { appBaseUrl, BOT_COMMANDS, setTechnicianMenu } from './_lib/miniapp.js';
import type { Technician } from '../src/types/index.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireStaff(request);
    if (user.role !== 'MANAGER') throw new HttpError(403, 'Réservé aux managers');
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new HttpError(400, 'Le token du bot n\'est pas encore configuré dans Vercel (TELEGRAM_BOT_TOKEN).');
    }

    let bot: { username: string };
    try {
      bot = await telegram<{ username: string }>('getMe');
    } catch {
      throw new HttpError(400, 'Token Telegram refusé par Telegram. Vérifiez TELEGRAM_BOT_TOKEN dans Vercel.');
    }

    const webhookUrl = `${new URL(request.url).origin}/api/telegram-webhook`;
    await telegram('setWebhook', {
      url: webhookUrl,
      secret_token: webhookSecret(),
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });
    await telegram('setMyCommands', { commands: BOT_COMMANDS });

    // "Mon espace" menu button for every technician already linked to Telegram
    const linked = await adminDb().collection('technicians').where('telegramActivationStatus', '==', 'ACTIVATED').get();
    for (const doc of linked.docs) {
      await setTechnicianMenu(appBaseUrl(request), { ...(doc.data() as Technician), id: doc.id }).catch(() => {});
    }

    await adminDb().collection('settings').doc('telegram_info').set(
      { username: bot.username, webhookUrl, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return json({ username: bot.username, webhookUrl });
  } catch (err) {
    return handleError(err);
  }
}
