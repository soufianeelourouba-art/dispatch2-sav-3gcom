import { describe, it, expect } from 'vitest';
import {
  detectHeaders,
  parseRegisteredAt,
  normalizePhone,
  resolveZone,
  interpretRows,
  type ImportContext,
} from './excelImport';
import type { Sector, TechnicalZone, ZoneAlias } from '../types';

const sectors: Sector[] = [
  { id: 'sec-casa', dcId: 'dc', code: 'CASA', name: 'Casablanca Centre', createdAt: '' },
  { id: 'sec-rabat', dcId: 'dc', code: 'RAB', name: 'Rabat', createdAt: '' },
];
const zones: TechnicalZone[] = [
  { id: 'z-maarif', sectorId: 'sec-casa', label: 'Maarif Centre', msanCode: 'MSAN-MAA', createdAt: '' },
  { id: 'z-agdal', sectorId: 'sec-rabat', label: 'Agdal', msanCode: 'MSAN-AGD', createdAt: '' },
];
const aliases: ZoneAlias[] = [
  { id: 'a1', rawLabel: 'maarif', technicalZoneId: 'z-maarif' },
  { id: 'a2', rawLabel: 'Agdal Rabat', technicalZoneId: 'z-agdal' },
];
const ctx: ImportContext = {
  targetSectorId: 'sec-casa',
  sectors,
  zones,
  aliases,
  now: new Date('2026-10-15T10:00:00Z'),
};

describe('detectHeaders', () => {
  it('reconnaît les colonnes du fichier exemple sans confondre code et nom client', () => {
    expect(detectHeaders([
      'N° Réclamation', 'Code Client', 'Nom Abonné', 'Téléphone', 'Adresse Client', 'Zone MSAN', 'Date Enregistrement',
    ])).toEqual({
      ticketNumberCol: 'N° Réclamation',
      clientNumberCol: 'Code Client',
      clientNameCol: 'Nom Abonné',
      clientPhoneCol: 'Téléphone',
      clientAddressCol: 'Adresse Client',
      zoneTextCol: 'Zone MSAN',
      registeredAtCol: 'Date Enregistrement',
    });
  });

  it('ignore la casse, les accents et la ponctuation', () => {
    const detected = detectHeaders(['NUMERO RECLAMATION', 'numéro client', 'GSM', 'répartiteur', 'DATE_CREATION']);
    expect(detected.ticketNumberCol).toBe('NUMERO RECLAMATION');
    expect(detected.clientNumberCol).toBe('numéro client');
    expect(detected.clientPhoneCol).toBe('GSM');
    expect(detected.zoneTextCol).toBe('répartiteur');
    expect(detected.registeredAtCol).toBe('DATE_CREATION');
  });

  it('n\'utilise jamais une même colonne pour deux champs', () => {
    const detected = detectHeaders(['Ticket', 'Client', 'Tel']);
    expect(detected.ticketNumberCol).toBe('Ticket');
    expect(detected.clientNameCol).toBe('Client');
    expect(detected.clientNumberCol).toBeUndefined();
    expect(detected.clientPhoneCol).toBe('Tel');
  });

  it('reconnaît la colonne splitter', () => {
    expect(detectHeaders(['N° Réclamation', 'N° Splitter', 'Zone']).splitterCol).toBe('N° Splitter');
    expect(detectHeaders(['Ticket', 'SPLITTER']).splitterCol).toBe('SPLITTER');
    expect(detectHeaders(['Ticket', 'Coupleur']).splitterCol).toBe('Coupleur');
  });

  it('ne reconnaît pas un mot à l\'intérieur d\'un autre (« tel » dans « Hôtel »)', () => {
    expect(detectHeaders(['Hôtel']).clientPhoneCol).toBeUndefined();
  });
});

