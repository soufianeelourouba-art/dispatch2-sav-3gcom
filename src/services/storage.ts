import {
  DC,
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
import { db, auth, createAuthAccount } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  deleteDoc,
  query,
  where,
  writeBatch,
  Query,
  Unsubscribe,
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';

// Firestore `in` / `array-contains-any` filters accept at most 30 values.
const FIRESTORE_IN_LIMIT = 30;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Ticket document id derived from the ticket number, so the same ticket imported
// twice (even by two orienteurs) always lands on the same Firestore document.
export function ticketDocId(ticketNumber: string): string {
  return `tkt-${ticketNumber.trim().replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

// Firestore rejects `undefined` field values.
function clean<T extends object>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T;
}

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

// Technicians are queried by `sectorIds`, so it must always contain the primary sector.
function withPrimarySector(sectorId: string, sectorIds?: string[]): string[] {
  return Array.from(new Set([sectorId, ...(sectorIds || [])].filter(Boolean)));
}

export type AuthStatus = 'LOADING' | 'SIGNED_OUT' | 'NO_PROFILE' | 'SIGNED_IN';

class AppStateStore {
  private dcs: DC[] = [];
  private users: User[] = [];
  private currentUser: User | null = null;
  private sectors: Sector[] = [];
  private zones: TechnicalZone[] = [];
  private zoneAliases: ZoneAlias[] = [];
  private technicians: Technician[] = [];
  private tickets: Ticket[] = [];
  private events: TicketEvent[] = [];
  private telegramBotUsername: string = '';
  private listeners: Set<() => void> = new Set();
  private authStatus: AuthStatus = 'LOADING';
  private dataUnsubscribers: Unsubscribe[] = [];
  private profileUnsubscriber: Unsubscribe | null = null;
  private scopeKey: string = '';

  constructor() {
    onAuthStateChanged(auth, firebaseUser => {
      this.profileUnsubscriber?.();
      this.profileUnsubscriber = null;

      if (!firebaseUser) {
        this.stopDataSync();
        this.currentUser = null;
        this.authStatus = 'SIGNED_OUT';
        this.notify();
        return;
      }

      this.authStatus = 'LOADING';
      this.notify();

      // The profile document (role + sectors) drives both the UI and the Firestore rules.
      this.profileUnsubscriber = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        snap => {
          if (!snap.exists()) {
            this.stopDataSync();
            this.currentUser = null;
            this.authStatus = 'NO_PROFILE';
            this.notify();
            return;
          }
          const profile = { ...(snap.data() as User), id: snap.id };
          const previousActive = this.currentUser?.activeSectorId;
          this.currentUser = { ...profile, activeSectorId: previousActive };
          this.authStatus = 'SIGNED_IN';
          this.startDataSync(profile);
          this.notify();
        },
        err => {
          console.warn('Profil utilisateur illisible :', err.message);
          this.stopDataSync();
          this.currentUser = null;
          this.authStatus = 'NO_PROFILE';
          this.notify();
        }
      );
    });
  }

  // --- Real-time Cloud Firestore Synchronization ---
  // Firestore is the single source of truth: each listener replaces the local list,
  // so deleted documents can never be resurrected by a stale cache.
  private listen<T>(q: Query, apply: (items: T[]) => void, label: string) {
    const unsub = onSnapshot(
      q,
      snapshot => {
        apply(snapshot.docs.map(d => ({ ...(d.data() as T), id: d.id })));
        this.notify();
      },
      err => console.warn(`Synchronisation ${label} :`, err.message)
    );
    this.dataUnsubscribers.push(unsub);
  }

  // Merges the results of several chunked queries (Firestore `in` limit) into one list.
  private listenChunked<T extends { id: string }>(
    queries: Query[],
    apply: (items: T[]) => void,
    label: string
  ) {
    const parts: T[][] = queries.map(() => []);
    queries.forEach((q, i) => {
      this.listen<T>(q, items => {
        parts[i] = items;
        const byId = new Map<string, T>();
        parts.flat().forEach(item => byId.set(item.id, item));
        apply(Array.from(byId.values()));
      }, label);
    });
    if (queries.length === 0) apply([]);
  }

  private startDataSync(profile: User) {
    const allowed = profile.role === 'MANAGER' ? [] : (profile.sectorIds || []);
    const key = `${profile.id}|${profile.role}|${[...allowed].sort().join(',')}`;
    if (key === this.scopeKey) return;
    this.stopDataSync();
    this.scopeKey = key;

    // Shared referential, readable by every signed-in account
    this.listen<DC>(collection(db, 'dcs'), items => (this.dcs = items), 'DC');
    this.listen<Sector>(collection(db, 'sectors'), items => (this.sectors = items), 'secteurs');
    this.listen<TechnicalZone>(collection(db, 'technicalZones'), items => (this.zones = items), 'zones');
    this.listen<ZoneAlias>(collection(db, 'zoneAliases'), items => (this.zoneAliases = items), 'alias');
    this.listen<any>(collection(db, 'settings'), items => {
      this.telegramBotUsername = items.find(s => s.id === 'telegram_info')?.username || '';
    }, 'paramètres');

    const withSla = (items: Ticket[]) =>
      items.map(t => ({ ...t, ...computeTicketSLA(t.registeredAt) }));

    if (profile.role === 'MANAGER') {
      this.listen<User>(collection(db, 'users'), items => (this.users = items), 'comptes');
      this.listen<Technician>(collection(db, 'technicians'), items => (this.technicians = items), 'techniciens');
      this.listen<Ticket>(collection(db, 'tickets'), items => (this.tickets = withSla(items)), 'tickets');
      this.listen<TicketEvent>(collection(db, 'events'), items => (this.events = items), 'événements');
      return;
    }

    // Orienteur: only the documents of the assigned sectors (enforced again by firestore.rules)
    this.users = [profile];
    const sectorChunks = chunk(allowed, FIRESTORE_IN_LIMIT);
    this.listenChunked<Technician>(
      sectorChunks.map(ids => query(collection(db, 'technicians'), where('sectorIds', 'array-contains-any', ids))),
      items => (this.technicians = items),
      'techniciens'
    );
    this.listenChunked<Ticket>(
      sectorChunks.map(ids => query(collection(db, 'tickets'), where('sectorId', 'in', ids))),
      items => (this.tickets = withSla(items)),
      'tickets'
    );
    this.listenChunked<TicketEvent>(
      sectorChunks.map(ids => query(collection(db, 'events'), where('sectorId', 'in', ids))),
      items => (this.events = items),
      'événements'
    );
  }

  private stopDataSync() {
    this.dataUnsubscribers.forEach(unsub => unsub());
    this.dataUnsubscribers = [];
    this.scopeKey = '';
    this.dcs = [];
    this.users = [];
    this.sectors = [];
    this.zones = [];
    this.zoneAliases = [];
    this.technicians = [];
    this.tickets = [];
    this.events = [];
    this.telegramBotUsername = '';
  }

  public syncDocToFirestore(collectionName: string, docId: string, data: any) {
    setDoc(doc(db, collectionName, docId), clean(data), { merge: true }).catch(err => {
      console.warn(`Enregistrement refusé ${collectionName}/${docId} :`, err?.message);
    });
  }

  public deleteDocFromFirestore(collectionName: string, docId: string) {
    deleteDoc(doc(db, collectionName, docId)).catch(err => {
      console.warn(`Suppression refusée ${collectionName}/${docId} :`, err?.message);
    });
  }

  // Local lists are updated optimistically; the Firestore listeners then confirm them.
  private persist() {
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  // --- Session & Authentication (Firebase Auth) ---
  public getAuthStatus(): AuthStatus {
    return this.authStatus;
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  // Only UI preferences (e.g. active sector) — the stored profile is managed by managers.
  public setCurrentUser(user: User | null) {
    this.currentUser = user;
    this.notify();
  }

  public async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      return { success: true };
    } catch (err: any) {
      const code: string = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        return { success: false, error: 'E-mail ou mot de passe incorrect.' };
      }
      if (code === 'auth/too-many-requests') {
        return { success: false, error: 'Trop de tentatives. Réessayez dans quelques minutes.' };
      }
      if (code === 'auth/network-request-failed') {
        return { success: false, error: 'Connexion Internet indisponible.' };
      }
      return { success: false, error: err?.message || 'Connexion impossible.' };
    }
  }

  public async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Envoi impossible.' };
    }
  }

  public logout() {
    signOut(auth).catch(err => console.warn('Déconnexion :', err?.message));
  }

  public getAllUsers(): User[] {
    return this.users;
  }

  // Creates the Firebase Auth account, then its profile document (role + sectors).
  public async addUser(
    userData: { name: string; email: string; password: string; role: User['role']; sectorIds?: string[] }
  ): Promise<User> {
    const email = userData.email.trim().toLowerCase();
    const uid = await createAuthAccount(email, userData.password);
    const sectorIds = userData.role === 'DISPATCHER' ? (userData.sectorIds || []) : [];
    const newUser: User = {
      id: uid,
      username: email,
      email,
      name: userData.name.trim(),
      role: userData.role,
      sectorId: sectorIds[0],
      sectorIds,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'users', uid), clean(newUser));
    return newUser;
  }

  public updateUser(userId: string, data: Partial<User>) {
    const index = this.users.findIndex(u => u.id === userId);
    if (index >= 0) {
      const { activeSectorId, ...stored } = { ...this.users[index], ...data };
      this.users[index] = { ...this.users[index], ...data };
      this.persist();
      this.syncDocToFirestore('users', userId, stored);
    }
  }

  // Removing the profile revokes all data access immediately (rules require a profile).
  public deleteUser(userId: string) {
    this.users = this.users.filter(u => u.id !== userId);
    this.persist();
    this.deleteDocFromFirestore('users', userId);
  }

  // --- Multi-Sector & DC Scoping Engine ---
  public getAllowedSectorIds(user?: User | null): string[] {
    const target = user !== undefined ? user : this.currentUser;
    if (!target) return [];
    if (target.role === 'MANAGER') {
      return this.sectors.map(s => s.id);
    }
    const ids = new Set<string>(target.sectorIds || []);
    if (target.sectorId) {
      ids.add(target.sectorId);
    }
    return Array.from(ids);
  }

  public canUserManageTechnician(user: User | null, technician: Technician): boolean {
    if (!user) return false;
    if (user.role === 'MANAGER') return true;
    if (user.role === 'DISPATCHER') {
      const allowed = this.getAllowedSectorIds(user);
      return allowed.includes(technician.sectorId);
    }
    return false;
  }

  // --- Strict Sector Partition Enforcement ---
  public getTickets(requestingUser?: User | null, sectorIdFilter?: string): Ticket[] {
    const user = requestingUser !== undefined ? requestingUser : this.currentUser;
    const enriched = this.tickets.map(t => ({ ...t, ...computeTicketSLA(t.registeredAt) }));

    if (sectorIdFilter && sectorIdFilter !== 'ALL') {
      return enriched.filter(t => t.sectorId === sectorIdFilter);
    }

    if (user && user.role === 'DISPATCHER') {
      const allowed = this.getAllowedSectorIds(user);
      return enriched.filter(t => t.sectorId && allowed.includes(t.sectorId));
    }
    return enriched;
  }

  // Manager only (enforced by firestore.rules).
  public clearAllTickets() {
    const refs = [
      ...this.tickets.map(t => doc(db, 'tickets', t.id)),
      ...this.events.map(e => doc(db, 'events', e.id)),
    ];
    this.tickets = [];
    this.events = [];
    this.persist();
    chunk(refs, 450).forEach(part => {
      const batch = writeBatch(db);
      part.forEach(ref => batch.delete(ref));
      batch.commit().catch(err => console.warn('Purge des tickets refusée :', err?.message));
    });
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

  // --- DC Management ---
  public getDCs(): DC[] {
    return [...this.dcs];
  }

  public addDC(dc: Omit<DC, 'id' | 'createdAt'>): DC {
    const newDc: DC = {
      ...dc,
      id: `dc-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.dcs.push(newDc);
    this.persist();
    this.syncDocToFirestore('dcs', newDc.id, newDc);
    return newDc;
  }

  public updateDC(id: string, updates: Partial<DC>) {
    const index = this.dcs.findIndex(d => d.id === id);
    if (index >= 0) {
      this.dcs[index] = { ...this.dcs[index], ...updates };
      this.persist();
      this.syncDocToFirestore('dcs', id, this.dcs[index]);
    }
  }

  public deleteDC(id: string) {
    this.dcs = this.dcs.filter(d => d.id !== id);
    this.persist();
    this.deleteDocFromFirestore('dcs', id);
  }

  // --- Sector Management ---
  public getSectors(requestingUser?: User | null): Sector[] {
    const user = requestingUser !== undefined ? requestingUser : this.currentUser;
    if (user && user.role === 'DISPATCHER') {
      const allowed = this.getAllowedSectorIds(user);
      return this.sectors.filter(s => allowed.includes(s.id));
    }
    return [...this.sectors];
  }

  public addSector(sector: Omit<Sector, 'id' | 'createdAt'>): Sector {
    const newSector: Sector = {
      ...sector,
      id: `sec-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.sectors.push(newSector);
    this.persist();
    this.syncDocToFirestore('sectors', newSector.id, newSector);
    return newSector;
  }

  public updateSector(id: string, updates: Partial<Sector>) {
    const index = this.sectors.findIndex(s => s.id === id);
    if (index >= 0) {
      this.sectors[index] = { ...this.sectors[index], ...updates };
      this.persist();
      this.syncDocToFirestore('sectors', id, this.sectors[index]);
    }
  }

  public deleteSector(id: string) {
    this.sectors = this.sectors.filter(s => s.id !== id);
    this.persist();
    this.deleteDocFromFirestore('sectors', id);
  }

  // --- Technical Zones & Technicians Scoping ---
  public getTechnicalZones(requestingUser?: User | null, sectorIdFilter?: string): TechnicalZone[] {
    if (sectorIdFilter && sectorIdFilter !== 'ALL') {
      return this.zones.filter(z => z.sectorId === sectorIdFilter);
    }
    const user = requestingUser !== undefined ? requestingUser : this.currentUser;
    if (user && user.role === 'DISPATCHER') {
      const allowed = this.getAllowedSectorIds(user);
      return this.zones.filter(z => allowed.includes(z.sectorId));
    }
    return [...this.zones];
  }

  public getZoneAliases(): ZoneAlias[] {
    return [...this.zoneAliases];
  }

  public getTechnicians(requestingUser?: User | null, sectorIdFilter?: string): Technician[] {
    if (sectorIdFilter && sectorIdFilter !== 'ALL') {
      return this.technicians.filter(t => t.sectorId === sectorIdFilter || (t.sectorIds && t.sectorIds.includes(sectorIdFilter)));
    }
    const user = requestingUser !== undefined ? requestingUser : this.currentUser;
    if (user && user.role === 'DISPATCHER') {
      const allowed = this.getAllowedSectorIds(user);
      return this.technicians.filter(t => allowed.includes(t.sectorId) || (t.sectorIds && t.sectorIds.some(sid => allowed.includes(sid))));
    }
    return [...this.technicians];
  }

  // The bot token is a server-side secret (Vercel environment variable) and is never
  // sent to browsers. Only the public bot username is shared through Firestore.
  public getTelegramBotUsername(): string {
    return this.telegramBotUsername;
  }

  public setTelegramBotUsername(username: string) {
    this.telegramBotUsername = username;
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
      sectorId: ticket.sectorId || null,
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

  // --- Technician Field Operations (NF & Litige) ---
  public submitNF(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    nfType?: 'STANDARD' | 'CENTRAL_CONFIG';
    ontSerialNumber?: string;
    cableLengthMeters?: number;
    notes?: string;
  }) {
    return this.addTicketEvent({
      ticketId: params.ticketId,
      eventType: 'NF_SUBMITTED',
      actorRole: 'TECHNICIAN',
      actorName: params.technicianName,
      technicianId: params.technicianId,
      technicianName: params.technicianName,
      nfType: params.nfType || 'STANDARD',
      ontSerialNumber: params.ontSerialNumber,
      cableLengthMeters: params.cableLengthMeters,
      notes: params.notes,
    });
  }

  public reportLitige(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    reasonCode: LitigeReasonCode;
    notes?: string;
    rdvDateTime?: string;
  }) {
    const reasonDef = LITIGE_REASONS.find(r => r.code === params.reasonCode);
    return this.addTicketEvent({
      ticketId: params.ticketId,
      eventType: 'LITIGE_REPORTED',
      actorRole: 'TECHNICIAN',
      actorName: params.technicianName,
      technicianId: params.technicianId,
      technicianName: params.technicianName,
      litigeReasonCode: params.reasonCode,
      litigeReasonLabel: reasonDef?.label || params.reasonCode,
      rdvDateTime: params.rdvDateTime,
      notes: params.notes,
    });
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
      const newId = ticketDocId(ticketData.ticketNumber);
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
      if (t.zoneIds.includes(id)) {
        t.zoneIds = t.zoneIds.filter(zid => zid !== id);
        this.syncDocToFirestore('technicians', t.id, { zoneIds: t.zoneIds });
      }
    });
    this.persist();
    this.deleteDocFromFirestore('technicalZones', id);
  }

  public addZoneAlias(rawLabel: string, technicalZoneId: string): ZoneAlias {
    const existing = this.zoneAliases.find(a => a.rawLabel.trim().toUpperCase() === rawLabel.trim().toUpperCase());
    if (existing) {
      existing.technicalZoneId = technicalZoneId;
      this.persist();
      this.syncDocToFirestore('zoneAliases', existing.id, existing);
      return existing;
    }
    const alias: ZoneAlias = {
      id: `za-${Date.now()}`,
      rawLabel: rawLabel.trim(),
      technicalZoneId,
    };
    this.zoneAliases.push(alias);
    this.syncDocToFirestore('zoneAliases', alias.id, alias);

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
      sectorIds: withPrimarySector(tech.sectorId, tech.sectorIds),
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
      const merged = { ...this.technicians[index], ...updates };
      merged.sectorIds = withPrimarySector(merged.sectorId, merged.sectorIds);
      this.technicians[index] = merged;
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
        this.syncDocToFirestore('tickets', t.id, { currentAssignedTechId: targetId });
      }
    });

    this.events.forEach(e => {
      if (e.technicianId === sourceId) {
        e.technicianId = targetId;
        e.technicianName = target.fullName;
        this.syncDocToFirestore('events', e.id, { technicianId: targetId, technicianName: target.fullName });
      }
    });

    source.isActive = false;
    source.notes = `[Fusionné vers ${target.fullName}] ${source.notes || ''}`;
    this.persist();
    this.syncDocToFirestore('technicians', target.id, { zoneIds: target.zoneIds });
    this.syncDocToFirestore('technicians', source.id, { isActive: false, notes: source.notes });
  }

  public removeFakeTechnician(id: string) {
    const index = this.technicians.findIndex(t => t.id === id);
    if (index >= 0) {
      this.technicians[index].isActive = false;
      this.technicians[index].notes = '[Compte non-humain désactivé]';
      this.persist();
      this.syncDocToFirestore('technicians', id, { isActive: false, notes: this.technicians[index].notes });
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
