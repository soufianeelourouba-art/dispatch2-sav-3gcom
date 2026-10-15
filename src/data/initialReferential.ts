import type { DC, Sector, TechnicalZone, ZoneAlias, Technician, Ticket, TicketEvent } from '../types';

// --- 1. Directions Centrales / Régionales (DC) ---
export const INITIAL_DCS: DC[] = [
  {
    id: 'dc-casa',
    code: 'DC-CASA',
    name: 'Direction Régionale Grand Casablanca',
    description: 'Délégation régionale Casablanca, Mohammedia et périphérie',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'dc-rabat',
    code: 'DC-RABAT',
    name: 'Direction Régionale Rabat - Salé - Kénitra',
    description: 'Rabat, Salé, Témara, Skhirat et Kénitra',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'dc-nord',
    code: 'DC-NORD',
    name: 'Direction Régionale Nord (Tanger - Tétouan)',
    description: 'Tanger Médina, Tétouan, Larache et côte nord',
    createdAt: '2026-01-01T08:00:00Z',
  },
];

// --- 2. Secteurs Géographiques (Appartiennent à une DC) ---
export const INITIAL_SECTORS: Sector[] = [
  {
    id: 'sec-cas-nord',
    dcId: 'dc-casa',
    code: 'CAS-NORD',
    name: 'Casablanca Nord',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'sec-cas-centre',
    dcId: 'dc-casa',
    code: 'CAS-CENTRE',
    name: 'Casablanca Centre & Anfa',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'sec-cas-sud',
    dcId: 'dc-casa',
    code: 'CAS-SUD',
    name: 'Casablanca Sud & Oasis',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'sec-rab-sale',
    dcId: 'dc-rabat',
    code: 'RAB-SALE',
    name: 'Rabat - Salé',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'sec-tng-tet',
    dcId: 'dc-nord',
    code: 'TNG-TET',
    name: 'Tanger - Tétouan',
    createdAt: '2026-01-01T08:00:00Z',
  },
];

// Les comptes (orienteurs, managers) sont créés dans Firebase Authentication,
// jamais dans le code source.

// --- 4. Zones d'Intervention Techniques (Appartiennent à un Secteur) ---
export const INITIAL_TECHNICAL_ZONES: TechnicalZone[] = [
  // Secteur Casablanca Nord
  {
    id: 'tz-cas-01',
    sectorId: 'sec-cas-nord',
    dcId: 'dc-casa',
    msanCode: 'MSAN-BERN-01',
    label: 'Sidi Bernoussi',
    description: 'Zone Al Qods / Mansouria',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-cas-02',
    sectorId: 'sec-cas-nord',
    dcId: 'dc-casa',
    msanCode: 'MSAN-SEBAA-02',
    label: 'Aïn Sebaâ',
    description: 'Bd Chefchaouni / Mimosa',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-cas-03',
    sectorId: 'sec-cas-nord',
    dcId: 'dc-casa',
    msanCode: 'MSAN-RN-01',
    label: 'Roches Noires',
    description: 'Bd Emile Zola / Gare Casa-Voyageurs',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-cas-04',
    sectorId: 'sec-cas-nord',
    dcId: 'dc-casa',
    msanCode: 'MSAN-BELV-03',
    label: 'Belvédère',
    description: 'Place Al Yassir',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-cas-05',
    sectorId: 'sec-cas-nord',
    dcId: 'dc-casa',
    msanCode: 'MSAN-SMOUM-01',
    label: 'Sidi Moumen',
    description: 'Al Azhar / Hay Al Baraka',
    createdAt: '2026-01-01T08:00:00Z',
  },

  // Secteur Casablanca Centre
  {
    id: 'tz-cas-c01',
    sectorId: 'sec-cas-centre',
    dcId: 'dc-casa',
    msanCode: 'MSAN-MAAR-01',
    label: 'Maârif Centre',
    description: 'Bd Bir Anzarane / Massira',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-cas-c02',
    sectorId: 'sec-cas-centre',
    dcId: 'dc-casa',
    msanCode: 'MSAN-GAUTH-02',
    label: 'Gauthier / Racine',
    description: 'Bd d\'Anfa / Bd Zerktouni',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-cas-c03',
    sectorId: 'sec-cas-centre',
    dcId: 'dc-casa',
    msanCode: 'MSAN-BOURG-03',
    label: 'Bourgogne Ouest',
    description: 'Bd de la Corniche / Bourgogne',
    createdAt: '2026-01-01T08:00:00Z',
  },

  // Secteur Rabat - Salé
  {
    id: 'tz-rab-01',
    sectorId: 'sec-rab-sale',
    dcId: 'dc-rabat',
    msanCode: 'MSAN-AGDAL-01',
    label: 'Agdal Centre',
    description: 'Fal Ould Oumeir / Av. de France',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-rab-02',
    sectorId: 'sec-rab-sale',
    dcId: 'dc-rabat',
    msanCode: 'MSAN-RIAD-02',
    label: 'Hay Riad',
    description: 'Secteurs 1-12 Mahaj Riad',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-rab-03',
    sectorId: 'sec-rab-sale',
    dcId: 'dc-rabat',
    msanCode: 'MSAN-TABR-03',
    label: 'Salé Tabriquet',
    description: 'Bd Mohammed V / Tabriquet',
    createdAt: '2026-01-01T08:00:00Z',
  },

  // Secteur Tanger - Tétouan
  {
    id: 'tz-tng-01',
    sectorId: 'sec-tng-tet',
    dcId: 'dc-nord',
    msanCode: 'MSAN-MALAB-01',
    label: 'Tanger Malabata',
    description: 'Baie de Tanger / Malabata',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tz-tng-02',
    sectorId: 'sec-tng-tet',
    dcId: 'dc-nord',
    msanCode: 'MSAN-TET-01',
    label: 'Tétouan Centre',
    description: 'Wilaya / Centre ville Tétouan',
    createdAt: '2026-01-01T08:00:00Z',
  },
];

