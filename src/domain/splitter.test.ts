import { describe, it, expect } from 'vitest';
import { normalizeSplitterRef, splitterKey, groupBySplitter, collectiveSplitterKeys } from './splitter';
import type { Ticket } from '../types';

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
  registeredAt: '',
  visitCount: 1,
  currentStatus: 'TO_ASSIGN',
  isClosed: false,
  slaDeadline: '',
  slaStatus: 'ON_TIME',
  slaRemainingHours: 20,
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('normalizeSplitterRef', () => {
  it('uniformise la référence', () => {
    expect(normalizeSplitterRef('  sp  12/3 ')).toBe('SP 12/3');
    expect(normalizeSplitterRef(1203)).toBe('1203');
  });
  it('considère les cellules vides ou « - » comme sans splitter', () => {
    for (const v of ['', ' ', '-', 'N/A', 'n/a', '0', 'néant', null, undefined]) {
      expect(normalizeSplitterRef(v)).toBeUndefined();
    }
  });
});

describe('splitterKey', () => {
  it('distingue un même numéro dans deux secteurs', () => {
    expect(splitterKey({ sectorId: 'a', splitterRef: 'SP1' })).not.toBe(splitterKey({ sectorId: 'b', splitterRef: 'SP1' }));
    expect(splitterKey({ sectorId: 'a' })).toBeNull();
  });
});

describe('groupBySplitter', () => {
  const tickets = [
    ticket('A1', { splitterRef: 'SP1', slaRemainingHours: 10 }),
    ticket('A2', { splitterRef: 'SP1', slaRemainingHours: 3, currentAssignedTechId: 't1' }),
    ticket('A3', { splitterRef: 'SP1', isClosed: true, currentStatus: 'COMPLETED' }),
    ticket('B1', { splitterRef: 'SP2' }),
    ticket('B2', { splitterRef: 'SP2' }),
    ticket('B3', { splitterRef: 'SP2' }),
    ticket('C1', { splitterRef: 'SP3' }), // seul ticket : pas un incident collectif
    ticket('D1'),
    ticket('E1', { splitterRef: 'SP1', sectorId: 'sec-rabat' }), // autre secteur
  ];

  it('regroupe par splitter et secteur, le plus gros incident en premier', () => {
    const groups = groupBySplitter(tickets);
    expect(groups.map(g => [g.splitterRef, g.openCount, g.closedCount])).toEqual([
      ['SP2', 3, 0],
      ['SP1', 2, 1],
    ]);
    expect(groups[1].worstSlaHours).toBe(3);
    expect(groups[1].technicianIds).toEqual(['t1']);
  });

  it('ignore un splitter dont il ne reste qu\'un ticket ouvert', () => {
    const closedMost = [ticket('X1', { splitterRef: 'SP9' }), ticket('X2', { splitterRef: 'SP9', isClosed: true })];
    expect(groupBySplitter(closedMost)).toEqual([]);
    expect(groupBySplitter(closedMost, 1)).toHaveLength(1);
  });

  it('collectiveSplitterKeys', () => {
    expect(collectiveSplitterKeys(tickets)).toEqual(new Set(['sec-casa|SP2', 'sec-casa|SP1']));
  });
});
