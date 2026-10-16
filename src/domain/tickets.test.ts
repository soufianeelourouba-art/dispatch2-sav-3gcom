import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeTicketSLA,
  reduceTicketStatus,
  applyEventToTicket,
  computeSumCheck,
  formatTicketMessage,
  formatRelanceMessage,
} from './tickets';
import type { Ticket, TicketEvent, EventType, TicketStatus } from '../types';

const NOW = new Date('2026-10-15T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

afterEach(() => vi.useRealTimers());

const ticket = (extra: Partial<Ticket> = {}): Ticket => ({
  id: 'tkt-1',
  ticketNumber: 'REC-1',
  clientNumber: 'C',
  clientName: 'Client',
  clientPhone: '0600000000',
  clientAddress: 'Adresse',
  rawZoneText: 'MSAN',
  technicalZoneId: 'z1',
  sectorId: 'sec-casa',
  registeredAt: hoursAgo(1),
  visitCount: 1,
  currentStatus: 'TO_ASSIGN',
  isClosed: false,
  slaDeadline: '',
  slaStatus: 'ON_TIME',
  slaRemainingHours: 0,
  createdAt: '',
  updatedAt: '',
  ...extra,
});

let seq = 0;
const event = (eventType: EventType, extra: Partial<TicketEvent> = {}): TicketEvent => ({
  id: `evt-${++seq}`,
  ticketId: 'tkt-1',
  eventType,
  actorRole: 'SYSTEM',
  actorName: 'test',
  createdAt: new Date(NOW.getTime() + seq * 1000).toISOString(),
  ...extra,
});

describe('computeTicketSLA (engagement 24h)', () => {
  it.each([
    [1, 'ON_TIME', 23],
    [17.9, 'ON_TIME', 6.1],
    [18.5, 'WARNING', 5.5],
    [23.9, 'WARNING', 0.1],
    [24, 'EXPIRED', 0],
    [30, 'EXPIRED', -6],
  ])('enregistré il y a %sh → %s (reste %sh)', (age, status, remaining) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const sla = computeTicketSLA(hoursAgo(age as number));
    expect(sla.slaStatus).toBe(status);
    expect(sla.slaRemainingHours).toBeCloseTo(remaining as number, 1);
    expect(sla.slaDeadline).toBe(new Date(new Date(hoursAgo(age as number)).getTime() + 24 * 3600_000).toISOString());
  });
});

describe('reduceTicketStatus', () => {
  const cases: [EventType[], TicketStatus][] = [
    [[], 'TO_ASSIGN'],
    [['IMPORT'], 'TO_ASSIGN'],
    [['IMPORT', 'PROPOSED'], 'PROPOSED'],
    [['IMPORT', 'ASSIGNED'], 'ASSIGNED'],
    [['IMPORT', 'ASSIGNED', 'TELEGRAM_SENT'], 'ASSIGNED'],
    [['IMPORT', 'ASSIGNED', 'NF_SUBMITTED'], 'COMPLETED'],
    [['IMPORT', 'ASSIGNED', 'LITIGE_REPORTED'], 'LITIGE'],
    [['IMPORT', 'ASSIGNED', 'LITIGE_REPORTED', 'LITIGE_VALIDATED'], 'SUSPENDED'],
    [['IMPORT', 'ASSIGNED', 'LITIGE_REPORTED', 'LITIGE_VALIDATED', 'LITIGE_REOPENED'], 'REOPENED'],
    [['IMPORT', 'ASSIGNED', 'LITIGE_REPORTED', 'LITIGE_REOPENED'], 'REOPENED'],
    [['IMPORT', 'ASSIGNED', 'LITIGE_REPORTED', 'LITIGE_REOPENED', 'REASSIGNED'], 'ASSIGNED'],
  ];
  it.each(cases)('%j → %s', (types, expected) => {
    expect(reduceTicketStatus(types.map(t => event(t)), ticket())).toBe(expected);
  });

  it('la déclaration de prestation après le NF ne change pas le statut', () => {
    expect(reduceTicketStatus(['IMPORT', 'ASSIGNED', 'NF_SUBMITTED', 'PRESTATION_DECLARED'].map(t => event(t as EventType)), ticket())).toBe('COMPLETED');
  });

  it('se base sur la date des événements, pas sur leur ordre de réception', () => {
    const late = event('NF_SUBMITTED');
    const early = event('ASSIGNED', { createdAt: '2026-01-01T00:00:00Z' });
    expect(reduceTicketStatus([late, early], ticket())).toBe('COMPLETED');
  });

  it('un ticket sans zone ni secteur reste « zone à rattacher »', () => {
    expect(reduceTicketStatus([event('ASSIGNED')], ticket({ technicalZoneId: undefined, sectorId: undefined }))).toBe('ZONE_TO_MAP');
    expect(reduceTicketStatus([event('IMPORT')], ticket({ technicalZoneId: undefined }))).toBe('ZONE_TO_MAP');
  });
});

