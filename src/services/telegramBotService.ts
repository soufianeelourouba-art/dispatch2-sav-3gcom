import { store } from './storage';
import { Technician } from '../types';

export interface BotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

class TelegramBotService {
  private botInfo: BotInfo | null = null;
  private pollingInterval: any = null;
  private lastUpdateId: number = 0;
  private isPolling = false;

  constructor() {
    // Attempt to load bot info on boot if token is present
    const token = store.getTelegramToken();
    const savedUsername = store.getTelegramBotUsername();
    if (savedUsername) {
      this.botInfo = {
        id: 0,
        is_bot: true,
        first_name: 'Telegram Bot',
        username: savedUsername,
      };
    }
    if (token) {
      this.refreshBotInfo(token).catch(() => {});
      this.startPolling();
    }
  }

  public getBotUsername(): string {
    return this.botInfo?.username || store.getTelegramBotUsername() || 'OptiFibreBot';
  }

  public async refreshBotInfo(token?: string): Promise<BotInfo | null> {
    const currentToken = token || store.getTelegramToken();
    if (!currentToken) return null;

    try {
      const res = await fetch(`https://api.telegram.org/bot${currentToken}/getMe`);
      const data = await res.json();
      if (data.ok && data.result) {
        this.botInfo = data.result;
        if (data.result.username) {
          store.setTelegramBotUsername(data.result.username);
        }
        return this.botInfo;
      }
    } catch (err) {
      console.warn('[TelegramBotService] Could not reach Telegram getMe API:', err);
    }
    return null;
  }

  public generateActivationToken(techId: string): string {
    return `act_${techId.replace(/[^a-zA-Z0-9]/g, '')}_${Math.random().toString(36).substring(2, 7)}`;
  }

  public getActivationLink(tech: Technician): string {
    const botUser = this.getBotUsername();
    const token = tech.telegramActivationToken || `act_${tech.id}`;
    return `https://t.me/${botUser}?start=${token}`;
  }

