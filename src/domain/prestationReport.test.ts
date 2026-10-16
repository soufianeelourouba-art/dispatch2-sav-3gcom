import { describe, it, expect } from 'vitest';
import { prestationLines, summarizeByTechnician, periodPreset, inPeriod, moroccoDay } from './prestationReport';
import type { Technician, Ticket } from '../types';
import type { PrestationDeclaration } from './prestations';

const tech = (id: string, fullName: string): Technician => ({
  id, fullName, normalizedName: fullName.toLowerCase(), sectorId: 's', sectorIds: ['s'], phone: '', zoneIds: [],
  isActive: true, createdAt: '',
});
const techs = [tech('t-ali', 'Ali'), tech('t-badr', 'Badr')];

const decl = (extra: Partial<PrestationDeclaration> = {}): PrestationDeclaration => ({
  code: 'FO_04', materials: { joints: 0, splitters: 0, cableMeters: 0 }, photoIds: [], declaredAt: '2026-10-05T10:00:00Z',
  declaredBy: 'Ali', ...extra,
});

let n = 0;
const ticket = (extra: Partial<Ticket> = {}): Ticket => ({
  id: `tk${++n}`, ticketNumber: `R${n}`, clientNumber: 'C', clientName: 'Client', clientPhone: '', clientAddress: '', rawZoneText: '',
  registeredAt: '', visitCount: 1, currentStatus: 'COMPLETED', isClosed: true, slaDeadline: '', slaStatus: 'ON_TIME',
  slaRemainingHours: 0, createdAt: '', updatedAt: '', currentAssignedTechId: 't-ali', completedAt: '2026-10-05T09:00:00Z', ...extra,
});

const october = { from: '2026-10-01', to: '2026-10-31' };

describe('prestations par période', () => {
  it('jour marocain : 23h30 UTC le 30 septembre 2026 compte pour le 30 (UTC+0)', () => {
    expect(moroccoDay(new Date('2026-09-30T23:30:00Z'))).toBe('2026-09-30');
    expect(inPeriod('2026-09-30T23:30:00Z', october)).toBe(false);
    // Before 20/09/2026 Morocco was UTC+1: 23h30 UTC is already the next day
    expect(moroccoDay(new Date('2026-08-31T23:30:00Z'))).toBe('2026-09-01');
  });

  it('une ligne par NF de la période, avec son statut de déclaration', () => {
    const lines = prestationLines([
      ticket({ prestationStatus: 'DECLAREE', prestation: decl({ code: 'FO_01_02', raccordements: 3, materials: { joints: 2, splitters: 0, cableMeters: 40 }, photoIds: ['p'] }) }),
      ticket({ prestationStatus: 'A_DECLARER' }),
      ticket({}), // never declared yet (null)
      ticket({ prestationStatus: 'NON_FACTURABLE' }),
      ticket({ completedAt: '2026-09-20T09:00:00Z', prestationStatus: 'DECLAREE', prestation: decl() }), // other month
      ticket({ currentStatus: 'ASSIGNED', completedAt: undefined }),
    ], techs, october);
    expect(lines.map(l => [l.status, l.code, l.units])).toEqual([
      ['DECLAREE', 'FO_01_02', 3],
      ['A_DECLARER', undefined, 0],
      ['A_DECLARER', undefined, 0],
      ['NON_FACTURABLE', undefined, 0],
    ]);
    expect(lines[0]).toMatchObject({ techId: 't-ali', techName: 'Ali', photoCount: 1, materials: { joints: 2, cableMeters: 40 } });
  });

  it('cycle précédent d\'un ticket rouvert : payé au technicien qui l\'avait déclaré', () => {
    const lines = prestationLines([
      ticket({
        currentStatus: 'ASSIGNED', currentAssignedTechId: 't-ali',
        previousPrestations: [decl({ declaredBy: 'Badr', code: 'FO_08', declaredAt: '2026-10-02T08:00:00Z' })],
      }),
    ], techs, october);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ techId: 't-badr', code: 'FO_08', units: 1, earlierCycle: true, status: 'DECLAREE' });
  });

  it('synthèse par technicien avec tarifs', () => {
    const lines = prestationLines([
      ticket({ prestationStatus: 'DECLAREE', prestation: decl({ code: 'FO_01_02', raccordements: 2, materials: { joints: 1, splitters: 0, cableMeters: 10 } }) }),
      ticket({ prestationStatus: 'DECLAREE', prestation: decl({ code: 'FO_32' }) }),
      ticket({ prestationStatus: 'A_DECLARER' }),
      ticket({ currentAssignedTechId: 't-badr', prestationStatus: 'INCLUSE' }),
      ticket({ currentAssignedTechId: 't-badr', prestationStatus: 'DECLAREE', prestation: decl({ code: 'FO_04', declaredBy: 'Badr' }) }),
    ], techs, october);
    const [ali, badr] = summarizeByTechnician(lines, { FO_01_02: 100, FO_32: 300, FO_04: 150 });
    expect(ali).toMatchObject({
      techName: 'Ali', nf: 3, declared: 2, toDeclare: 1, amount: 2 * 100 + 300,
      units: { FO_01_02: 2, FO_04: 0, FO_08: 0, FO_32: 1 }, materials: { joints: 1, splitters: 0, cableMeters: 10 },
    });
    expect(badr).toMatchObject({ techName: 'Badr', nf: 2, declared: 1, included: 1, amount: 150 });
  });

  it('raccourcis de période', () => {
    const now = new Date('2026-10-16T10:00:00Z'); // vendredi
    expect(periodPreset('TODAY', now)).toEqual({ from: '2026-10-16', to: '2026-10-16' });
    expect(periodPreset('WEEK', now)).toEqual({ from: '2026-10-12', to: '2026-10-16' });
    expect(periodPreset('MONTH', now)).toEqual({ from: '2026-10-01', to: '2026-10-16' });
    expect(periodPreset('LAST_MONTH', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodPreset('LAST_MONTH', new Date('2026-01-10T10:00:00Z'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('« Aucune action » dans le paiement', () => {
  it('comptée comme déclarée, dans sa colonne, sans montant', () => {
    const lines = prestationLines([
      ticket({ prestationStatus: 'DECLAREE', prestation: decl({ code: 'AUCUNE' }) }),
      ticket({ prestationStatus: 'DECLAREE', prestation: decl({ code: 'FO_04' }) }),
    ], techs, october);
    const [ali] = summarizeByTechnician(lines, { FO_04: 150, AUCUNE: 999 });
    expect(ali).toMatchObject({ declared: 2, toDeclare: 0, amount: 150, units: { AUCUNE: 1, FO_04: 1 } });
  });
});
