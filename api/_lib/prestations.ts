// NF form (config centrale) and prestation declaration by the technician, with photos.
// Photos are stored compressed in the "photos" collection, readable by the manager and the
// orienteurs of the ticket's sector only (firestore.rules).
import { randomBytes } from 'node:crypto';
import { adminDb } from './admin.js';
import { AccessError, recordSplitterReport, recordTechnicianReport } from './tickets.js';
import {
  LIMITS,
  needsDeclaration,
  normalizeSerial,
  validateConfigNf,
  validateDeclaration,
  type MaterialsInstalled,
  type PhotoKind,
  type PrestationCode,
  type PrestationDeclaration,
} from '../../src/domain/prestations.js';
import type { Technician, Ticket, TicketEvent } from '../../src/types/index.js';

// Compressed on the phone (~150 KB); Firestore documents are limited to 1 MiB.
const MAX_PHOTO_CHARS = 900_000;
const PHOTO_PREFIX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export class ValidationError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(' '));
  }
}

export interface DeclarationPayload {
  code?: string;
  raccordements?: number;
  materials?: Partial<MaterialsInstalled>;
  materialPhotos?: string[];
}

export interface NfFormPayload {
  ticketId: string;
  scope?: 'TICKET' | 'SPLITTER';
  nfType: 'STANDARD' | 'CENTRAL_CONFIG';
  ontSerialNumber?: string;
  serialPhotos?: string[];
  declaration?: DeclarationPayload; // absent = "déclarer plus tard"
}

function checkPhotos(photos: unknown): string[] {
  if (photos === undefined) return [];
  if (!Array.isArray(photos) || photos.length > LIMITS.photosPerKind) throw new ValidationError([`${LIMITS.photosPerKind} photos maximum.`]);
  for (const p of photos) {
    if (typeof p !== 'string' || p.length > MAX_PHOTO_CHARS || !PHOTO_PREFIX.test(p)) {
      throw new ValidationError(['Photo illisible ou trop lourde, reprenez-la.']);
    }
  }
  return photos as string[];
}