// --- 5. Alias de Zones Techniques pour tolérance import Excel ---
export const INITIAL_ZONE_ALIASES: ZoneAlias[] = [
  { id: 'za-1', rawLabel: 'SIDI BERNOUSSI', technicalZoneId: 'tz-cas-01' },
  { id: 'za-2', rawLabel: 'Bernoussi', technicalZoneId: 'tz-cas-01' },
  { id: 'za-3', rawLabel: 'MSAN-BERN-01', technicalZoneId: 'tz-cas-01' },
  { id: 'za-6', rawLabel: 'AIN SEBAA', technicalZoneId: 'tz-cas-02' },
  { id: 'za-7', rawLabel: 'Ain Sebaa', technicalZoneId: 'tz-cas-02' },
  { id: 'za-8', rawLabel: 'Ain-Sebaa', technicalZoneId: 'tz-cas-02' },
  { id: 'za-11', rawLabel: 'ROCHES NOIRES', technicalZoneId: 'tz-cas-03' },
  { id: 'za-14', rawLabel: 'BELVEDERE', technicalZoneId: 'tz-cas-04' },
  { id: 'za-15', rawLabel: 'SIDI MOUMEN', technicalZoneId: 'tz-cas-05' },
  { id: 'za-16', rawLabel: 'MAARIF', technicalZoneId: 'tz-cas-c01' },
  { id: 'za-17', rawLabel: 'GAUTHIER', technicalZoneId: 'tz-cas-c02' },
  { id: 'za-18', rawLabel: 'RACINE', technicalZoneId: 'tz-cas-c02' },
  { id: 'za-19', rawLabel: 'BOURGOGNE', technicalZoneId: 'tz-cas-c03' },
  { id: 'za-20', rawLabel: 'AGDAL', technicalZoneId: 'tz-rab-01' },
  { id: 'za-24', rawLabel: 'HAY RIAD', technicalZoneId: 'tz-rab-02' },
  { id: 'za-25', rawLabel: 'TABRIQUET', technicalZoneId: 'tz-rab-03' },
  { id: 'za-30', rawLabel: 'MALABATA', technicalZoneId: 'tz-tng-01' },
];