describe('applyEventToTicket', () => {
  it('NF : clôture le ticket et garde les détails techniques', () => {
    const nf = event('NF_SUBMITTED', { technicianId: 't-ali', nfType: 'CENTRAL_CONFIG', ontSerialNumber: 'ALCL123', cableLengthMeters: 40 });
    const updated = applyEventToTicket(ticket(), nf, [nf]);
    expect(updated).toMatchObject({
      currentStatus: 'COMPLETED',
      isClosed: true,
      currentAssignedTechId: 't-ali',
      nfType: 'CENTRAL_CONFIG',
      ontSerialNumber: 'ALCL123',
      cableLengthMeters: 40,
      lastEventAt: nf.createdAt,
    });
  });

  it('litige : mémorise le motif, le RDV et le technicien passé', () => {
    const lit = event('LITIGE_REPORTED', {
      technicianId: 't-ali', technicianName: 'Ali', litigeReasonCode: 'RDV', litigeReasonLabel: 'Rendez-vous convenu (RDV)', rdvDateTime: '18/10 14h30',
    });
    const updated = applyEventToTicket(ticket(), lit, [lit]);
    expect(updated).toMatchObject({
      currentStatus: 'LITIGE',
      isClosed: false,
      lastLitigeReasonCode: 'RDV',
      lastLitigeRdvDate: '18/10 14h30',
      lastVisitedTechName: 'Ali',
      lastVisitedAt: lit.createdAt,
    });
  });

  it('client injoignable : la demande de nouveau numéro est levée par la relance de l\'orienteur', () => {
    const lit = event('LITIGE_REPORTED', { litigeReasonCode: 'CLIENT_UNREACHABLE', requestNewContact: true, notes: '3 appels sans réponse' });
    const enLitige = applyEventToTicket(ticket(), lit, [lit]);
    expect(enLitige).toMatchObject({ lastLitigeNeedsContact: true, lastLitigeNotes: '3 appels sans réponse' });
    const reopen = event('LITIGE_REOPENED', { newClientPhone: '0611111111', dispatcherUpdateNotes: 'Nouveau numéro' });
    expect(applyEventToTicket(enLitige, reopen, [lit, reopen]).lastLitigeNeedsContact).toBe(false);
  });

  it('réouverture : applique le nouveau téléphone et la note de l\'orienteur', () => {
    const reopen = event('LITIGE_REOPENED', { newClientPhone: '0611111111', dispatcherUpdateNotes: 'Client joignable après 17h' });
    const updated = applyEventToTicket(ticket({ currentStatus: 'LITIGE' }), reopen, [reopen]);
    expect(updated).toMatchObject({
      currentStatus: 'REOPENED',
      clientPhone: '0611111111',
      reopenedWithNewPhone: '0611111111',
      lastDispatcherUpdateNotes: 'Client joignable après 17h',
    });
  });

  it('ne modifie pas le ticket d\'origine', () => {
    const original = ticket();
    applyEventToTicket(original, event('NF_SUBMITTED'), [event('NF_SUBMITTED')]);
    expect(original.currentStatus).toBe('TO_ASSIGN');
  });
});

describe('computeSumCheck', () => {
  it('chaque ticket est compté dans une seule catégorie', () => {
    const statuses: TicketStatus[] = ['TO_ASSIGN', 'PROPOSED', 'ZONE_TO_MAP', 'ASSIGNED', 'REOPENED', 'COMPLETED', 'LITIGE', 'LITIGE', 'SUSPENDED'];
    const result = computeSumCheck(statuses.map((s, i) => ticket({ id: `t${i}`, currentStatus: s })));
    expect(result).toMatchObject({
      totalTickets: 9,
      sumOfCategories: 9,
      isBalanced: true,
      discrepancy: 0,
      breakdown: { toAssign: 2, zoneToMap: 1, assigned: 1, reopened: 1, completed: 1, litige: 2, suspended: 1 },
    });
  });

  it('détecte un statut inconnu', () => {
    const result = computeSumCheck([ticket({ currentStatus: 'BIZARRE' as TicketStatus })]);
    expect(result.isBalanced).toBe(false);
    expect(result.culpritTickets).toHaveLength(1);
  });
});

describe('formatTicketMessage', () => {
  it('contient les informations utiles au technicien', () => {
    const text = formatTicketMessage(ticket({ clientName: 'Karim', clientPhone: '0661223344', clientAddress: 'Bd Anfa' }));
    expect(text).toContain('REC-1');
    expect(text).toContain('Karim');
    expect(text).toContain('+212 661 22 33 44');
    expect(text).toContain('Bd Anfa');
  });

  it('numéros au format international (cliquables dans Telegram)', () => {
    expect(formatTicketMessage(ticket({ clientPhone: '212522525236/212666274849' }))).toContain('+212 522 52 52 36 / +212 666 27 48 49');
  });

  it('relance : nouveau numéro et consigne de l\'orienteur en premier', () => {
    const text = formatRelanceMessage(ticket({
      currentStatus: 'REOPENED',
      reopenedWithNewPhone: '0661223344',
      lastDispatcherUpdateNotes: 'Client joignable après 17h',
      lastLitigeReasonLabel: 'Client injoignable',
    }));
    expect(text.indexOf('Nouveau numéro : +212 661 22 33 44')).toBeLessThan(text.indexOf('Client joignable après 17h'));
    expect(text).toContain('RELANCE — Ticket REC-1');
    expect(text).toContain('Litige précédent : Client injoignable');
  });

  it('neutralise le HTML venant des données importées', () => {
    const text = formatTicketMessage(ticket({ clientName: '<b>Pirate</b> & Co' }));
    expect(text).toContain('&lt;b&gt;Pirate&lt;/b&gt; &amp; Co');
  });

  it('signale une deuxième visite et la mise à jour de l\'orienteur', () => {
    const text = formatTicketMessage(ticket({ visitCount: 2, lastLitigeReasonLabel: 'Client injoignable', lastDispatcherUpdateNotes: 'Appeler avant' }));
    expect(text).toContain('DEUXIÈME VISITE');
    expect(text).toContain('Appeler avant');
  });
});
