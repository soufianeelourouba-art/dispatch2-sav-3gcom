import { Ticket, TicketEvent, EventType, LitigeReasonCode } from '../types';
import { store } from './storage';
import { formatTicketMessage } from '../domain/tickets';

export interface TelegramOutboundMessage {
  id: string;
  technicianId: string;
  technicianName: string;
  ticketId: string;
  ticketNumber: string;
  textPayload: string;
  sentAt: string;
  delivered: boolean;
  status: 'PENDING' | 'SENT' | 'FAILED_RETRY';
}

class TelegramGatewayService {
  private queue: TelegramOutboundMessage[] = [];
  private isOnline: boolean = true;
  private listeners: Set<() => void> = new Set();

  constructor() {
    setInterval(() => {
      this.flushQueue();
    }, 4000);
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  public setOnlineStatus(online: boolean) {
    this.isOnline = online;
    if (online) {
      this.flushQueue();
    }
    this.notify();
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }

  public getQueue(): TelegramOutboundMessage[] {
    return [...this.queue];
  }

  public queueTicketDispatch(ticket: Ticket, technicianId: string, technicianName: string) {
    const messageText = formatTicketMessage(ticket);

    const msg: TelegramOutboundMessage = {
      id: `tg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      technicianId,
      technicianName,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      textPayload: messageText,
      sentAt: new Date().toISOString(),
      delivered: this.isOnline,
      status: this.isOnline ? 'SENT' : 'PENDING',
    };

    this.queue.unshift(msg);
    this.notify();
    // Real Telegram delivery is done by the server (/api/notify), never from the browser.
  }

  private flushQueue() {
    if (!this.isOnline) return;

    let updated = false;
    this.queue.forEach(msg => {
      if (msg.status === 'PENDING') {
        msg.status = 'SENT';
        msg.delivered = true;
        updated = true;
      }
    });

    if (updated) {
      this.notify();
    }
  }

  // Submit NF (Normalisé / Fait)
  public submitNF(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    nfType: 'STANDARD' | 'CENTRAL_CONFIG';
    ontSerialNumber?: string;
    cableLengthMeters?: number;
    notes?: string;
  }) {
    store.addTicketEvent({
      ticketId: params.ticketId,
      eventType: 'NF_SUBMITTED',
      actorRole: 'TECHNICIAN',
      actorName: params.technicianName,
      technicianId: params.technicianId,
      technicianName: params.technicianName,
      nfType: params.nfType,
      ontSerialNumber: params.ontSerialNumber,
      cableLengthMeters: params.cableLengthMeters,
      notes: params.notes || `Intervention NF validée (${params.nfType === 'CENTRAL_CONFIG' ? 'Config centrale + ONT' : 'Standard'}, ${params.cableLengthMeters || 0}m de câble posé).`,
    });
  }

  // Submit Litige (LC)
  public submitLitige(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    litigeReasonCode: LitigeReasonCode;
    litigeReasonLabel: string;
    rdvDateTime?: string;
    notes?: string;
  }) {
    store.addTicketEvent({
      ticketId: params.ticketId,
      eventType: 'LITIGE_REPORTED',
      actorRole: 'TECHNICIAN',
      actorName: params.technicianName,
      technicianId: params.technicianId,
      technicianName: params.technicianName,
      litigeReasonCode: params.litigeReasonCode,
      litigeReasonLabel: params.litigeReasonLabel,
      rdvDateTime: params.rdvDateTime,
      notes: params.notes,
    });
  }
}

export const telegramGateway = new TelegramGatewayService();