async function savePhotos(tech: Technician, ticket: Ticket, kind: PhotoKind, photos: string[]): Promise<string[]> {
  const db = adminDb();
  const ids: string[] = [];
  for (const dataUrl of photos) {
    const id = `ph-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection('photos').doc(id).set({
      id,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      sectorId: ticket.sectorId || null,
      technicianId: tech.id,
      technicianName: tech.fullName,
      kind,
      dataUrl,
      createdAt: new Date().toISOString(),
    });
    ids.push(id);
  }
  return ids;
}

function checkDeclaration(payload: DeclarationPayload): { code: PrestationCode; raccordements?: number; materials: MaterialsInstalled; photos: string[] } {
  const photos = checkPhotos(payload.materialPhotos);
  const materials: MaterialsInstalled = {
    joints: Number(payload.materials?.joints ?? 0),
    splitters: Number(payload.materials?.splitters ?? 0),
    cableMeters: Number(payload.materials?.cableMeters ?? 0),
  };
  const raccordements = payload.code === 'FO_01_02' ? Number(payload.raccordements) : undefined;
  const problems = validateDeclaration({ code: payload.code, raccordements, materials, materialPhotoCount: photos.length });
  if (problems.length) throw new ValidationError(problems);
  return { code: payload.code as PrestationCode, raccordements, materials, photos };
}

async function loadTicket(ticketId: string): Promise<Ticket> {
  const snap = await adminDb().collection('tickets').doc(ticketId).get();
  if (!snap.exists) throw new AccessError('Ticket introuvable.');
  return { ...(snap.data() as Ticket), id: snap.id };
}

// Declares the prestation of a ticket closed in NF by this technician.
export async function declarePrestation(tech: Technician, ticketId: string, payload: DeclarationPayload): Promise<Ticket> {
  const checked = checkDeclaration(payload);
  const ticket = await loadTicket(ticketId);
  if (ticket.currentAssignedTechId !== tech.id) throw new AccessError('Ce ticket ne vous est pas affecté.');
  if (ticket.prestationStatus === 'INCLUSE') throw new AccessError('Ce ticket est inclus dans un incident splitter déjà déclaré sur un autre ticket.');
  if (!needsDeclaration(ticket)) throw new AccessError('La prestation de ce ticket est déjà déclarée ou le ticket n\'est pas clôturé en NF.');

  const photoIds = await savePhotos(tech, ticket, 'MATERIAL', checked.photos);
  const now = new Date().toISOString();
  const prestation: PrestationDeclaration = {
    code: checked.code,
    ...(checked.raccordements ? { raccordements: checked.raccordements } : {}),
    materials: checked.materials,
    photoIds,
    declaredAt: now,
    declaredBy: tech.fullName,
    declaredByTechId: tech.id,
  };
  const event: TicketEvent = {
    id: `evt-${Date.now()}-${randomBytes(3).toString('hex')}`,
    ticketId: ticket.id,
    sectorId: ticket.sectorId || null,
    eventType: 'PRESTATION_DECLARED',
    actorRole: 'TECHNICIAN',
    actorName: tech.fullName,
    technicianId: tech.id,
    technicianName: tech.fullName,
    notes: `Prestation déclarée : ${checked.code}${checked.raccordements ? ` × ${checked.raccordements}` : ''}.`,
    createdAt: now,
  };
  const db = adminDb();
  const batch = db.batch();
  batch.update(db.collection('tickets').doc(ticket.id), { prestation, prestationStatus: 'DECLAREE', updatedAt: now });
  batch.set(db.collection('events').doc(event.id), event);
  await batch.commit();
  return { ...ticket, prestation, prestationStatus: 'DECLAREE' };
}

// NF from the form: config centrale requires the ONT serial and its photo; the prestation can be
// declared in the same submission or later. Returns the closed tickets (lead first).
export async function submitNfForm(tech: Technician, payload: NfFormPayload): Promise<Ticket[]> {
  const isConfig = payload.nfType === 'CENTRAL_CONFIG';
  const serialPhotos = checkPhotos(payload.serialPhotos);
  if (isConfig) {
    const problems = validateConfigNf(payload.ontSerialNumber, serialPhotos.length);
    if (problems.length) throw new ValidationError(problems);
  }
  // Validate the declaration before closing anything
  if (payload.declaration) checkDeclaration(payload.declaration);

  const ticket = await loadTicket(payload.ticketId);
  const serial = isConfig ? normalizeSerial(payload.ontSerialNumber!) : undefined;
  const serialPhotoIds = isConfig ? await savePhotos(tech, ticket, 'SERIAL', serialPhotos) : undefined;
  const report = { kind: 'NF' as const, nfType: payload.nfType, ontSerialNumber: serial };
  const leadExtra: Partial<Ticket> = serialPhotoIds ? { serialPhotoIds } : {};

  const closed = payload.scope === 'SPLITTER'
    ? await recordSplitterReport(tech, ticket.id, report, leadExtra)
    : [await recordTechnicianReport(tech, ticket.id, report, leadExtra)];

  // Nothing to declare on a non-billable reprise
  if (payload.declaration && closed[0].prestationStatus !== 'NON_FACTURABLE') {
    closed[0] = await declarePrestation(tech, closed[0].id, payload.declaration);
  }
  return closed;
}

// Tickets of the technician: closed in NF and waiting for a declaration / declared recently.
export async function technicianPrestations(techId: string, declaredSinceDays = 31) {
  const snap = await adminDb().collection('tickets').where('currentAssignedTechId', '==', techId).get();
  const tickets = snap.docs.map(d => ({ ...(d.data() as Ticket), id: d.id }));
  const since = Date.now() - declaredSinceDays * 86400_000;
  return {
    // Litiges accepted by the orienteur, waiting to be sent back (shown read-only)
    onHold: tickets.filter(t => t.currentStatus === 'SUSPENDED'),
    toDeclare: tickets.filter(needsDeclaration).sort((a, b) => (b.lastEventAt || '').localeCompare(a.lastEventAt || '')),
    declared: tickets
      .filter(t => t.prestationStatus === 'DECLAREE' && t.prestation && Date.parse(t.prestation.declaredAt) >= since)
      .sort((a, b) => b.prestation!.declaredAt.localeCompare(a.prestation!.declaredAt)),
  };
}