// --- 6. Techniciens (Affectés à un secteur et plusieurs Zones d'intervention) ---
export const INITIAL_TECHNICIANS: Technician[] = [
  // Casablanca Nord
  {
    id: 'tech-cas-01',
    sectorId: 'sec-cas-nord',
    fullName: 'Hamid Khalid',
    normalizedName: 'hamid khalid',
    phone: '+212 661 123456',
    telegramChatId: '',
    zoneIds: ['tz-cas-01', 'tz-cas-02'], // Couvre Sidi Bernoussi et Aïn Sebaâ
    isActive: true,
    notes: 'Expert raccordement vertical et soudure',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tech-cas-03',
    sectorId: 'sec-cas-nord',
    fullName: 'Rachid Berrada',
    normalizedName: 'rachid berrada',
    phone: '+212 662 234567',
    telegramChatId: '',
    zoneIds: ['tz-cas-01', 'tz-cas-05'], // Partage Sidi Bernoussi et couvre Sidi Moumen
    isActive: true,
    notes: 'Autonome avec réflectomètre optique',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tech-cas-04',
    sectorId: 'sec-cas-nord',
    fullName: 'Tariq Mansouri',
    normalizedName: 'tariq mansouri',
    phone: '+212 663 345678',
    telegramChatId: '',
    zoneIds: ['tz-cas-02', 'tz-cas-03'], // Partage Aïn Sebaâ et couvre Roches Noires
    isActive: true,
    notes: 'Zone Roches Noires / Aïn Sebaâ',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tech-cas-05',
    sectorId: 'sec-cas-nord',
    fullName: 'Mehdi Naciri',
    normalizedName: 'mehdi naciri',
    phone: '+212 664 456789',
    telegramChatId: '',
    zoneIds: ['tz-cas-03', 'tz-cas-04'], // Partage Roches Noires et couvre Belvédère
    isActive: true,
    notes: 'Spécialiste Belvédère / Roches Noires',
    createdAt: '2026-01-01T08:00:00Z',
  },

  // Casablanca Centre
  {
    id: 'tech-cas-c01',
    sectorId: 'sec-cas-centre',
    fullName: 'Nabil Cherkaoui',
    normalizedName: 'nabil cherkaoui',
    phone: '+212 665 567890',
    telegramChatId: '',
    zoneIds: ['tz-cas-c01', 'tz-cas-c02'], // Maârif et Gauthier
    isActive: true,
    notes: 'Spécialiste Maârif / Centre',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'tech-cas-c02',
    sectorId: 'sec-cas-centre',
    fullName: 'Youssef Amrani',
    normalizedName: 'youssef amrani',
    phone: '+212 666 678901',
    telegramChatId: '',
    zoneIds: ['tz-cas-c01', 'tz-cas-c03'], // Maârif et Bourgogne
    isActive: true,
    notes: 'Polyvalent centre-ville et littoral',
    createdAt: '2026-01-01T08:00:00Z',
  },

  // Rabat - Salé
  {
    id: 'tech-rab-01',
    sectorId: 'sec-rab-sale',
    fullName: 'Adil Chaoui',
    normalizedName: 'adil chaoui',
    phone: '+212 667 789012',
    telegramChatId: '',
    zoneIds: ['tz-rab-01', 'tz-rab-02', 'tz-rab-03'], // Couvre Agdal, Hay Riad et Salé Tabriquet
    isActive: true,
    notes: 'Technicien référent Rabat',
    createdAt: '2026-01-01T08:00:00Z',
  },

  // Tanger - Tétouan
  {
    id: 'tech-tng-01',
    sectorId: 'sec-tng-tet',
    fullName: 'Bilal Mansour',
    normalizedName: 'bilal mansour',
    phone: '+212 668 890123',
    telegramChatId: '',
    zoneIds: ['tz-tng-01', 'tz-tng-02'], // Couvre Malabata et Tétouan
    isActive: true,
    notes: 'Technicien axe Tanger - Tétouan',
    createdAt: '2026-01-01T08:00:00Z',
  },
];

// Production Clean State: Empty tickets and events ready for real file imports
export const INITIAL_TICKETS: Ticket[] = [];

export const INITIAL_EVENTS: TicketEvent[] = [];