describe('parseRegisteredAt (heure du Maroc → UTC)', () => {
  // Maroc : UTC+1 jusqu'au 20/09/2026, puis UTC+0 définitivement (voir moroccoTime.ts).
  it('lit le format français JJ/MM/AAAA HH:MM', () => {
    expect(parseRegisteredAt('14/10/2026 08:30')).toBe('2026-10-14T08:30:00.000Z');
    expect(parseRegisteredAt('14/07/2026 08:30')).toBe('2026-07-14T07:30:00.000Z');
  });

  it('accepte les variantes 14-10-2026, 14.10.26, 8h30 et sans heure', () => {
    expect(parseRegisteredAt('14-10-2026 8h30')).toBe('2026-10-14T08:30:00.000Z');
    expect(parseRegisteredAt('14.10.26 08:30:15')).toBe('2026-10-14T08:30:15.000Z');
    expect(parseRegisteredAt('14/10/2026')).toBe('2026-10-14T00:00:00.000Z');
  });

  it('lit le format AAAA-MM-JJ HH:MM', () => {
    expect(parseRegisteredAt('2026-10-14 08:30')).toBe('2026-10-14T08:30:00.000Z');
  });

  it('garde tel quel un horodatage ISO avec fuseau', () => {
    expect(parseRegisteredAt('2026-10-14T08:30:00Z')).toBe('2026-10-14T08:30:00.000Z');
    expect(parseRegisteredAt('2026-10-14T08:30:00+01:00')).toBe('2026-10-14T07:30:00.000Z');
  });

  it('convertit une date Excel (numéro de série) au lieu de tomber en 1970', () => {
    // 46309 = 14/10/2026, + 8,5/24 = 08:30
    expect(parseRegisteredAt(46309 + 8.5 / 24)).toBe('2026-10-14T08:30:00.000Z');
    expect(parseRegisteredAt(46309)).toBe('2026-10-14T00:00:00.000Z');
  });

  it('suit l\'heure UTC+0 du Ramadan (avant le changement définitif)', () => {
    expect(parseRegisteredAt('01/03/2026 12:00')).toBe('2026-03-01T12:00:00.000Z');
  });

  it('refuse les dates impossibles ou illisibles', () => {
    expect(parseRegisteredAt('31/02/2026 10:00')).toBeNull();
    expect(parseRegisteredAt('14/13/2026')).toBeNull();
    expect(parseRegisteredAt('14/10/2026 25:00')).toBeNull();
    expect(parseRegisteredAt('demain matin')).toBeNull();
    expect(parseRegisteredAt('')).toBeNull();
    expect(parseRegisteredAt(-5)).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('remet le 0 perdu des numéros marocains saisis comme nombres', () => {
    expect(normalizePhone(661223344)).toBe('0661223344');
    expect(normalizePhone('522401122')).toBe('0522401122');
  });
  it('laisse les autres formats inchangés', () => {
    expect(normalizePhone('06 61 22 33 44')).toBe('06 61 22 33 44');
    expect(normalizePhone('+212661223344')).toBe('+212661223344');
    expect(normalizePhone(undefined)).toBe('');
  });
});

describe('resolveZone', () => {
  it('trouve la zone par libellé ou code MSAN du secteur choisi', () => {
    expect(resolveZone('maarif centre', ctx)).toEqual({ zoneId: 'z-maarif', zoneLabel: 'Maarif Centre' });
    expect(resolveZone('MSAN-MAA', ctx).zoneId).toBe('z-maarif');
  });
  it('utilise les alias mémorisés', () => {
    expect(resolveZone(' MAARIF ', ctx).zoneId).toBe('z-maarif');
  });
  it('signale une zone (ou un alias) appartenant à un autre secteur', () => {
    expect(resolveZone('Agdal', ctx)).toEqual({ crossSectorName: 'Rabat' });
    expect(resolveZone('agdal rabat', ctx)).toEqual({ crossSectorName: 'Rabat' });
  });
  it('laisse vide une zone inconnue (à rattacher)', () => {
    expect(resolveZone('MSAN-NOUVELLE-EXTENSION', ctx)).toEqual({});
  });
});

describe('resolveZone — fautes de frappe', () => {
  const zonesWithTwins: TechnicalZone[] = [
    ...zones,
    { id: 'z-cal', sectorId: 'sec-casa', label: 'Californie', msanCode: 'MSAN-CAL', createdAt: '' },
    { id: 'z-sm1', sectorId: 'sec-casa', label: 'Sidi Moumen 1', msanCode: 'MSAN-SM1', createdAt: '' },
    { id: 'z-sm2', sectorId: 'sec-casa', label: 'Sidi Moumen 2', msanCode: 'MSAN-SM2', createdAt: '' },
    { id: 'z-oasis', sectorId: 'sec-casa', label: 'Oasis', msanCode: 'MSAN-OAS', createdAt: '' },
    { id: 'z-oasys', sectorId: 'sec-casa', label: 'Oasys Park', msanCode: 'MSAN-OPK', createdAt: '' },
  ];
  const c: ImportContext = { ...ctx, zones: zonesWithTwins };

  it('ignore accents, majuscules, tirets et espaces (sans parler de correction)', () => {
    expect(resolveZone('MAÂRIF-CENTRE', c)).toEqual({ zoneId: 'z-maarif', zoneLabel: 'Maarif Centre' });
    expect(resolveZone('maarifcentre', c).zoneId).toBe('z-maarif');
    expect(resolveZone('msan maa', c).zoneId).toBe('z-maarif');
  });

  it('corrige une lettre en trop, en moins ou remplacée, et le signale', () => {
    expect(resolveZone('Califarnie', c)).toEqual({ zoneId: 'z-cal', zoneLabel: 'Californie', correctedFrom: 'Califarnie' });
    expect(resolveZone('Californi', c).zoneId).toBe('z-cal');
    expect(resolveZone('Callifornie', c).zoneId).toBe('z-cal');
    expect(resolveZone('Maarif Cnetre', c).zoneId).toBe('z-maarif'); // 2 fautes sur un nom long
  });

  it('ne change jamais un numéro de zone', () => {
    expect(resolveZone('Sidi Moumen 3', c)).toEqual({});
    expect(resolveZone('Sidi Moumin 2', c).zoneId).toBe('z-sm2');
  });

  it('corrige vers la zone la plus proche quand elle est seule à cette distance', () => {
    expect(resolveZone('Oasys', c).zoneId).toBe('z-oasis');
  });

  it('ne corrige pas les noms courts', () => {
    const withAnfa: ImportContext = { ...c, zones: [...zonesWithTwins, { id: 'z-anfa', sectorId: 'sec-casa', label: 'Anfa', msanCode: 'AN', createdAt: '' }] };
    expect(resolveZone('Anfo', withAnfa)).toEqual({});
  });

  it('ne corrige pas quand deux zones sont aussi proches l\'une que l\'autre', () => {
    const twins: ImportContext = {
      ...c,
      zones: [
        { id: 'z-nahda', sectorId: 'sec-casa', label: 'Hay Nahda', msanCode: 'X1A', createdAt: '' },
        { id: 'z-nahla', sectorId: 'sec-casa', label: 'Hay Nahla', msanCode: 'X1B', createdAt: '' },
      ],
    };
    expect(resolveZone('Hay Nahfa', twins)).toEqual({});
    expect(resolveZone('Hay Nahdda', twins).zoneId).toBe('z-nahda');
  });

  it('ne corrige pas un texte trop différent', () => {
    expect(resolveZone('Casablanca Port', c)).toEqual({});
  });

  it('une zone d\'un autre secteur reste refusée, même avec des accents', () => {
    expect(resolveZone('AGDAL', c)).toEqual({ crossSectorName: 'Rabat' });
  });
});

describe('interpretRows', () => {
  const detected = detectHeaders(['N° Réclamation', 'Code Client', 'Nom Abonné', 'Téléphone', 'Zone MSAN', 'Date']);
  const row = (overrides: Record<string, unknown> = {}) => ({
    'N° Réclamation': 'REC-1',
    'Code Client': 'C-1',
    'Nom Abonné': 'Karim Bensouda',
    'Téléphone': 661223344,
    'Zone MSAN': 'Maarif Centre',
    'Date': '14/10/2026 08:30',
    ...overrides,
  });

  it('interprète une ligne valide', () => {
    const [r] = interpretRows([row()], detected, ctx);
    expect(r).toMatchObject({
      rowNumber: 2,
      ticketNumber: 'REC-1',
      clientName: 'Karim Bensouda',
      clientPhone: '0661223344',
      resolvedZoneId: 'z-maarif',
      resolvedSectorId: 'sec-casa',
      registeredAt: '2026-10-14T08:30:00.000Z',
      isValid: true,
    });
  });

  it('rejette une ligne sans numéro de ticket', () => {
    const [r] = interpretRows([row({ 'N° Réclamation': '' })], detected, ctx);
    expect(r.isValid).toBe(false);
    expect(r.rejectionReason).toMatch(/manquant/);
  });

  it('rejette une ligne sans client ni téléphone', () => {
    const [r] = interpretRows([row({ 'Code Client': '', 'Téléphone': '' })], detected, ctx);
    expect(r.isValid).toBe(false);
  });

  it('rejette le doublon d\'un ticket dans le même fichier', () => {
    const rows = interpretRows([row(), row({ 'Nom Abonné': 'Autre' })], detected, ctx);
    expect(rows[0].isValid).toBe(true);
    expect(rows[1].isValid).toBe(false);
    expect(rows[1].rejectionReason).toMatch(/ligne 2/);
  });

  it('rejette une date illisible au lieu de mettre l\'heure actuelle', () => {
    const [r] = interpretRows([row({ 'Date': 'hier' })], detected, ctx);
    expect(r.isValid).toBe(false);
    expect(r.rejectionReason).toMatch(/Date d'enregistrement illisible/);
  });

  it('utilise l\'heure d\'import si la date est vide', () => {
    const [r] = interpretRows([row({ 'Date': '' })], detected, ctx);
    expect(r.isValid).toBe(true);
    expect(r.registeredAt).toBe('2026-10-15T10:00:00.000Z');
  });

  it('rejette une ligne d\'un autre secteur', () => {
    const [r] = interpretRows([row({ 'Zone MSAN': 'Agdal' })], detected, ctx);
    expect(r.isValid).toBe(false);
    expect(r.rejectionReason).toMatch(/\[Rabat\]/);
  });

  it('lit et uniformise le numéro de splitter (vide = pas de splitter)', () => {
    const withSplitter = detectHeaders(['N° Réclamation', 'Code Client', 'Zone MSAN', 'Splitter']);
    const rows = interpretRows(
      [
        { 'N° Réclamation': 'R1', 'Code Client': 'C1', 'Zone MSAN': 'Maarif Centre', 'Splitter': ' sp-12 ' },
        { 'N° Réclamation': 'R2', 'Code Client': 'C2', 'Zone MSAN': 'Maarif Centre', 'Splitter': '' },
        { 'N° Réclamation': 'R3', 'Code Client': 'C3', 'Zone MSAN': 'Maarif Centre', 'Splitter': '-' },
      ],
      withSplitter,
      ctx
    );
    expect(rows.map(r => r.splitterRef)).toEqual(['SP-12', undefined, undefined]);
    expect(rows.every(r => r.isValid)).toBe(true);
  });

  it('accepte une zone inconnue (le ticket ira en « zone à rattacher »)', () => {
    const [r] = interpretRows([row({ 'Zone MSAN': 'MSAN-INCONNU' })], detected, ctx);
    expect(r.isValid).toBe(true);
    expect(r.resolvedZoneId).toBeUndefined();
  });
});
