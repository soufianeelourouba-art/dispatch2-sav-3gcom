import { describe, it, expect } from 'vitest';
import { computeDispatchProposals } from './dispatch';
import type { Technician, Ticket } from '../types';

const tech = (id: string, fullName: string, zoneIds: string[], extra: Partial<Technician> = {}): Technician => ({
  id,
  fullName,
  normalizedName: fullName.toLowerCase(),
  sectorId: 'sec-casa',
  sectorIds: ['sec-casa'],
  phone: '',
  zoneIds,
  isActive: true,
  createdAt: '',
  ...extra,
});

const ticket = (id: string, extra: Partial<Ticket> = {}): Ticket => ({
  id,
  ticketNumber: id,
  clientNumber: 'C',
  clientName: 'Client',
  clientPhone: '',
  clientAddress: '',
  rawZoneText: '',
  technicalZoneId: 'z1',
  sectorId: 'sec-casa',
  registeredAt: '2026-10-15T08:00:00Z',
  visitCount: 1,
  currentStatus: 'TO_ASSIGN',
  isClosed: false,
  slaDeadline: '',
  slaStatus: 'ON_TIME',
  slaRemainingHours: 24,
  createdAt: '',
  updatedAt: '',
  ...extra,
});

const openAssigned = (techId: string, n: number) =>
  Array.from({ length: n }, (_, i) => ticket(`open-${techId}-${i}`, { currentAssignedTechId: techId }));

const ali = tech('t-ali', 'Ali', ['z1']);
const badr = tech('t-badr', 'Badr', ['z1', 'z2']);
const chama = tech('t-chama', 'Chama', ['z2']);

describe('computeDispatchProposals — cas standard', () => {
  it('choisit le technicien de la zone le moins chargé', () => {
    const { proposals } = computeDispatchProposals([ticket('T1')], [ali, badr], openAssigned('t-ali', 3), 'sec-casa');
    expect(proposals[0].technicianId).toBe('t-badr');
  });

  it('répartit la charge au fil des tickets d\'un même lot', () => {
    const { proposals } = computeDispatchProposals([ticket('T1'), ticket('T2'), ticket('T3')], [ali, badr], [], 'sec-casa');
    expect(proposals.map(p => p.technicianId)).toEqual(['t-ali', 't-badr', 't-ali']);
  });

  it('ne compte pas les tickets clôturés dans la charge', () => {
    const closed = openAssigned('t-ali', 5).map(t => ({ ...t, isClosed: true }));
    const { proposals } = computeDispatchProposals([ticket('T1')], [ali, badr], [...closed, ...openAssigned('t-badr', 1)], 'sec-casa');
    expect(proposals[0].technicianId).toBe('t-ali');
  });

  it('ignore les techniciens inactifs et ceux d\'une autre zone', () => {
    const inactive = tech('t-x', 'Aaron', ['z1'], { isActive: false });
    const { proposals } = computeDispatchProposals([ticket('T1')], [inactive, chama, badr], [], 'sec-casa');
    expect(proposals[0].technicianId).toBe('t-badr');
  });

  it('prend en compte les techniciens rattachés au secteur en secondaire', () => {
    const renfort = tech('t-renfort', 'Renfort', ['z1'], { sectorId: 'sec-rabat', sectorIds: ['sec-rabat', 'sec-casa'] });
    const { proposals } = computeDispatchProposals([ticket('T1')], [renfort], [], 'sec-casa');
    expect(proposals[0].technicianId).toBe('t-renfort');
  });

  it('signale la surcharge à partir de 6 interventions en cours', () => {
    const { proposals } = computeDispatchProposals([ticket('T1')], [ali], openAssigned('t-ali', 6), 'sec-casa');
    expect(proposals[0].rationale).toMatch(/Seuil de charge/);
  });

  it('ne propose personne si la zone est inconnue ou non couverte', () => {
    const result = computeDispatchProposals(
      [ticket('T1', { technicalZoneId: undefined }), ticket('T2', { technicalZoneId: 'z-vide' })],
      [ali],
      [],
      'sec-casa'
    );
    expect(result.proposals.map(p => p.technicianId)).toEqual([null, null]);
    expect(result.stats).toMatchObject({ totalEvaluated: 2, assignedCount: 0, unassignedCount: 2 });
  });
});