  public getWhatsAppShareUrl(tech: Technician): string {
    const link = this.getActivationLink(tech);
    const message = `Bonjour ${tech.fullName},\n\nVoici votre lien d'activation sécurisé pour recevoir vos ordres de travail OptiFibre sur Telegram :\n👉 ${link}\n\n1. Cliquez sur le lien\n2. Appuyez sur "DÉMARRER" ou tapez /start\nVotre compte sera instantanément synchronisé !`;
    
    // Format phone: remove spaces, plus, dashes
    const cleanPhone = tech.phone.replace(/[\s\-\+\(\)]/g, '');
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  public getSmsShareUrl(tech: Technician): string {
    const link = this.getActivationLink(tech);
    const message = `Bonjour ${tech.fullName}, activez vos notifications Telegram OptiFibre en cliquant ici : ${link}`;
    const cleanPhone = tech.phone.replace(/[\s\-\+\(\)]/g, '');
    return `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
  }

  public startPolling() {
    if (this.isPolling) return;
    const token = store.getTelegramToken();
    if (!token) return;

    this.isPolling = true;
    console.log('[TelegramBotService] Polling started for technician activations');

    this.pollingInterval = setInterval(async () => {
      try {
        await this.checkUpdates();
      } catch (err) {
        // silent polling error
      }
    }, 4000);
  }

  public stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
  }

  public async checkUpdates() {
    const token = store.getTelegramToken();
    if (!token) return;

    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=2`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          const msg = update.message;
          if (!msg || !msg.text) continue;

          // Check if message is /start <token>
          const text = msg.text.trim();
          if (text.startsWith('/start')) {
            const parts = text.split(' ');
            const tokenParam = parts[1]?.trim();
            const chatId = String(msg.chat.id);
            const username = msg.from?.username || msg.from?.first_name || '';

            await this.handleStartCommand(tokenParam, chatId, username);
          }
        }
      }
    } catch (err) {
      // transient network error, will retry on next tick
    }
  }

  private async handleStartCommand(tokenParam: string | undefined, chatId: string, username: string) {
    if (!tokenParam) {
      await this.sendMessage(chatId, `👋 Bonjour ! Bienvenue sur le bot OptiFibre.\nPour lier votre compte technicien, veuillez utiliser le lien d'invitation personnalisé fourni par votre superviseur.`);
      return;
    }

    const technicians = store.getTechnicians();
    const tech = technicians.find(t => t.telegramActivationToken === tokenParam);

    if (!tech) {
      await this.sendMessage(chatId, `⚠️ Lien d'activation non reconnu ou déjà réinitialisé.\nVeuillez demander un nouveau lien à votre superviseur.`);
      return;
    }

    if (tech.telegramLinkDisabled) {
      await this.sendMessage(chatId, `🚫 Ce lien d'activation a été suspendu par votre superviseur. L'accès aux interventions est temporairement interrompu.`);
      return;
    }

    // Activate the technician
    store.updateTechnician(tech.id, {
      telegramChatId: chatId,
      telegramUsername: username ? `@${username.replace(/^@/, '')}` : undefined,
      telegramActivationStatus: 'ACTIVATED',
      telegramActivatedAt: new Date().toISOString(),
    });

    await this.sendMessage(
      chatId,
      `✅ Activation réussie !\n\nBonjour ${tech.fullName}, votre compte est maintenant lié à OptiFibre.\nVous recevrez automatiquement vos ordres d'intervention, alertes MSAN et comptes-rendus ici.`
    );
  }

  public async sendMessage(chatId: string, text: string): Promise<boolean> {
    const token = store.getTelegramToken();
    if (!token) return false;

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      });
      const data = await res.json();
      return !!data.ok;
    } catch (err) {
      console.warn('[TelegramBotService] Failed to send telegram message:', err);
      return false;
    }
  }

  public async testPing(tech: Technician): Promise<{ success: boolean; message: string }> {
    if (!tech.telegramChatId) {
      return { success: false, message: 'Aucun Chat ID associé à ce technicien.' };
    }

    const token = store.getTelegramToken();
    const text = `🔔 <b>TEST DE CONNEXION SUPERVISION</b>\n\nBonjour ${tech.fullName},\nVotre liaison Telegram OptiFibre est active et opérationnelle.\n\nDate du test : ${new Date().toLocaleTimeString('fr-FR')}`;

    if (token) {
      const sent = await this.sendMessage(tech.telegramChatId, text);
      if (sent) {
        return { success: true, message: `Notification test envoyée avec succès sur le Telegram de ${tech.fullName} !` };
      }
      return { success: false, message: 'Échec de transmission vers l\'API Telegram. Vérifiez le token ou si le technicien a bloqué le bot.' };
    }

    // In demo/offline mode without real token
    return {
      success: true,
      message: `[Mode Démo] Ping simulé avec succès pour ${tech.fullName} (Chat ID: ${tech.telegramChatId}).`,
    };
  }

  public simulateActivation(techId: string): Technician | null {
    const tech = store.getTechnicians().find(t => t.id === techId);
    if (!tech) return null;

    const fakeChatId = `chat_${Math.floor(100000000 + Math.random() * 900000000)}`;
    const fakeUsername = `@${tech.fullName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    store.updateTechnician(techId, {
      telegramChatId: fakeChatId,
      telegramUsername: fakeUsername,
      telegramActivationStatus: 'ACTIVATED',
      telegramActivatedAt: new Date().toISOString(),
      telegramLinkDisabled: false,
    });

    return store.getTechnicians().find(t => t.id === techId) || null;
  }

  public resetLink(techId: string): Technician | null {
    const tech = store.getTechnicians().find(t => t.id === techId);
    if (!tech) return null;

    const newToken = this.generateActivationToken(techId);

    store.updateTechnician(techId, {
      telegramActivationToken: newToken,
      telegramActivationStatus: 'PENDING',
      telegramActivatedAt: undefined,
      telegramLinkDisabled: false,
    });

    return store.getTechnicians().find(t => t.id === techId) || null;
  }

  public stopLink(techId: string): Technician | null {
    store.updateTechnician(techId, {
      telegramLinkDisabled: true,
      telegramActivationStatus: 'REVOKED',
    });
    return store.getTechnicians().find(t => t.id === techId) || null;
  }

  public resumeLink(techId: string): Technician | null {
    const tech = store.getTechnicians().find(t => t.id === techId);
    if (!tech) return null;

    store.updateTechnician(techId, {
      telegramLinkDisabled: false,
      telegramActivationStatus: tech.telegramChatId ? 'ACTIVATED' : 'PENDING',
    });
    return store.getTechnicians().find(t => t.id === techId) || null;
  }
}

export const telegramBotService = new TelegramBotService();
