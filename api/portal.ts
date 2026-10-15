// Technician mobile portal (no account): the secret activation token is the credential.
// GET  /api/portal?token=act_…  → technician name + open tickets assigned to them
// POST /api/portal { token, ticketId, report } → records an NF or a litige
import { json, handleError, HttpError } from './_lib/http.js';
import {
  AccessError,
  findTechnicianByToken,
  openTicketsOf,
  recordTechnicianReport,
  technicianIsBlocked,
  type TechnicianReport,
} from './_lib/tickets.js';
import { LITIGE_REASONS } from '../src/types/index.js';

async function technicianFrom(token: unknown) {
  const tech = typeof token === 'string' ? await findTechnicianByToken(token) : null;
  if (!tech) throw new HttpError(404, 'Lien invalide ou expiré');
  return tech;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const tech = await technicianFrom(new URL(request.url).searchParams.get('token'));
    if (technicianIsBlocked(tech)) return json({ technician: { fullName: tech.fullName }, suspended: true, tickets: [] });

    const tickets = (await openTicketsOf(tech.id)).map(t => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      clientName: t.clientName,
      clientNumber: t.clientNumber,
      clientPhone: t.clientPhone,
      clientAddress: t.clientAddress,
      rawZoneText: t.rawZoneText,
      registeredAt: t.registeredAt,
      visitCount: t.visitCount,
      currentStatus: t.currentStatus,
      lastLitigeReasonLabel: t.lastLitigeReasonLabel,
      lastDispatcherUpdateNotes: t.lastDispatcherUpdateNotes,
    }));
    return json({ technician: { fullName: tech.fullName }, suspended: false, tickets });
  } catch (err) {
    return handleError(err);
  }
}

function parseReport(raw: any): TechnicianReport {
  const notes = typeof raw?.notes === 'string' ? raw.notes.slice(0, 1000) : undefined;
  if (raw?.kind === 'NF') {
    return {
      kind: 'NF',
      nfType: raw.nfType === 'CENTRAL_CONFIG' ? 'CENTRAL_CONFIG' : 'STANDARD',
      ontSerialNumber: typeof raw.ontSerialNumber === 'string' ? raw.ontSerialNumber.slice(0, 40) : undefined,
      cableLengthMeters: Number.isFinite(raw.cableLengthMeters) ? Number(raw.cableLengthMeters) : undefined,
      notes,
    };
  }
  if (raw?.kind === 'LITIGE' && LITIGE_REASONS.some(r => r.code === raw.reasonCode)) {
    return {
      kind: 'LITIGE',
      reasonCode: raw.reasonCode,
      rdvDateTime: typeof raw.rdvDateTime === 'string' ? raw.rdvDateTime.slice(0, 60) : undefined,
      notes,
    };
  }
  throw new HttpError(400, 'Compte-rendu invalide');
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const tech = await technicianFrom(body?.token);
    if (technicianIsBlocked(tech)) throw new HttpError(403, 'Accès suspendu');
    if (typeof body?.ticketId !== 'string') throw new HttpError(400, 'ticketId manquant');
    try {
      const ticket = await recordTechnicianReport(tech, body.ticketId, parseReport(body.report));
      return json({ ticketNumber: ticket.ticketNumber, status: ticket.currentStatus });
    } catch (err) {
      if (err instanceof AccessError) throw new HttpError(409, err.message);
      throw err;
    }
  } catch (err) {
    return handleError(err);
  }
}
