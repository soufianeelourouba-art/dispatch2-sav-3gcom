import { describe, it, expect } from 'vitest';
import { isInDailyScope } from './dailyScope';
import type { Ticket, TicketStatus } from '../types';

const NOW = new Date('2026-10-16T15:00:00Z'); // Morocco = UTC+0
const ticket = (currentStatus: TicketStatus, extra: Partial<Ticket> = {}): Ticket => ({
  id: 't', ticketNumber: 'R1', clientNumber: 'C', clientName: 'Client', clientPhone: '', clientAddress: '', rawZoneText: '',
  registeredAt: '2026-10-10T08:00:00Z', visitCount: 1, currentStatus, isClosed: currentStatus === 'COMPLETED', slaDeadline: '',
  slaStatus: 'EXPIRED', slaRemainingHours: -100, createdAt: '', updatedAt: '', ...extra,
});

describe('périmètre du jour de l\'orienteur', () => {
  it.each(['TO_ASSIGN', 'ZONE_TO_MAP', 'ASSIGNED', 'REOPENED', 'LITIGE'] as TicketStatus[])(
    'reste à traiter (%s), même reçu il y a plusieurs jours → affiché',
    status => expect(isInDailyScope(ticket(status), NOW)).toBe(true)
  );

  it('NF aujourd\'hui → affiché ; NF les jours précédents → masqué', () => {
    expect(isInDailyScope(ticket('COMPLETED', { completedAt: '2026-10-16T09:00:00Z' }), NOW)).toBe(true);
    expect(isInDailyScope(ticket('COMPLETED', { completedAt: '2026-10-15T22:00:00Z' }), NOW)).toBe(false);
  });

  it('suspendu aujourd\'hui → affiché ; suspendu avant → seulement dans l\'onglet Suspendus', () => {
    expect(isInDailyScope(ticket('SUSPENDED', { lastEventAt: '2026-10-16T08:00:00Z' }), NOW)).toBe(true);
    expect(isInDailyScope(ticket('SUSPENDED', { lastEventAt: '2026-10-14T08:00:00Z' }), NOW)).toBe(false);
  });
});
