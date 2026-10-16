// Sets the bot commands and the "Mon espace" menu button of every technician linked to Telegram.
// Same as the manager's "Connecter le bot" button, without touching the webhook:
//   TELEGRAM_BOT_TOKEN=... npx jiti scripts/setup-bot-menu.ts [https://dispatch2-sav-3gcom.vercel.app]
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';
import { BOT_COMMANDS, setTechnicianMenu } from '../api/_lib/miniapp.ts';
import { telegram } from '../api/_lib/telegram.ts';
import type { Technician } from '../src/types/index.ts';

const base = process.argv[2] || 'https://dispatch2-sav-3gcom.vercel.app';
await telegram('setMyCommands', { commands: BOT_COMMANDS });
console.log('Commandes du menu :', BOT_COMMANDS.map(c => `/${c.command}`).join(', '));

const linked = await getFirestore().collection('technicians').where('telegramActivationStatus', '==', 'ACTIVATED').get();
for (const doc of linked.docs) {
  const tech = { ...(doc.data() as Technician), id: doc.id };
  try {
    await setTechnicianMenu(base, tech);
    console.log(`« Mon espace » activé pour ${tech.fullName}`);
  } catch (err: any) {
    console.log(`Échec pour ${tech.fullName} : ${err.message}`);
  }
}