describe('computeDispatchProposals — incident splitter', () => {
  it('envoie tous les tickets d\'un même splitter au même technicien', () => {
    const tickets = [
      ticket('S1', { splitterRef: 'SP-7' }),
      ticket('S2', { splitterRef: 'SP-7' }),
      ticket('S3', { splitterRef: 'SP-7' }),
      ticket('N1'),
    ];
    const { proposals, stats } = computeDispatchProposals(tickets, [ali, badr], [], 'sec-casa');
    const bySplitter = proposals.slice(0, 3).map(p => p.technicianId);
    expect(new Set(bySplitter).size).toBe(1);
    expect(stats.splitterGroupedCount).toBe(2);
    // the load of the splitter counts: the next ticket goes to the other technician
    expect(proposals[3].technicianId).not.toBe(bySplitter[0]);
  });

  it('rattache un nouveau ticket au technicien déjà en intervention sur ce splitter', () => {
    const enCours = ticket('OLD', { splitterRef: 'SP-7', currentAssignedTechId: 't-badr', currentStatus: 'ASSIGNED' });
    const { proposals } = computeDispatchProposals([ticket('NEW', { splitterRef: 'SP-7' })], [ali, badr], [enCours, ...openAssigned('t-badr', 5)], 'sec-casa');
    expect(proposals[0]).toMatchObject({ technicianId: 't-badr', priorityScore: 110 });
    expect(proposals[0].rationale).toMatch(/splitter SP-7/);
  });

  it('ignore un splitter clôturé ou d\'un autre secteur', () => {
    const clos = ticket('OLD', { splitterRef: 'SP-7', currentAssignedTechId: 't-badr', isClosed: true });
    const autreSecteur = ticket('OLD2', { splitterRef: 'SP-7', sectorId: 'sec-rabat', currentAssignedTechId: 't-badr' });
    const { proposals } = computeDispatchProposals([ticket('NEW', { splitterRef: 'SP-7' })], [ali, badr], [clos, autreSecteur], 'sec-casa');
    expect(proposals[0].priorityScore).toBe(50);
  });
});

describe('computeDispatchProposals — deuxième visite', () => {
  it('cause externe (client injoignable) : reconduit le même technicien même s\'il est plus chargé', () => {
    const t = ticket('T1', { visitCount: 2, lastLitigeReasonCode: 'CLIENT_UNREACHABLE', lastVisitedTechName: 'Ali' });
    const { proposals, stats } = computeDispatchProposals([t], [ali, badr], openAssigned('t-ali', 4), 'sec-casa');
    expect(proposals[0]).toMatchObject({ technicianId: 't-ali', isSecondVisit: true, priorityScore: 100 });
    expect(stats.sameTechCount).toBe(1);
  });

  it('cause externe (RDV) : reconnaît le technicien sans tenir compte de la casse', () => {
    const t = ticket('T1', { visitCount: 2, lastLitigeReasonCode: 'RDV', lastVisitedTechName: '  BADR ' });
    const { proposals } = computeDispatchProposals([t], [ali, badr], [], 'sec-casa');
    expect(proposals[0].technicianId).toBe('t-badr');
  });

  it('cause technique (GC) : envoie un technicien différent', () => {
    const t = ticket('T1', { visitCount: 2, lastLitigeReasonCode: 'GC', lastVisitedTechName: 'Ali' });
    const { proposals, stats } = computeDispatchProposals([t], [ali, badr], [], 'sec-casa');
    expect(proposals[0]).toMatchObject({ technicianId: 't-badr', priorityScore: 90 });
    expect(stats.differentTechCount).toBe(1);
  });

  it('cause technique mais un seul technicien dans la zone : lui est quand même proposé', () => {
    const t = ticket('T1', { visitCount: 2, lastLitigeReasonCode: 'GC', lastVisitedTechName: 'Ali' });
    const { proposals } = computeDispatchProposals([t], [ali], [], 'sec-casa');
    expect(proposals[0]).toMatchObject({ technicianId: 't-ali', priorityScore: 50 });
  });

  it('cause externe mais ancien technicien inactif : repli sur le moins chargé', () => {
    const t = ticket('T1', { visitCount: 2, lastLitigeReasonCode: 'CLIENT_UNREACHABLE', lastVisitedTechName: 'Ali' });
    const { proposals } = computeDispatchProposals([t], [{ ...ali, isActive: false }, badr], [], 'sec-casa');
    expect(proposals[0].technicianId).toBe('t-badr');
  });
});
