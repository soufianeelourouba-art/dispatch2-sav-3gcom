// Technician mobile portal (no account): the secret activation token is the credential.
// Also opened inside Telegram as a Mini App ("Mon espace" menu, "Déclarer" buttons).
// GET  /api/portal?token=act_…  → technician, open tickets, tickets to declare, recent declarations
// POST /api/portal { token, action, ... }
//   action "REPORT"  (default) { ticketId, report, scope? } → quick NF / litige
//   action "NF_FORM" { ticketId, scope?, nfType, ontSerialNumber?, serialPhotos?, declaration? }
//   action "DECLARE" { ticketId, declaration }               → prestation of a closed ticket
import { json, handleError, HttpError } from './_lib/http.js';
import {
  AccessError,
  findTechnicianByToken,
  openTicketsOf,
  recordSplitterReport,
  recordTechnicianReport,
  technicianIsBlocked,
  type TechnicianReport,
} from './_lib/tickets.js';
import { declarePrestation, submitNfForm, technicianPrestations, ValidationError } from './_lib/prestations.js';
import { afterDeclaration, afterTechnicianReport } from './_lib/afterReport.js';
import { appBaseUrl } from './_lib/miniapp.js';
import { LITIGE_REASONS } from '../src/types/index.js';
import type { Ticket } from '../src/types/index.js';

async function technicianFrom(token: unknown) {
  const tech = typeof token === 'string' ? await findTechnicianByToken(token) : null;
  if (!tech) throw new HttpError(404, 'Lien invalide ou expiré');
  return tech;
}

// Fields the technician needs (no internal data)
const forTechnician = (t: Ticket, techId?: string) => ({
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
  lastLitigeReasonCode: t.lastLitigeReasonCode,
  lastLitigeReasonLabel: t.lastLitigeReasonLabel,
  lastLitigeRdvDate: t.lastLitigeRdvDate,
  lastDispatcherUpdateNotes: t.lastDispatcherUpdateNotes,
  reopenedWithNewPhone: t.reopenedWithNewPhone,
  previousClientPhone: t.previousClientPhone,
  splitterRef: t.splitterRef,
  origin: t.origin,
  manualNature: t.manualNature,
  description: t.description,
  importOutcome: t.importOutcome,
  // Reprise of his own intervention within 7 days: no prestation to declare
  nonBillable: !!techId && t.repriseOfTechId === techId,
  nfType: t.nfType,
  ontSerialNumber: t.ontSerialNumber,
  closedAt: t.isClosed ? t.lastEventAt : undefined,
  prestationStatus: t.prestationStatus,
  prestation: t.prestation
    ? { ...t.prestation, photoIds: undefined, photoCount: t.prestation.photoIds.length }
    : undefined,
});

export async function GET(request: Request): Promise<Response> {
  try {
    const tech = await technicianFrom(new URL(request.url).searchParams.get('token'));
    if (technicianIsBlocked(tech)) {
      return json({ technician: { fullName: tech.fullName }, suspended: true, tickets: [], toDeclare: [], declared: [], onHold: [] });
    }
    const [open, prestations] = await Promise.all([openTicketsOf(tech.id), technicianPrestations(tech.id)]);
    return json({
      technician: { fullName: tech.fullName },
      suspended: false,
      // Oldest claims first: the late ones are on top
      tickets: open.sort((a, b) => (a.registeredAt || '').localeCompare(b.registeredAt || '')).map(t => forTechnician(t, tech.id)),
      toDeclare: prestations.toDeclare.map(t => forTechnician(t)),
      onHold: prestations.onHold.map(t => forTechnician(t)),
      declared: prestations.declared.map(t => forTechnician(t)),
    });
  } catch (err) {
    return handleError(err);
  }
}

function parseReport(raw: any): TechnicianReport {
  const notes = typeof raw?.notes === 'string' ? raw.notes.slice(0, 1000) : undefined;
  if (raw?.kind === 'NF') {
    // Quick NF is standard only: config centrale goes through the form (serial + photo)
    return { kind: 'NF', nfType: 'STANDARD', notes };
  }
  if (raw?.kind === 'LITIGE' && LITIGE_REASONS.some(r => r.code === raw.reasonCode)) {
    // RDV: "غدا" (tomorrow, ISO date) or "تاريخ آخر" (free text in the notes, as in Telegram)
    const rdv = typeof raw.rdvDateTime === 'string' && !Number.isNaN(Date.parse(raw.rdvDateTime))
      ? new Date(raw.rdvDateTime).toISOString()
      : undefined;
    if (raw.reasonCode === 'RDV' && !rdv && !notes?.trim()) throw new HttpError(400, 'اختر « غدا » أو اكتب موعد الـ RDV.');
    if (raw.reasonCode === 'AUTRE' && !notes?.trim()) throw new HttpError(400, 'اشرح المشكل.');
    return {
      kind: 'LITIGE',
      reasonCode: raw.reasonCode,
      rdvDateTime: rdv,
      notes,
      requestNewContact: raw.reasonCode === 'CLIENT_UNREACHABLE' && raw.requestNewContact === true,
    };
  }
  throw new HttpError(400, 'تقرير غير صالح.');
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const tech = await technicianFrom(body?.token);
    if (technicianIsBlocked(tech)) throw new HttpError(403, 'الحساب موقوف.');
    if (typeof body?.ticketId !== 'string') throw new HttpError(400, 'ticketId manquant');
    try {
      let tickets: Ticket[];
      let kind: 'NF' | 'LITIGE' | 'DECLARE';
      if (body.action === 'NF_FORM') {
        kind = 'NF';
        tickets = await submitNfForm(tech, {
          ticketId: body.ticketId,
          scope: body.scope === 'SPLITTER' ? 'SPLITTER' : 'TICKET',
          nfType: body.nfType === 'CENTRAL_CONFIG' ? 'CENTRAL_CONFIG' : 'STANDARD',
          ontSerialNumber: typeof body.ontSerialNumber === 'string' ? body.ontSerialNumber.slice(0, 40) : undefined,
          serialPhotos: body.serialPhotos,
          declaration: body.declaration ?? undefined,
        });
      } else if (body.action === 'DECLARE') {
        kind = 'DECLARE';
        tickets = [await declarePrestation(tech, body.ticketId, body.declaration ?? {})];
      } else {
        const report = parseReport(body.report);
        kind = report.kind;
        // scope "SPLITTER": one report closes every open ticket of the splitter incident
        tickets = body.scope === 'SPLITTER'
          ? await recordSplitterReport(tech, body.ticketId, report)
          : [await recordTechnicianReport(tech, body.ticketId, report)];
      }
      // Keep the Telegram chat consistent (never fails the technician's action)
      await (kind === 'DECLARE'
        ? afterDeclaration(tickets[0].id)
        : afterTechnicianReport(appBaseUrl(request), tech, tickets, kind)
      ).catch(err => console.error('telegram follow-up', err));
      return json({
        ticketNumbers: tickets.map(t => t.ticketNumber),
        leadTicketId: tickets[0].id,
        status: tickets[0].currentStatus,
        prestationStatus: tickets[0].prestationStatus,
      });
    } catch (err) {
      if (err instanceof ValidationError) throw new HttpError(400, err.message);
      if (err instanceof AccessError) throw new HttpError(409, err.message);
      throw err;
    }
  } catch (err) {
    return handleError(err);
  }
}
