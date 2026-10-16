// Work declared by the technician after an NF: what 3GCOM pays the technician for and bills.
// The NF (operation) and the declaration (prestation) are separate steps: the ticket is closed
// on site, the prestation can be declared right after or later ("À déclarer").
// Pure module, shared by the forms (browser) and the server (api/).

export type PrestationCode = 'FO_01_02' | 'FO_04' | 'FO_08' | 'FO_32';

export const PRESTATIONS: { code: PrestationCode; label: string; withRaccordements?: boolean }[] = [
  { code: 'FO_01_02', label: '01-02 FO', withRaccordements: true },
  { code: 'FO_04', label: '04 FO' },
  { code: 'FO_08', label: '08 FO' },
  { code: 'FO_32', label: '32 FO (splitter)' },
];

export const MAX_RACCORDEMENTS = 4;

export const LIMITS = {
  joints: 50,
  splitters: 20,
  cableMeters: 3000,
  photosPerKind: 4,
};

export interface MaterialsInstalled {
  joints: number;
  splitters: number;
  cableMeters: number;
}

export type PhotoKind = 'MATERIAL' | 'SERIAL';

export interface PrestationDeclaration {
  code: PrestationCode;
  raccordements?: number; // only for 01-02 FO (1 to 4)
  materials: MaterialsInstalled;
  photoIds: string[];
  declaredAt: string;
  declaredBy: string;
}

// À déclarer → Déclarée. For a splitter incident the prestation is paid once: the other tickets
// closed with it are "Incluse" and point to the ticket carrying the declaration.
export type PrestationStatus = 'A_DECLARER' | 'DECLAREE' | 'INCLUSE';

export function prestationLabel(code?: PrestationCode): string {
  return PRESTATIONS.find(p => p.code === code)?.label || '—';
}

export function hasMaterials(m: MaterialsInstalled): boolean {
  return m.joints > 0 || m.splitters > 0 || m.cableMeters > 0;
}

export function describeMaterials(m: MaterialsInstalled): string {
  const parts = [
    m.joints > 0 ? `${m.joints} joint${m.joints > 1 ? 's' : ''}` : '',
    m.splitters > 0 ? `${m.splitters} splitter${m.splitters > 1 ? 's' : ''}` : '',
    m.cableMeters > 0 ? `${m.cableMeters} m de câble` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Aucun matériel';
}

// ONT serial numbers: letters and digits, 8 to 24 characters (e.g. ALCLB1234567, HWTC12345678).
export function normalizeSerial(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidSerial(serial: string): boolean {
  return /^[A-Z0-9]{8,24}$/.test(normalizeSerial(serial));
}

export interface DeclarationInput {
  code?: string;
  raccordements?: number;
  materials?: Partial<MaterialsInstalled>;
  materialPhotoCount: number;
}

const isWholeNumber = (n: unknown, max: number) =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;

// Returns the list of problems (empty = valid). Messages are shown as is to the technician.
export function validateDeclaration(input: DeclarationInput): string[] {
  const errors: string[] = [];
  const prestation = PRESTATIONS.find(p => p.code === input.code);
  if (!prestation) {
    errors.push('Choisissez la prestation réalisée.');
  } else if (prestation.withRaccordements) {
    if (!isWholeNumber(input.raccordements, MAX_RACCORDEMENTS) || !input.raccordements) {
      errors.push(`Indiquez le nombre de raccordements (1 à ${MAX_RACCORDEMENTS}).`);
    }
  }

  const m = { joints: 0, splitters: 0, cableMeters: 0, ...input.materials };
  if (!isWholeNumber(m.joints, LIMITS.joints)) errors.push(`Nombre de joints invalide (0 à ${LIMITS.joints}).`);
  if (!isWholeNumber(m.splitters, LIMITS.splitters)) errors.push(`Nombre de splitters invalide (0 à ${LIMITS.splitters}).`);
  if (!isWholeNumber(m.cableMeters, LIMITS.cableMeters)) errors.push(`Longueur de câble invalide (0 à ${LIMITS.cableMeters} m).`);
  if (hasMaterials(m) && input.materialPhotoCount < 1) {
    errors.push('Prenez au moins une photo du matériel installé.');
  }
  if (input.materialPhotoCount > LIMITS.photosPerKind) errors.push(`${LIMITS.photosPerKind} photos maximum.`);
  return errors;
}

// NF "config centrale": the ONT serial number and a photo of its label are required.
export function validateConfigNf(serial: string | undefined, serialPhotoCount: number): string[] {
  const errors: string[] = [];
  if (!serial || !isValidSerial(serial)) errors.push('Saisissez le numéro de série de l\'ONT (8 à 24 lettres ou chiffres).');
  if (serialPhotoCount < 1) errors.push('Prenez la photo de l\'étiquette du numéro de série.');
  if (serialPhotoCount > LIMITS.photosPerKind) errors.push(`${LIMITS.photosPerKind} photos maximum.`);
  return errors;
}

// Ticket needing a declaration: closed in NF, not declared yet, not covered by a splitter lead.
export function needsDeclaration(ticket: { currentStatus: string; prestationStatus?: PrestationStatus }): boolean {
  return ticket.currentStatus === 'COMPLETED' && (ticket.prestationStatus === 'A_DECLARER' || ticket.prestationStatus === undefined);
}
