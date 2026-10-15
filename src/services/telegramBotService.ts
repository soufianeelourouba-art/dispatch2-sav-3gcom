import { store } from './storage';
import { Technician } from '../types';

// Browser-side helpers for technician Telegram links.
// The bot token never reaches the browser: messages and the /start activation are
// handled by the server-side webhook (Vercel function).
class TelegramBotService {
  public getBotUsername(): string {
    return store.getTelegramBotUsername() || 'OptiFibreBot';
  }

  public generateActivationToken(techId: string): string {
    const random = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');
    return `act_${random}`;
  }

  public getActivationLink(tech: Technician): string {
    const botUser = this.getBotUsername();
    const token = tech.telegramActivationToken || `act_${tech.id}`;
    return `https://t.me/${botUser}?start=${token}`;
  }

  public getDirectMobilePortalLink(tech: Technician): string {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://dispatch2-sav-3gcom.vercel.app';
    return `${base}/?act=${encodeURIComponent(tech.telegramActivationToken || '')}`;
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

  public async testPing(tech: Technician): Promise<{ success: boolean; message: string }> {
    if (!tech.telegramChatId) {
      return { success: false, message: 'Aucun Chat ID associé à ce technicien.' };
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
