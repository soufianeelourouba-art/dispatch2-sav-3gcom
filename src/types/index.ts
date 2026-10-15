export type Role = 'DISPATCHER' | 'MANAGER';

// 1. Direction Centrale / Délégation Régionale (DC)
export interface DC {
  id: string;
  code: string;
  name: string;
  description?: string;
  createdAt: string;
}

// 2. Compte Utilisateur (Orienteur ou Manager)
export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  sectorId?: string; // Secteur principal ou actif
  sectorIds?: string[]; // Liste de secteurs gérés par le même orienteur (1 orienteur peut gérer plusieurs secteurs)
  activeSectorId?: string; // Secteur actuellement sélectionné dans l'interface
  password?: string; // Mot de passe du compte
  email?: string;
  createdAt?: string;
}

// 3. Secteur Géographique (Appartient à une DC)
export interface Sector {
  id: string;
  dcId: string; // Appartient à une DC
  dcName?: string;
  code: string;
  name: string;
  dispatcherId?: string; // Orienteur principal affecté au secteur
  dispatcherIds?: string[]; // Liste des orienteurs affectés à ce secteur
  dispatcherName?: string;
  createdAt: string;
}

// 4. Zone d'Intervention Technique (Appartient à un Secteur)
export interface TechnicalZone {
  id: string;
  sectorId: string; // Appartient à un secteur
  dcId?: string; // DC parente
  msanCode: string;
  label: string;
  description?: string;
  createdAt: string;
}

export interface ZoneAlias {
  id: string;
  rawLabel: string;
  technicalZoneId: string;
}

export type TelegramActivationStatus = 'PENDING' | 'ACTIVATED' | 'REVOKED';

// 5. Technicien (Affecté à un secteur et à une ou plusieurs Zones d'intervention)
export interface Technician {
  id: string;
  sectorId: string; // Secteur d'appartenance (intra-secteur)
  sectorIds?: string[]; // Secteurs secondaires éventuels
  fullName: string;
  normalizedName: string;
  phone: string;
  telegramChatId?: string;
  telegramUsername?: string;
  telegramActivationToken?: string;
  telegramActivationStatus?: TelegramActivationStatus;
  telegramActivatedAt?: string;
  telegramLinkDisabled?: boolean;
  zoneIds: string[]; // Liste des IDs de Zones d'intervention couvertes (multi-zones)
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

export type TicketStatus = 
  | 'ZONE_TO_MAP'        // Zone technique inconnue dans le référentiel
  | 'TO_ASSIGN'          // En attente d'affectation manuelle (aucun technicien disponible ou auto-dispatch non validé)
  | 'PROPOSED'           // Dispatch proposé, en attente de validation orienteur
  | 'ASSIGNED'           // Validé par l'orienteur, transmis au technicien sur Telegram
  | 'COMPLETED'          // NF : Normalisé / Terminé avec succès (Fibre rétablie)
  | 'LITIGE'             // Litige / LC déclaré par le technicien sur le terrain
  | 'REOPENED';          // Litige renvoyé au technicien avec informations mises à jour

// Motifs de Litige terrain (§2)
export type LitigeReasonCode = 
  | 'CLIENT_UNREACHABLE' // Client injoignable
  | 'RDV'                // RDV (avec date et heure)
  | 'GC'                 // GC (Génie civil : fourreau bouché, chambre inaccessible)
  | 'AUTRE';             // Autre motif

export interface LitigeDef {
  code: LitigeReasonCode;
  label: string;
  description: string;
  category: 'EXTERNAL' | 'TECHNICAL';
}

export const LITIGE_REASONS: LitigeDef[] = [
  {
    code: 'CLIENT_UNREACHABLE',
    label: 'Client injoignable',
    description: 'Plusieurs appels sans réponse lors de la prise de contact ou devant le domicile.',
    category: 'EXTERNAL',
  },
  {
    code: 'RDV',
    label: 'Rendez-vous convenu (RDV)',
    description: 'Le client demande un passage différé à une date/heure précise.',
    category: 'EXTERNAL',
  },
  {
    code: 'GC',
    label: 'Génie Civil (GC)',
    description: 'Fourreau bouché, chambre telecom inaccessible, problème d\'infrastructure extérieure.',
    category: 'TECHNICAL',
  },
  {
    code: 'AUTRE',
    label: 'Autre motif',
    description: 'Refus client, problème syndic, incident imprévu sur site.',
    category: 'EXTERNAL',
  },
];

// Compatibility alias
export const FAILURE_REASONS = LITIGE_REASONS;

export type EventType = 
  | 'IMPORT'
  | 'PROPOSED'
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'TELEGRAM_SENT'
  | 'NF_SUBMITTED'
  | 'LITIGE_REPORTED'
  | 'LITIGE_REOPENED'
  | 'LITIGE_VALIDATED';

export interface TicketEvent {
  id: string;
  ticketId: string;
  eventType: EventType;
  actorRole: 'SYSTEM' | 'DISPATCHER' | 'MANAGER' | 'TECHNICIAN';
  actorName: string;
  technicianId?: string;
  technicianName?: string;
  
