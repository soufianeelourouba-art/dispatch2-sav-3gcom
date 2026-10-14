import {
  Sector,
  TechnicalZone,
  ZoneAlias,
  Technician,
  User,
  Ticket,
  TicketEvent,
  TicketStatus,
  SumCheckResult,
  EventType,
  LitigeReasonCode,
  SLAStatus,
  LITIGE_REASONS
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_SECTORS,
  INITIAL_TECHNICAL_ZONES,
  INITIAL_ZONE_ALIASES,
  INITIAL_TECHNICIANS,
  INITIAL_TICKETS,
  INITIAL_EVENTS
} from '../data/initialReferential';
import { db, testFirestoreConnection } from './firebase';
import { collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

const STORAGE_KEYS = {
  USERS: '3gcom_users_v2',
  CURRENT_USER: '3gcom_current_user_v2',
  SECTORS: '3gcom_sectors_v2',
  ZONES: '3gcom_zones_v2',
  ZONE_ALIASES: '3gcom_zone_aliases_v2',
  TECHNICIANS: '3gcom_technicians_v2',
  TICKETS: '3gcom_tickets_v2',
  EVENTS: '3gcom_events_v2',
  TELEGRAM_TOKEN: '3gcom_telegram_token_v2',
};

// --- SLA Invariant (24-Hour Strict SLA) ---
export function computeTicketSLA(registeredAt: string): {
  slaDeadline: string;
  slaStatus: SLAStatus;
  slaRemainingHours: number;
} {
  const regTime = new Date(registeredAt).getTime();
  const deadlineTime = regTime + 24 * 3600 * 1000; // 24 hours deadline
  const now = Date.now();
  const diffMs = deadlineTime - now;
  const slaRemainingHours = Math.round((diffMs / (3600 * 1000)) * 10) / 10;

  let slaStatus: SLAStatus = 'ON_TIME';
  if (diffMs <= 0) {
    slaStatus = 'EXPIRED';
  } else if (diffMs < 6 * 3600 * 1000) {
    slaStatus = 'WARNING'; // Less than 6 hours remaining
  }

  return {
    slaDeadline: new Date(deadlineTime).toISOString(),
    slaStatus,
    slaRemainingHours,
  };
}

// --- Format SLA remaining text for clean display ---
export function formatSLADisplay(remainingHours: number, status: SLAStatus): { text: string; label: string } {
  if (status === 'EXPIRED') {
    const overdue = Math.abs(remainingHours);
    const hours = Math.floor(overdue);
    const mins = Math.round((overdue - hours) * 60);
    return {
      text: `${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}`,
      label: `En retard de ${hours}h${mins > 0 ? mins : ''}`,
    };
  }

  const hours = Math.floor(remainingHours);
  const mins = Math.round((remainingHours - hours) * 60);
  return {
    text: `${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}`,
    label: `Reste ${hours}h${mins > 0 ? mins : ''}`,
  };
}

// --- Invariant 2: Pure status reducer from append-only events (§8.2) ---
export function reduceTicketStatus(events: TicketEvent[], ticket: Partial<Ticket>): TicketStatus {
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  if (!ticket.technicalZoneId && !ticket.sectorId) {
    return 'ZONE_TO_MAP';
  }

  if (sorted.length === 0) {
    return 'TO_ASSIGN';
  }

  const lastEvent = sorted[sorted.length - 1];

  switch (lastEvent.eventType) {
    case 'NF_SUBMITTED':
      return 'COMPLETED';
    case 'LITIGE_REPORTED':
    case 'LITIGE_VALIDATED':
      return 'LITIGE';
    case 'LITIGE_REOPENED':
      return 'REOPENED';
    case 'ASSIGNED':
    case 'REASSIGNED':
    case 'TELEGRAM_SENT':
      return 'ASSIGNED';
    case 'PROPOSED':
      return 'PROPOSED';
    case 'IMPORT':
    default:
      if (!ticket.technicalZoneId) {
        return 'ZONE_TO_MAP';
      }
      return 'TO_ASSIGN';
  }
}

// --- Invariant 5: Timezone formatting (Africa/Casablanca) ---
export function formatCasablancaDateTime(utcIsoString: string | undefined): string {
  if (!utcIsoString) return '—';
  try {
    const date = new Date(utcIsoString);
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Casablanca',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return utcIsoString;
  }
}

export function formatCasablancaTimeOnly(utcIsoString: string | undefined): string {
  if (!utcIsoString) return '—';
  try {
    const date = new Date(utcIsoString);
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Casablanca',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return utcIsoString;
  }
}

class AppStateStore {
  private users: User[] = [];
  private currentUser: User | null = null;
  private sectors: Sector[] = [];
  private zones: TechnicalZone[] = [];
  private zoneAliases: ZoneAlias[] = [];
  private technicians: Technician[] = [];
  private tickets: Ticket[] = [];
  private events: TicketEvent[] = [];
  private telegramToken: string = '';
  private listeners: Set<() => void> = new Set();
  private isFirestoreSyncing: boolean = false;

  constructor() {
    this.loadInitialData();
    this.initFirestoreSync();
  }

  private loadInitialData() {
    try {
      const storedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      this.users = storedUsers ? JSON.parse(storedUsers) : INITIAL_USERS;

      const storedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      this.currentUser = storedUser ? JSON.parse(storedUser) : null;

      const storedSectors = localStorage.getItem(STORAGE_KEYS.SECTORS);
      this.sectors = storedSectors ? JSON.parse(storedSectors) : INITIAL_SECTORS;

      const storedZones = localStorage.getItem(STORAGE_KEYS.ZONES);
      this.zones = storedZones ? JSON.parse(storedZones) : INITIAL_TECHNICAL_ZONES;

      const storedAliases = localStorage.getItem(STORAGE_KEYS.ZONE_ALIASES);
      this.zoneAliases = storedAliases ? JSON.parse(storedAliases) : INITIAL_ZONE_ALIASES;

      const storedTechs = localStorage.getItem(STORAGE_KEYS.TECHNICIANS);
      const rawTechs: Technician[] = storedTechs ? JSON.parse(storedTechs) : INITIAL_TECHNICIANS;
      this.technicians = rawTechs.map(t => ({
        ...t,
        telegramActivationToken: t.telegramActivationToken || `act_${t.id.replace(/[^a-zA-Z0-9]/g, '')}_${t.phone ? t.phone.replace(/[^0-9]/g, '').slice(-4) : '0000'}`,
        telegramActivationStatus: t.telegramActivationStatus || (t.telegramChatId ? 'ACTIVATED' : 'PENDING'),
        telegramLinkDisabled: t.telegramLinkDisabled ?? false,
      }));

      if (localStorage.getItem('3gcom_cleaned_tickets_prod_v2') !== 'true') {
        localStorage.removeItem(STORAGE_KEYS.TICKETS);
        localStorage.removeItem(STORAGE_KEYS.EVENTS);
        localStorage.setItem('3gcom_cleaned_tickets_prod_v2', 'true');
      }

      const storedTickets = localStorage.getItem(STORAGE_KEYS.TICKETS);
      let parsedTickets: Ticket[] = storedTickets ? JSON.parse(storedTickets) : [];
      
      // Refresh SLA for all loaded tickets
      this.tickets = parsedTickets.map(t => {
        const sla = computeTicketSLA(t.registeredAt);
        return {
          ...t,
          slaDeadline: sla.slaDeadline,
          slaStatus: sla.slaStatus,
          slaRemainingHours: sla.slaRemainingHours,
        };
      });

      const storedEvents = localStorage.getItem(STORAGE_KEYS.EVENTS);
      this.events = storedEvents ? JSON.parse(storedEvents) : [];

      const storedToken = localStorage.getItem(STORAGE_KEYS.TELEGRAM_TOKEN);
      this.telegramToken = storedToken || '';
    } catch (e) {
      console.warn('LocalStorage reset to defaults', e);
      this.users = INITIAL_USERS;
      this.currentUser = null;
      this.sectors = INITIAL_SECTORS;
      this.zones = INITIAL_TECHNICAL_ZONES;
      this.zoneAliases = INITIAL_ZONE_ALIASES;
      this.technicians = INITIAL_TECHNICIANS;
      this.tickets = this.enrichInitialTickets(INITIAL_TICKETS);
      this.events = INITIAL_EVENTS;
      this.telegramToken = '';
    }
  }

  private enrichInitialTickets(baseTickets: any[]): Ticket[] {
    return baseTickets.map((t, i) => {
      let regDate = t.registeredAt;
      if (i === 0) {
        regDate = new Date(Date.now() - 28 * 3600 * 1000).toISOString();
      } else if (i === 1) {
        regDate = new Date(Date.now() - 21 * 3600 * 1000).toISOString();
      } else {
        regDate = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
      }

      const sla = computeTicketSLA(regDate);
      return {
        ...t,
        registeredAt: regDate,
        slaDeadline: sla.slaDeadline,
        slaStatus: sla.slaStatus,
        slaRemainingHours: sla.slaRemainingHours,
      };
    });
  }

  // --- Real-time Cloud Firestore Synchronization ---
  private initFirestoreSync() {
    try {
      testFirestoreConnection();

      // 1. Listen for tickets in real time
      onSnapshot(collection(db, 'tickets'), snapshot => {
        if (!snapshot.empty) {
          const remoteTickets: Ticket[] = [];
          snapshot.forEach(docSnap => {
            remoteTickets.push(docSnap.data() as Ticket);
          });
          if (remoteTickets.length > 0) {
            this.tickets = remoteTickets;
            localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(this.tickets));
            this.notify();
          }
        } else if (this.tickets.length > 0) {
          // Seed initial tickets to Firestore
          this.tickets.forEach(t => this.syncDocToFirestore('tickets', t.id, t));
        }
      }, err => {
        console.warn('Firestore tickets sync notice:', err.message);
      });

      // 2. Listen for events in real time
      onSnapshot(collection(db, 'events'), snapshot => {
        if (!snapshot.empty) {
          const remoteEvents: TicketEvent[] = [];
          snapshot.forEach(docSnap => {
            remoteEvents.push(docSnap.data() as TicketEvent);
          });
          if (remoteEvents.length > 0) {
            this.events = remoteEvents;
            localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(this.events));
            this.notify();
          }
        } else if (this.events.length > 0) {
          this.events.forEach(e => this.syncDocToFirestore('events', e.id, e));
        }
      }, err => {
        console.warn('Firestore events sync notice:', err.message);
      });

      // 3. Listen for technicians in real time
      onSnapshot(collection(db, 'technicians'), snapshot => {
        if (!snapshot.empty) {
          const remoteTechs: Technician[] = [];
          snapshot.forEach(docSnap => {
            remoteTechs.push(docSnap.data() as Technician);
          });
          if (remoteTechs.length > 0) {
            this.technicians = remoteTechs;
            localStorage.setItem(STORAGE_KEYS.TECHNICIANS, JSON.stringify(this.technicians));
            this.notify();
          }
        } else if (this.technicians.length > 0) {
          this.technicians.forEach(t => this.syncDocToFirestore('technicians', t.id, t));
        }
      }, err => {
        console.warn('Firestore technicians sync notice:', err.message);
      });

      // 4. Listen for users in real time (Orienteurs & Managers)
      onSnapshot(collection(db, 'users'), snapshot => {
        if (!snapshot.empty) {
          const remoteUsers: User[] = [];
          snapshot.forEach(docSnap => {
            remoteUsers.push(docSnap.data() as User);
          });
          if (remoteUsers.length > 0) {
            this.users = remoteUsers;
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
            this.notify();
          }
        } else if (this.users.length > 0) {
          this.users.forEach(u => this.syncDocToFirestore('users', u.id, u));
        }
      }, err => {
        console.warn('Firestore users sync notice:', err.message);
      });

      // 5. Listen for sectors in real time
      onSnapshot(collection(db, 'sectors'), snapshot => {
        if (!snapshot.empty) {
          const remoteSectors: Sector[] = [];
          snapshot.forEach(docSnap => {
            remoteSectors.push(docSnap.data() as Sector);
          });
          if (remoteSectors.length > 0) {
            this.sectors = remoteSectors;
            localStorage.setItem(STORAGE_KEYS.SECTORS, JSON.stringify(this.sectors));
            this.notify();
          }
        } else if (this.sectors.length > 0) {
          this.sectors.forEach(s => this.syncDocToFirestore('sectors', s.id, s));
        }
      }, err => {
        console.warn('Firestore sectors sync notice:', err.message);
      });

      // 6. Listen for technical zones in real time
      onSnapshot(collection(db, 'technicalZones'), snapshot => {
        if (!snapshot.empty) {
          const remoteZones: TechnicalZone[] = [];
          snapshot.forEach(docSnap => {
            remoteZones.push(docSnap.data() as TechnicalZone);
          });
          if (remoteZones.length > 0) {
            this.zones = remoteZones;
            localStorage.setItem(STORAGE_KEYS.ZONES, JSON.stringify(this.zones));
            this.notify();
          }
        } else if (this.zones.length > 0) {
          this.zones.forEach(z => this.syncDocToFirestore('technicalZones', z.id, z));
        }
      }, err => {
        console.warn('Firestore technicalZones sync notice:', err.message);
      });

      // 7. Listen for settings (Telegram Bot Token, etc.)
      onSnapshot(doc(db, 'settings', 'telegram'), docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data?.token && data.token !== this.telegramToken) {
            this.telegramToken = data.token;
            localStorage.setItem(STORAGE_KEYS.TELEGRAM_TOKEN, data.token);
            this.notify();
          }
        }
      }, err => {
        console.warn('Firestore settings sync notice:', err.message);
      });
    } catch (e) {
      console.warn('Firestore init note:', e);
    }
  }

  public syncDocToFirestore(collectionName: string, docId: string, data: any) {
    try {
      setDoc(doc(db, collectionName, docId), data, { merge: true }).catch(err => {
        console.warn(`Firestore save to ${collectionName}/${docId} notice:`, err?.message);
      });
    } catch {}
  }

  public deleteDocFromFirestore(collectionName: string, docId: string) {
    try {
      deleteDoc(doc(db, collectionName, docId)).catch(err => {
        console.warn(`Firestore delete from ${collectionName}/${docId} notice:`, err?.message);
      });
    } catch {}
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
      if (this.currentUser) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(this.currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      }
      localStorage.setItem(STORAGE_KEYS.SECTORS, JSON.stringify(this.sectors));
      localStorage.setItem(STORAGE_KEYS.ZONES, JSON.stringify(this.zones));
      localStorage.setItem(STORAGE_KEYS.ZONE_ALIASES, JSON.stringify(this.zoneAliases));
      localStorage.setItem(STORAGE_KEYS.TECHNICIANS, JSON.stringify(this.technicians));
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(this.tickets));
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(this.events));
      localStorage.setItem(STORAGE_KEYS.TELEGRAM_TOKEN, this.telegramToken);
    } catch (e) {
      console.error('Failed to persist to localStorage', e);
    }
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  // --- Session & Authentication ---
  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public setCurrentUser(user: User | null) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
    this.notify();
  }

  public login(username: string, passwordAttempt: string): { success: boolean; user?: User; error?: string } {
    const trimmedUsername = username.trim().toLowerCase();
    const user = this.users.find(u => u.username.toLowerCase() === trimmedUsername);
    if (!user) {
      return { success: false, error: 'Identifiant introuvable. Veuillez vérifier votre nom d\'utilisateur.' };
    }

    if (user.password && user.password !== passwordAttempt.trim()) {
      return { success: false, error: 'Mot de passe incorrect.' };
    }

    this.setCurrentUser(user);
    return { success: true, user };
  }

  public logout() {
    this.setCurrentUser(null);
  }

  public getAllUsers(): User[] {
    return this.users;
  }

  public addUser(userData: Omit<User, 'id'>): User {
    const newUser: User = {
      ...userData,
      id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    };
    this.users.push(newUser);
    this.persist();
    this.syncDocToFirestore('users', newUser.id, newUser);
    return newUser;
  }

  public updateUser(userId: string, data: Partial<User>) {
    const index = this.users.findIndex(u => u.id === userId);
    if (index >= 0) {
      this.users[index] = { ...this.users[index], ...data };
      if (this.currentUser && this.currentUser.id === userId) {
        this.currentUser = this.users[index];
      }
      this.persist();
      this.syncDocToFirestore('users', userId, this.users[index]);
    }
  }

  public deleteUser(userId: string) {
    this.users = this.users.filter(u => u.id !== userId);
    this.persist();
  }

  // --- Strict Sector Partition Enforcement (§8.4) ---
  public getTickets(requestingUser?: User | null): Ticket[] {
    const user = requestingUser !== undefined ? requestingUser : this.currentUser;
    // Always refresh real-time SLA metrics
    const now = Date.now();
    const enriched = this.tickets.map(t => {
      const sla = computeTicketSLA(t.registeredAt);
      return {
        ...t,
        slaDeadline: sla.slaDeadline,
        slaStatus: sla.slaStatus,
        slaRemainingHours: sla.slaRemainingHours,
      };
    });

    if (user && user.role === 'DISPATCHER') {
      return enriched.filter(t => t.sectorId === user.sectorId);
    }
    return enriched;
  }

  public clearAllTickets() {
    this.tickets = [];
    this.events = [];
    this.persist();
  }

  public getTicketById(ticketId: string, requestingUser?: User | null): Ticket | null {
    const tickets = this.getTickets(requestingUser);
    return tickets.find(t => t.id === ticketId) || null;
  }

  public getEventsForTicket(ticketId: string): TicketEvent[] {
    return this.events
      .filter(e => e.ticketId === ticketId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public getSectors(requestingUser?: User | null): Sector[] {
    const user = requestingUser !== undefined ? requestingUser : this.currentUser;
    if (user && user.role === 'DISPATCHER' && user.sectorId) {
      return this.sectors.filter(s => s.id === user.sectorId);
    }
    return [...this.sectors];
  }

  public getTechnicalZones(requestingUser?: User | null): TechnicalZone[] {
    const user = requestingUser !== undefined ? requestingUser : this.currentUser;
    if (user && user.role === 'DISPATCHER' && user.sectorId) {
      return this.zones.filter(z => z.sectorId === user.sectorId);
    }
    return [...this.zones];
  }

  public getZoneAliases(): ZoneAlias[] {
    return [...this.zoneAliases];
  }

  public getTechnicians(requestingUser?: User | null): Technician[] {
    const user = requestingUser !== undefined ? requestingUser : this.currentUser;
    if (user && user.role === 'DISPATCHER' && user.sectorId) {
      return this.technicians.filter(t => t.sectorId === user.sectorId);
    }
    return [...this.technicians];
  }

  public getTelegramToken(): string {
    return this.telegramToken;
  }

  public setTelegramToken(token: string) {
    this.telegramToken = token;
    this.persist();
    this.syncDocToFirestore('settings', 'telegram', { token, updatedAt: new Date().toISOString() });
  }

  public getTelegramBotUsername(): string {
    return localStorage.getItem('3gcom_telegram_bot_username') || '';
  }

  public setTelegramBotUsername(username: string) {
    localStorage.setItem('3gcom_telegram_bot_username', username);
    this.syncDocToFirestore('settings', 'telegram_info', { username, updatedAt: new Date().toISOString() });
    this.notify();
  }

  // --- Append-Only Event Engine ---
  public addTicketEvent(params: {
    ticketId: string;
    eventType: EventType;
    actorRole: 'SYSTEM' | 'DISPATCHER' | 'MANAGER' | 'TECHNICIAN';
    actorName: string;
    technicianId?: string;
    technicianName?: string;
    
    // NF details
    nfType?: 'STANDARD' | 'CENTRAL_CONFIG';
    ontSerialNumber?: string;
    cableLengthMeters?: number;

    // Litige details
    litigeReasonCode?: LitigeReasonCode;
    litigeReasonLabel?: string;
    rdvDateTime?: string;

    // Dispatcher update
    dispatcherUpdateNotes?: string;
    newClientPhone?: string;

    notes?: string;
    photoUrl?: string;
  }): TicketEvent {
    const ticketIndex = this.tickets.findIndex(t => t.id === params.ticketId);
    if (ticketIndex === -1) {
      throw new Error(`Ticket ${params.ticketId} introuvable.`);
    }

    const ticket = this.tickets[ticketIndex];
    const newEvent: TicketEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ticketId: params.ticketId,
      eventType: params.eventType,
      actorRole: params.actorRole,
      actorName: params.actorName,
      technicianId: params.technicianId,
      technicianName: params.technicianName,
      nfType: params.nfType,
      ontSerialNumber: params.ontSerialNumber,
      cableLengthMeters: params.cableLengthMeters,
      litigeReasonCode: params.litigeReasonCode,
      litigeReasonLabel: params.litigeReasonLabel,
      rdvDateTime: params.rdvDateTime,
      dispatcherUpdateNotes: params.dispatcherUpdateNotes,
      newClientPhone: params.newClientPhone,
      notes: params.notes,
      photoUrl: params.photoUrl,
      createdAt: new Date().toISOString(),
    };

    this.events.push(newEvent);

    const allTicketEvents = this.getEventsForTicket(ticket.id);
    const newStatus = reduceTicketStatus(allTicketEvents, ticket);

    const updatedTicket: Ticket = {
      ...ticket,
      currentStatus: newStatus,
      isClosed: newStatus === 'COMPLETED',
      updatedAt: new Date().toISOString(),
      lastEventAt: newEvent.createdAt,
    };

    if (params.technicianId) {
      updatedTicket.currentAssignedTechId = params.technicianId;
    }

    if (params.nfType) {
      updatedTicket.nfType = params.nfType;
      updatedTicket.ontSerialNumber = params.ontSerialNumber;
      updatedTicket.cableLengthMeters = params.cableLengthMeters;
    }

    if (params.litigeReasonCode) {
      updatedTicket.lastLitigeReasonCode = params.litigeReasonCode;
      updatedTicket.lastLitigeReasonLabel = params.litigeReasonLabel;
      updatedTicket.lastLitigeRdvDate = params.rdvDateTime;
      updatedTicket.lastVisitedTechName = params.technicianName;
      updatedTicket.lastVisitedAt = newEvent.createdAt;
    }

    if (params.newClientPhone) {
      updatedTicket.clientPhone = params.newClientPhone;
      updatedTicket.reopenedWithNewPhone = params.newClientPhone;
    }

    if (params.dispatcherUpdateNotes) {
      updatedTicket.lastDispatcherUpdateNotes = params.dispatcherUpdateNotes;
    }

    this.tickets[ticketIndex] = updatedTicket;
    this.persist();
    this.syncDocToFirestore('tickets', updatedTicket.id, updatedTicket);
    this.syncDocToFirestore('events', newEvent.id, newEvent);
    return newEvent;
  }

  // --- Dispatcher Operations on Litiges (§2) ---
  public reopenTicketWithUpdate(params: {
    ticketId: string;
    actorName: string;
    dispatcherNotes: string;
    newPhone?: string;
  }) {
    const ticket = this.tickets.find(t => t.id === params.ticketId);
    if (!ticket) return;

    this.addTicketEvent({
      ticketId: params.ticketId,
      eventType: 'LITIGE_REOPENED',
      actorRole: 'DISPATCHER',
      actorName: params.actorName,
      technicianId: ticket.currentAssignedTechId,
      technicianName: ticket.lastVisitedTechName,
      dispatcherUpdateNotes: params.dispatcherNotes,
      newClientPhone: params.newPhone,
      notes: `Ticket réouvert avec informations complémentaires : ${params.dispatcherNotes}`,
    });
  }

  public validateLitige(params: {
    ticketId: string;
    actorName: string;
    notes?: string;
  }) {
    const ticket = this.tickets.find(t => t.id === params.ticketId);
    if (!ticket) return;

    this.addTicketEvent({
      ticketId: params.ticketId,
      eventType: 'LITIGE_VALIDATED',
      actorRole: 'DISPATCHER',
      actorName: params.actorName,
      notes: params.notes || 'Motif de litige validé par l\'orienteur. Dossier escaladé / replanifié.',
    });
  }

  public validateDispatch(proposals: { ticketId: string; technicianId: string; technicianName: string }[], actorName: string) {
    proposals.forEach(p => {
      this.addTicketEvent({
        ticketId: p.ticketId,
        eventType: 'ASSIGNED',
        actorRole: 'DISPATCHER',
        actorName,
        technicianId: p.technicianId,
        technicianName: p.technicianName,
        notes: 'Affectation validée et envoyée en file Telegram.',
      });

      this.addTicketEvent({
        ticketId: p.ticketId,
        eventType: 'TELEGRAM_SENT',
        actorRole: 'SYSTEM',
        actorName: 'Bot Telegram 3GCOM',
        technicianId: p.technicianId,
        technicianName: p.technicianName,
        notes: `Ticket transmis au compte Telegram de ${p.technicianName}.`,
      });
    });
  }

  public reassignTicket(ticketId: string, technicianId: string, technicianName: string, actorName: string, reason?: string) {
    this.addTicketEvent({
      ticketId,
      eventType: 'REASSIGNED',
      actorRole: 'DISPATCHER',
      actorName,
      technicianId,
      technicianName,
      notes: reason ? `Réaffectation manuelle : ${reason}` : 'Réaffectation manuelle par l\'orienteur.',
    });
  }

  // --- Excel Import & Upsert ---
  public upsertTicket(ticketData: Omit<Ticket, 'id' | 'currentStatus' | 'isClosed' | 'createdAt' | 'updatedAt' | 'slaDeadline' | 'slaStatus' | 'slaRemainingHours'>): { ticket: Ticket; isNew: boolean } {
    const existingIndex = this.tickets.findIndex(t => t.ticketNumber === ticketData.ticketNumber);
    const sla = computeTicketSLA(ticketData.registeredAt);

    if (existingIndex >= 0) {
      const existing = this.tickets[existingIndex];
      const newVisitCount = existing.visitCount + 1;

      const updated: Ticket = {
        ...existing,
        ...ticketData,
        visitCount: newVisitCount,
        slaDeadline: sla.slaDeadline,
        slaStatus: sla.slaStatus,
        slaRemainingHours: sla.slaRemainingHours,
        updatedAt: new Date().toISOString(),
      };

      this.tickets[existingIndex] = updated;

      this.addTicketEvent({
        ticketId: existing.id,
        eventType: 'IMPORT',
        actorRole: 'SYSTEM',
        actorName: 'Import Fichier Excel (Deuxième visite)',
        notes: `Nouveau passage détecté. Visite #${newVisitCount}. Données client rafraîchies.`,
      });

      this.persist();
      this.syncDocToFirestore('tickets', updated.id, updated);
      return { ticket: updated, isNew: false };
    } else {
      const newId = `tkt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const newTicket: Ticket = {
        ...ticketData,
        id: newId,
        visitCount: 1,
        currentStatus: ticketData.technicalZoneId ? 'TO_ASSIGN' : 'ZONE_TO_MAP',
        isClosed: false,
        slaDeadline: sla.slaDeadline,
        slaStatus: sla.slaStatus,
        slaRemainingHours: sla.slaRemainingHours,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.tickets.unshift(newTicket);

      this.addTicketEvent({
        ticketId: newId,
        eventType: 'IMPORT',
        actorRole: 'SYSTEM',
        actorName: 'Import Fichier Excel',
        notes: 'Création initiale du dossier réclamation.',
      });

      this.persist();
      this.syncDocToFirestore('tickets', newTicket.id, newTicket);
      return { ticket: newTicket, isNew: true };
    }
  }

  // --- Referentiel Management (Full Edit/Delete capabilities §3) ---
  public addTechnicalZone(zone: Omit<TechnicalZone, 'id' | 'createdAt'>): TechnicalZone {
    const newZone: TechnicalZone = {
      ...zone,
      id: `tz-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.zones.push(newZone);
    this.persist();
    this.syncDocToFirestore('technicalZones', newZone.id, newZone);
    return newZone;
  }

  public updateTechnicalZone(id: string, updates: Partial<TechnicalZone>) {
    const index = this.zones.findIndex(z => z.id === id);
    if (index >= 0) {
      this.zones[index] = { ...this.zones[index], ...updates };
      this.persist();
      this.syncDocToFirestore('technicalZones', id, this.zones[index]);
    }
  }

  public deleteTechnicalZone(id: string) {
    this.zones = this.zones.filter(z => z.id !== id);
    // Remove from technician zone assignments
    this.technicians.forEach(t => {
      t.zoneIds = t.zoneIds.filter(zid => zid !== id);
    });
    this.persist();
    this.deleteDocFromFirestore('technicalZones', id);
  }

  public addZoneAlias(rawLabel: string, technicalZoneId: string): ZoneAlias {
    const existing = this.zoneAliases.find(a => a.rawLabel.trim().toUpperCase() === rawLabel.trim().toUpperCase());
    if (existing) {
      existing.technicalZoneId = technicalZoneId;
      this.persist();
      return existing;
    }
    const alias: ZoneAlias = {
      id: `za-${Date.now()}`,
      rawLabel: rawLabel.trim(),
      technicalZoneId,
    };
    this.zoneAliases.push(alias);

    // Auto-resolve any existing tickets that had this unmapped raw label
    this.tickets.forEach(ticket => {
      if (!ticket.technicalZoneId && ticket.rawZoneText.trim().toUpperCase() === alias.rawLabel.toUpperCase()) {
        ticket.technicalZoneId = technicalZoneId;
        const targetZone = this.zones.find(z => z.id === technicalZoneId);
        if (targetZone) {
          ticket.sectorId = targetZone.sectorId;
        }
        ticket.currentStatus = 'TO_ASSIGN';
        this.syncDocToFirestore('tickets', ticket.id, ticket);
      }
    });

    this.persist();
    return alias;
  }

  public addTechnician(tech: Omit<Technician, 'id' | 'createdAt' | 'normalizedName'>): Technician {
    const normalizedName = tech.fullName.trim().toLowerCase();
    const newId = `tech-${Date.now()}`;
    const token = tech.telegramActivationToken || `act_${newId.replace(/[^a-zA-Z0-9]/g, '')}_${Math.random().toString(36).substring(2, 8)}`;
    const newTech: Technician = {
      ...tech,
      id: newId,
      normalizedName,
      telegramActivationToken: token,
      telegramActivationStatus: tech.telegramChatId ? 'ACTIVATED' : 'PENDING',
      telegramLinkDisabled: false,
      createdAt: new Date().toISOString(),
    };
    this.technicians.push(newTech);
    this.persist();
    this.syncDocToFirestore('technicians', newTech.id, newTech);
    return newTech;
  }

  public updateTechnician(id: string, updates: Partial<Technician>) {
    const index = this.technicians.findIndex(t => t.id === id);
    if (index >= 0) {
      if (updates.fullName) {
        updates.normalizedName = updates.fullName.trim().toLowerCase();
      }
      this.technicians[index] = { ...this.technicians[index], ...updates };
      this.persist();
      this.syncDocToFirestore('technicians', id, this.technicians[index]);
    }
  }

  public deleteTechnician(id: string) {
    this.technicians = this.technicians.filter(t => t.id !== id);
    this.persist();
    this.deleteDocFromFirestore('technicians', id);
  }

  public mergeTechnicians(sourceId: string, targetId: string) {
    const source = this.technicians.find(t => t.id === sourceId);
    const target = this.technicians.find(t => t.id === targetId);
    if (!source || !target) return;

    const combinedZones = Array.from(new Set([...target.zoneIds, ...source.zoneIds]));
    target.zoneIds = combinedZones;

    this.tickets.forEach(t => {
      if (t.currentAssignedTechId === sourceId) {
        t.currentAssignedTechId = targetId;
      }
    });

    this.events.forEach(e => {
      if (e.technicianId === sourceId) {
        e.technicianId = targetId;
        e.technicianName = target.fullName;
      }
    });

    source.isActive = false;
    source.notes = `[Fusionné vers ${target.fullName}] ${source.notes || ''}`;
    this.persist();
  }

  public removeFakeTechnician(id: string) {
    const index = this.technicians.findIndex(t => t.id === id);
    if (index >= 0) {
      this.technicians[index].isActive = false;
      this.technicians[index].notes = '[Compte non-humain désactivé]';
      this.persist();
    }
  }

  // --- Strict Sum Check Invariant ---
  public computeSumCheck(requestingUser?: User | null): SumCheckResult {
    const tickets = this.getTickets(requestingUser);
    const totalTickets = tickets.length;

    let toAssign = 0;
    let zoneToMap = 0;
    let assigned = 0;
    let reopened = 0;
    let completed = 0;
    let litige = 0;

    const culpritTickets: { id: string; ticketNumber: string; reason: string }[] = [];

    tickets.forEach(t => {
      switch (t.currentStatus) {
        case 'TO_ASSIGN':
        case 'PROPOSED':
          toAssign++;
          break;
        case 'ZONE_TO_MAP':
          zoneToMap++;
          break;
        case 'ASSIGNED':
          assigned++;
          break;
        case 'REOPENED':
          reopened++;
          break;
        case 'COMPLETED':
          completed++;
          break;
        case 'LITIGE':
          litige++;
          break;
        default:
          culpritTickets.push({
            id: t.id,
            ticketNumber: t.ticketNumber,
            reason: `Statut inconnu : ${(t as any).currentStatus}`,
          });
      }
    });

    const sumOfCategories = toAssign + zoneToMap + assigned + reopened + completed + litige;
    const isBalanced = sumOfCategories === totalTickets;
    const discrepancy = totalTickets - sumOfCategories;

    return {
      totalTickets,
      sumOfCategories,
      isBalanced,
      discrepancy,
      breakdown: {
        toAssign,
        zoneToMap,
        assigned,
        reopened,
        completed,
        litige,
      },
      culpritTickets,
    };
  }
}

export const store = new AppStateStore();
