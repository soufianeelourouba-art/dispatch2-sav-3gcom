import type { PrestationDeclaration, PrestationStatus } from '../domain/prestations.js';
import type { ImportOutcome } from '../domain/importRules.js';

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
// Document Firestore users/{uid} : id = UID Firebase Auth. Le mot de passe n'est jamais stocké ici.
export interface User {
  id: string;
  username: string; // = email de connexion
  name: string;
  role: Role;
  sectorId?: string; // Secteur principal ou actif
  sectorIds?: string[]; // Liste de secteurs gérés par le même orienteur (source de vérité des règles Firestore)
  activeSectorId?: string; // Secteur actuellement sélectionné dans l'interface
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
  | 'SUSPENDED'          // Motif du litige validé par l'orienteur (RDV, GC…) : en attente de relance
  | 'REOPENED';          // Litige renvoyé au technicien avec informations mises à jour

// Motifs de Litige terrain (§2)
export type LitigeReasonCode = 
  | 'CLIENT_UNREACHABLE' // Client injoignable
  | 'RDV'                // RDV (avec date et heure)
  | 'GC'                 // GC (Génie civil : fourreau bouché, chambre inaccessible)
  | 'AUTRE'              // Autre motif
  | 'HORS_ZONE';         // Ticket hors de la zone du technicien (mauvaise affectation)

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
  {
    code: 'HORS_ZONE',
    label: '📍 Hors de ma zone',
    description: 'Le ticket n\'est pas dans la zone du technicien : l\'orienteur doit le réaffecter.',
    category: 'EXTERNAL',
  },
];

// Compatibility alias
export const FAILURE_REASONS = LITIGE_REASONS;

// Ticket created in the app by an orienteur for an incident without an operator ticket
// (kept for follow-up and billing).
export type ManualTicketNature = 'URGENT_SPLITTER' | 'URGENT_CLIENT' | 'FIABILISATION' | 'AUTRE';

export const MANUAL_TICKET_NATURES: { code: ManualTicketNature; label: string; description: string }[] = [
  { code: 'URGENT_SPLITTER', label: 'Incident splitter urgent', description: 'Splitter en panne touchant plusieurs clients, sans ticket opérateur.' },
  { code: 'URGENT_CLIENT', label: 'Client urgent', description: 'Intervention urgente demandée pour un client (entreprise, VIP…).' },
  { code: 'FIABILISATION', label: 'Fiabilisation', description: 'Remise en état préventive du réseau (boîtier, câblage, étiquetage…).' },
  { code: 'AUTRE', label: 'Autre intervention', description: 'Toute autre intervention hors ticket à suivre et facturer.' },
];

export type EventType =
  | 'IMPORT'
  | 'MANUAL_CREATED'
  | 'PRESTATION_DECLARED'
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
  sectorId?: string | null; // Copie du secteur du ticket, pour le cloisonnement Firestore
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
  // Client unreachable: the technician asks the orienteur for another number
  requestNewContact?: boolean;
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
  lastLitigeNotes?: string; // technician's comment on the last litige
  lastLitigeNeedsContact?: boolean; // waiting for a new client number from the orienteur
  lastFailureCategory?: 'EXTERNAL' | 'TECHNICAL';
  lastFailureReasonLabel?: string;
  lastVisitedTechName?: string;
  lastVisitedAt?: string;
  lastEventAt?: string;

  // Reopen update by dispatcher
  lastDispatcherUpdateNotes?: string;
  reopenedWithNewPhone?: string;

  // Splitter shared by several clients: tickets of the same splitter (and sector) are one
  // collective incident, handled by one technician and closed together.
  splitterRef?: string;

  // Prestation declared by the technician after the NF (paid work, see domain/prestations.ts)
  prestationStatus?: PrestationStatus;
  prestation?: PrestationDeclaration;
  // Import of a ticket already known (domain/importRules.ts)
  importOutcome?: ImportOutcome;
  preferredTechId?: string;   // technician to send it back to (reprise, retour client)
  repriseOfTechId?: string;   // reprise: NF by this technician is not billable
  completedAt?: string;       // date of the last NF
  previousPrestations?: PrestationDeclaration[]; // declarations of earlier interventions

  // Splitter incident closed collectively: ticket carrying the single declaration
  collectiveLeadTicketId?: string;
  // NF config centrale: photos of the ONT serial label (collection "photos")
  serialPhotoIds?: string[];

  // Origin: imported operator ticket (default) or created in the app (hors ticket, billable)
  origin?: 'IMPORT' | 'MANUAL';
  manualNature?: ManualTicketNature;
  description?: string;
  createdByName?: string;

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
  // How each valid row was handled (new, unchanged, reprise, new claim, retour client)
  outcomes: Record<ImportOutcome, number>;
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
    suspended: number;
  };
  culpritTickets: { id: string; ticketNumber: string; reason: string }[];
}