  // NF Details
  nfType?: 'STANDARD' | 'CENTRAL_CONFIG';
  ontSerialNumber?: string;
  cableLengthMeters?: number;

  // Litige Details
  litigeReasonCode?: LitigeReasonCode;
  litigeReasonLabel?: string;
  rdvDateTime?: string;
  failureCategory?: 'EXTERNAL' | 'TECHNICAL';
  failureReasonCode?: string;
  failureReasonLabel?: string;
  
  // Orienteur update on Litige Reopen
  dispatcherUpdateNotes?: string;
  newClientPhone?: string;

  notes?: string;
  photoUrl?: string;
  createdAt: string; // ISO UTC format
}

export type SLAStatus = 'ON_TIME' | 'WARNING' | 'EXPIRED';

export interface Ticket {
  id: string;
  ticketNumber: string;
  clientNumber: string;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  rawZoneText: string;
  technicalZoneId?: string;
  sectorId?: string;
  registeredAt: string; // ISO UTC format
  visitCount: number;
  currentAssignedTechId?: string;
  currentStatus: TicketStatus;
  isClosed: boolean;

  // SLA calculations (24h rule)
  slaDeadline: string; // ISO UTC (registeredAt + 24 hours)
  slaStatus: SLAStatus;
  slaRemainingHours: number; // positive = hours remaining, negative = hours overdue

  // Dispatch proposal
  proposedTechId?: string;
  proposalRationale?: string;
  
  // NF Data
  nfType?: 'STANDARD' | 'CENTRAL_CONFIG';
  ontSerialNumber?: string;
  cableLengthMeters?: number;

  // Litige Data
  lastLitigeReasonCode?: LitigeReasonCode;
  lastLitigeReasonLabel?: string;
  lastLitigeRdvDate?: string;
  lastFailureCategory?: 'EXTERNAL' | 'TECHNICAL';
  lastFailureReasonLabel?: string;
  lastVisitedTechName?: string;
  lastVisitedAt?: string;
  lastEventAt?: string;

  // Reopen update by dispatcher
  lastDispatcherUpdateNotes?: string;
  reopenedWithNewPhone?: string;

  createdAt: string;
  updatedAt: string;
}

export interface DispatchProposal {
  ticketId: string;
  technicianId: string | null;
  technicianName: string | null;
  rationale: string;
  isSecondVisit: boolean;
  priorityScore: number;
}

export interface RejectedRow {
  rowNumber: number;
  data: Record<string, any>;
  reason: string;
}

export interface ImportReport {
  totalRowsProcessed: number;
  importedCount: number;
  updatedVisitsCount: number;
  rejectedCount: number;
  unmappedZoneCount: number;
  rejectedRows: RejectedRow[];
  timestamp: string;
}

export interface SumCheckResult {
  totalTickets: number;
  sumOfCategories: number;
  isBalanced: boolean;
  discrepancy: number;
  breakdown: {
    toAssign: number;
    zoneToMap: number;
    assigned: number;
    reopened: number;
    completed: number;
    litige: number;
  };
  culpritTickets: { id: string; ticketNumber: string; reason: string }[];
}
