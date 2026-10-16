import { describe, it, expect } from 'vitest';
import { classifyKnownTicket, opensNewCycle } from './importRules';
import type { Ticket, TicketStatus } from '../types';

const NOW = new Date('2026-10-16T10:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400_000).toISOString();

const ticket = (currentStatus: TicketStatus, extra: Partial<Ticket> = {}): Ticket => ({
  id: 't', ticketNumber: 'R1', clientNumber: 'C', clientName: 'Client', clientPhone: '', clientAddress: '', rawZoneText: '',
  registeredAt: daysAgo(10), visitCount: 1, currentStatus, isClosed: currentStatus === 'COMPLETED', slaDeadline: '', slaStatus: 'ON_TIME',
  slaRemainingHours: 0, createdAt: '', updatedAt: daysAgo(1), currentAssignedTechId: 't-ali', ...extra,
});

describe('classement d\'un ticket déjà connu à l\'import', () => {
  it('inconnu → nouveau', () => {
    expect(classifyKnownTicket(undefined, NOW)).toBe('NOUVEAU');
  });

  it.each(['ZONE_TO_MAP', 'TO_ASSIGN', 'PROPOSED', 'ASSIGNED', 'REOPENED'] as TicketStatus[])('pas encore traité (%s) → inchangé', status => {
    expect(classifyKnownTicket(ticket(status), NOW)).toBe('EN_COURS');
  });

  it('NF il y a 7 jours ou moins → reprise', () => {
    expect(classifyKnownTicket(ticket('COMPLETED', { completedAt: daysAgo(2) }), NOW)).toBe('REPRISE');
    expect(classifyKnownTicket(ticket('COMPLETED', { completedAt: daysAgo(7) }), NOW)).toBe('REPRISE');
  });

  it('NF il y a plus de 7 jours → nouvelle réclamation', () => {
    expect(classifyKnownTicket(ticket('COMPLETED', { completedAt: daysAgo(8) }), NOW)).toBe('NOUVELLE_RECLAMATION');
  });

  it('NF sans date de clôture enregistrée (anciens tickets) : date de dernière activité', () => {
    expect(classifyKnownTicket(ticket('COMPLETED', { lastEventAt: daysAgo(3) }), NOW)).toBe('REPRISE');
  });

  it('litige ou suspendu → retour client', () => {
    expect(classifyKnownTicket(ticket('LITIGE'), NOW)).toBe('RETOUR_CLIENT');
    expect(classifyKnownTicket(ticket('SUSPENDED'), NOW)).toBe('RETOUR_CLIENT');
  });

  it('seuls reprise, nouvelle réclamation et retour client rouvrent une intervention', () => {
    expect(['NOUVEAU', 'EN_COURS', 'REPRISE', 'NOUVELLE_RECLAMATION', 'RETOUR_CLIENT'].map(o => opensNewCycle(o as any)))
      .toEqual([false, false, true, true, true]);
  });
});

describe('ticket rouvert par un nouvel import', () => {
  const sla = { slaDeadline: 'd', slaStatus: 'ON_TIME' as const, slaRemainingHours: 24 };
  const prestation = { code: 'FO_04' as const, materials: { joints: 0, splitters: 0, cableMeters: 0 }, photoIds: [], declaredAt: 'x', declaredBy: 'Ali' };
  const done = ticket('COMPLETED', { completedAt: daysAgo(2), prestation, prestationStatus: 'DECLAREE', visitCount: 1 });

  it('reprise : même technicien, non facturable pour lui, ancienne prestation archivée', async () => {
    const { buildReopenedTicket } = await import('./importRules');
    const t = buildReopenedTicket(done, { clientPhone: '0600' }, 'REPRISE', sla, 'now');
    expect(t).toMatchObject({
      visitCount: 2, importOutcome: 'REPRISE', preferredTechId: 't-ali', repriseOfTechId: 't-ali',
      prestation: null, prestationStatus: null, previousPrestations: [prestation], clientPhone: '0600',
    });
  });

  it('nouvelle réclamation : dispatch normal (pas de technicien imposé)', async () => {
    const { buildReopenedTicket } = await import('./importRules');
    const t = buildReopenedTicket(done, {}, 'NOUVELLE_RECLAMATION', sla, 'now');
    expect(t).toMatchObject({ preferredTechId: null, repriseOfTechId: null });
  });

  it('retour client : même technicien, facturable', async () => {
    const { buildReopenedTicket } = await import('./importRules');
    const t = buildReopenedTicket(ticket('SUSPENDED'), {}, 'RETOUR_CLIENT', sla, 'now');
    expect(t).toMatchObject({ preferredTechId: 't-ali', repriseOfTechId: null });
  });
});
