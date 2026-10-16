import { describe, it, expect } from 'vitest';
import { assignmentWarnings, technicianLoads } from './assignment';
import type { Technician, Ticket } from '../types';

const tech = (id: string, fullName: string, extra: Partial<Technician> = {}): Technician => ({
  id, fullName, normalizedName: fullName.toLowerCase(), sectorId: 's', sectorIds: ['s'], phone: '', zoneIds: ['z1'],
  isActive: true, createdAt: '', telegramChatId: '123', ...extra,
});
const ali = tech('t-ali', 'Ali');
const badr = tech('t-badr', 'Badr');
const sansTelegram = tech('t-c', 'Chama', { telegramChatId: undefined, zoneIds: ['z2'] });
const techs = [ali, badr, sansTelegram];

const ticket = (extra: Partial<Ticket> = {}): Ticket => ({
  id: 't', ticketNumber: 'R1', clientNumber: 'C', clientName: 'Client', clientPhone: '', clientAddress: '', rawZoneText: '',
  technicalZoneId: 'z1', registeredAt: '', visitCount: 1, currentStatus: 'TO_ASSIGN', isClosed: false, slaDeadline: '',
  slaStatus: 'ON_TIME', slaRemainingHours: 20, createdAt: '', updatedAt: '', ...extra,
});
const texts = (w: { text: string }[]) => w.map(x => x.text).join(' | ');

describe('alertes au choix du technicien', () => {
  it('ticket simple, bon technicien : aucune alerte', () => {
    expect(assignmentWarnings(ticket(), 't-ali', techs)).toEqual([]);
  });

  it('reprise : non facturable pour le même, facturable pour un autre', () => {
    const t = ticket({ importOutcome: 'REPRISE', repriseOfTechId: 't-ali', preferredTechId: 't-ali', visitCount: 2 });
    expect(texts(assignmentWarnings(t, 't-ali', techs))).toMatch(/non facturable pour Ali/);
    expect(assignmentWarnings(t, 't-badr', techs)[0]).toMatchObject({ level: 'warning', text: expect.stringMatching(/Reprise de Ali confiée à Badr : facturable/) });
  });

  it('2e visite après litige : rappelle le technicien précédent et le motif', () => {
    const t = ticket({ visitCount: 2, lastVisitedTechName: 'Ali', lastLitigeReasonLabel: 'Client injoignable' });
    expect(texts(assignmentWarnings(t, 't-badr', techs))).toBe('⚠️ 2e visite : précédent technicien Ali (litige : Client injoignable).');
    expect(assignmentWarnings(t, 't-ali', techs)[0].level).toBe('info');
  });

  it('retour client : précédent technicien', () => {
    const t = ticket({ importOutcome: 'RETOUR_CLIENT', preferredTechId: 't-ali', visitCount: 2 });
    expect(texts(assignmentWarnings(t, 't-badr', techs))).toMatch(/précédent technicien Ali/);
  });

  it('technicien qui avait signalé « hors zone »', () => {
    const t = ticket({ lastLitigeReasonCode: 'HORS_ZONE', lastVisitedTechName: 'Badr' });
    expect(texts(assignmentWarnings(t, 't-badr', techs))).toMatch(/signalé ce ticket hors de sa zone/);
  });

  it('zone non couverte, Telegram non activé, surcharge', () => {
    const w = texts(assignmentWarnings(ticket(), 't-c', techs, () => 7));
    expect(w).toMatch(/ne couvre pas cette zone/);
    expect(w).toMatch(/n'a pas activé Telegram/);
    expect(w).toMatch(/déjà 7 interventions/);
  });

  it('aucun technicien choisi : pas d\'alerte', () => {
    expect(assignmentWarnings(ticket(), undefined, techs)).toEqual([]);
  });
});

describe('charge des techniciens pendant le dispatch', () => {
  it('en cours + proposés maintenant, le plus chargé en premier', () => {
    const open = [
      ticket({ currentAssignedTechId: 't-ali', currentStatus: 'ASSIGNED' }),
      ticket({ currentAssignedTechId: 't-ali', currentStatus: 'REOPENED' }),
      ticket({ currentAssignedTechId: 't-ali', currentStatus: 'COMPLETED' }),
    ];
    const loads = technicianLoads([ali, badr], open, ['t-badr', 't-badr', 't-badr', 't-ali', undefined]);
    expect(loads.map(l => [l.technician.id, l.inProgress, l.planned, l.total])).toEqual([
      ['t-ali', 2, 1, 3],
      ['t-badr', 0, 3, 3],
    ]);
  });
});
