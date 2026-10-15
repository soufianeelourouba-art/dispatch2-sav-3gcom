// Pure interpretation of an imported claims file (rows already read from Excel/CSV).
// No Firebase or XLSX dependency, so every rule here is unit-tested.
import type { Sector, TechnicalZone, ZoneAlias } from '../types';
import { moroccoOffsetMs, moroccoToUtc } from './moroccoTime';
import { normalizeSplitterRef } from './splitter';

export const COLUMN_ALIASES = {
  ticketNumber: [
    'n° réclam.', 'n° reclam', 'n° réclamation', 'numero reclamation', 'num reclamation',
    'ticket', 'n° ticket', 'num ticket', 'reference', 'ref ticket', 'id reclamation',
    'n° de réclamation', 'numero de ticket', 'code réclamation', 'code reclamation'
  ],
  clientNumber: [
    'numéro client', 'numero client', 'n° client', 'num client', 'code client',
    'id client', 'identifiant client', 'abonne', 'abonné', 'n° abonné', 'code abonné'
  ],
  clientName: [
    'nom client', 'nom abonné', 'nom abonne', 'client', 'nom du client', 'titulaire',
    'nom et prénom', 'nom prénom', 'abonne nom', 'raison sociale'
  ],
  clientPhone: [
    'téléphone', 'telephone', 'tel', 'gsm', 'mobile', 'tel client', 'numéro tel',
    'num tel', 'contact', 'tel contact', 'téléphone client'
  ],
  clientAddress: [
    'adresse', 'adresse client', 'adresse d\'installation', 'adresse installation',
    'localisation', 'domicile', 'lieu', 'adresse complète', 'quartier'
  ],
  zoneText: [
    'zone technique', 'zone', 'msan', 'repartiteur', 'répartiteur', 'zone msan',
    'central', 'secteur technique', 'msan code', 'nom msan', 'zone intervention'
  ],
  splitter: [
    'splitter', 'n° splitter', 'num splitter', 'numero splitter', 'numéro splitter', 'code splitter',
    'ref splitter', 'référence splitter', 'id splitter', 'splitter id', 'coupleur', 'n° coupleur'
  ],
  registeredAt: [
    'date d\'enregistrement', 'date enregistrement', 'date réclamation', 'date reclamation',
    'date création', 'date creation', 'date', 'date heure', 'date ouverture', 'horodatage'
  ],
};

type ColumnField = keyof typeof COLUMN_ALIASES;

export interface DetectedColumns {
  ticketNumberCol?: string;
  clientNumberCol?: string;
  clientNameCol?: string;
  clientPhoneCol?: string;
  clientAddressCol?: string;
  zoneTextCol?: string;
  splitterCol?: string;
  registeredAtCol?: string;
}

export function normalizeHeader(header: string): string {
  return header
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// How well a column header matches an alias: exact > header contains the alias as whole
// words (longer aliases win) > alias contains the header.
function matchScore(header: string, alias: string): number {
  if (!header || !alias) return 0;
  if (header === alias) return 1000;
  if (` ${header} `.includes(` ${alias} `)) return 100 + alias.length;
  if (` ${alias} `.includes(` ${header} `)) return 10 + header.length;
  return 0;
}

// Each column is used for at most one field, and each field gets its best-matching column
// (e.g. "Code Client" is the client number, never the client name).
export function detectHeaders(rawHeaders: string[]): DetectedColumns {
  const candidates: { field: ColumnField; header: string; score: number }[] = [];
  rawHeaders.forEach(header => {
    const normalized = normalizeHeader(header);
    (Object.keys(COLUMN_ALIASES) as ColumnField[]).forEach(field => {
      const score = Math.max(...COLUMN_ALIASES[field].map(alias => matchScore(normalized, normalizeHeader(alias))));
      if (score > 0) candidates.push({ field, header, score });
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  const result: DetectedColumns = {};
  const usedHeaders = new Set<string>();
  candidates.forEach(({ field, header }) => {
    const key = `${field}Col` as keyof DetectedColumns;
    if (result[key] || usedHeaders.has(header)) return;
    result[key] = header;
    usedHeaders.add(header);
  });
  return result;
}

// --- Dates: file values are wall-clock times in Morocco ---

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * Converts a "date d'enregistrement" cell to an ISO UTC string.
 * Accepts Excel serial numbers, dd/mm/yyyy [hh:mm[:ss]], yyyy-mm-dd [hh:mm[:ss]],
 * ISO strings with a time zone and Date objects. Returns null when unreadable.
 */
export function parseRegisteredAt(value: unknown): string | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString();

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial: days since 1899-12-30, fractional part = time of day (Morocco wall clock)
    if (value < 1 || value > 100000) return null;
    const wall = new Date(EXCEL_EPOCH_UTC + Math.round(value * 86400) * 1000);
    return moroccoToUtc(
      wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate(),
      wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds()
    ).toISOString();
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  // ISO with explicit zone: already unambiguous
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const d = new Date(text);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const time = '(?:[ T]+(\\d{1,2})[:hH](\\d{2})(?::(\\d{2}))?)?';
  const dmy = text.match(new RegExp(`^(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2}|\\d{4})${time}$`));
  const ymd = text.match(new RegExp(`^(\\d{4})[/.-](\\d{1,2})[/.-](\\d{1,2})${time}$`));
  let y: number, mo: number, d: number, h: number, mi: number, s: number;
  if (dmy) {
    [d, mo, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    if (y < 100) y += 2000;
    [h, mi, s] = [Number(dmy[4] || 0), Number(dmy[5] || 0), Number(dmy[6] || 0)];
  } else if (ymd) {
    [y, mo, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    [h, mi, s] = [Number(ymd[4] || 0), Number(ymd[5] || 0), Number(ymd[6] || 0)];
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const result = moroccoToUtc(y, mo, d, h, mi, s);
  // Rejects impossible days such as 31/02 (Date would silently roll over)
  const check = new Date(result.getTime() + moroccoOffsetMs(result.getTime()));
  if (check.getUTCDate() !== d || check.getUTCMonth() + 1 !== mo) return null;
  return result.toISOString();
}

// Moroccan numbers stored as numeric cells lose their leading zero (0661… → 661…).
export function normalizePhone(value: unknown): string {
  const text = String(value ?? '').trim();
  return /^[5-7]\d{8}$/.test(text) ? `0${text}` : text;
}

// --- Row interpretation ---

export interface ImportContext {
  targetSectorId: string;
  sectors: Sector[];
  zones: TechnicalZone[];
  aliases: ZoneAlias[];
  now?: Date;
}

export interface InterpretedRow {
  rowNumber: number;
  ticketNumber: string;
  clientNumber: string;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  rawZoneText: string;
  splitterRef?: string;
  resolvedZoneId?: string;
  resolvedZoneLabel?: string;
  resolvedSectorId?: string;
  resolvedSectorName?: string;
  registeredAt: string;
  isValid: boolean;
  rejectionReason?: string;
}

interface ZoneResolution {
  zoneId?: string;
  zoneLabel?: string;
  crossSectorName?: string;
}

export function resolveZone(raw: string, ctx: ImportContext): ZoneResolution {
  if (!raw) return {};
  const cleanRaw = raw.trim().toUpperCase();
  const matches = (z: TechnicalZone) => z.label.toUpperCase() === cleanRaw || z.msanCode.toUpperCase() === cleanRaw;
  const sectorName = (sectorId?: string) => ctx.sectors.find(s => s.id === sectorId)?.name || 'Autre secteur';

  // 1. Zone label or MSAN code of the selected sector
  const direct = ctx.zones.find(z => z.sectorId === ctx.targetSectorId && matches(z));
  if (direct) return { zoneId: direct.id, zoneLabel: direct.label };

  // 2. Known alias
  const alias = ctx.aliases.find(a => a.rawLabel.trim().toUpperCase() === cleanRaw);
  const aliasZone = alias ? ctx.zones.find(z => z.id === alias.technicalZoneId) : undefined;
  if (aliasZone && aliasZone.sectorId === ctx.targetSectorId) {
    return { zoneId: aliasZone.id, zoneLabel: aliasZone.label };
  }

  // 3. The zone exists but belongs to another sector
  const other = ctx.zones.find(z => z.sectorId !== ctx.targetSectorId && matches(z));
  if (other) return { crossSectorName: sectorName(other.sectorId) };
  if (aliasZone) return { crossSectorName: sectorName(aliasZone.sectorId) };

  return {};
}

export function interpretRows(
  rawRows: Record<string, unknown>[],
  detected: DetectedColumns,
  ctx: ImportContext
): InterpretedRow[] {
  const targetSectorName = ctx.sectors.find(s => s.id === ctx.targetSectorId)?.name || 'Secteur indéfini';
  const importTime = (ctx.now || new Date()).toISOString();
  const firstRowOfTicket = new Map<string, number>();
  const cell = (row: Record<string, unknown>, col?: string) => (col ? String(row[col] ?? '').trim() : '');

  return rawRows.map((row, idx) => {
    const rowNumber = idx + 2; // +1 for 0-index, +1 for header line
    const ticketNumber = cell(row, detected.ticketNumberCol);
    const clientNumber = cell(row, detected.clientNumberCol);
    const clientName = cell(row, detected.clientNameCol) || 'Client 3GCOM';
    const clientPhone = detected.clientPhoneCol ? normalizePhone(row[detected.clientPhoneCol]) : '';
    const clientAddress = cell(row, detected.clientAddressCol);
    const rawZoneText = cell(row, detected.zoneTextCol);
    const splitterRef = detected.splitterCol ? normalizeSplitterRef(row[detected.splitterCol]) : undefined;
    const rawDate = detected.registeredAtCol ? row[detected.registeredAtCol] : '';

    let isValid = true;
    let rejectionReason: string | undefined;
    const reject = (reason: string) => {
      if (isValid) {
        isValid = false;
        rejectionReason = reason;
      }
    };

    if (!ticketNumber) reject('Numéro de réclamation/ticket manquant');
    else if (!clientNumber && !clientPhone) reject('Identifiant client et numéro de téléphone absents');

    if (ticketNumber) {
      const firstRow = firstRowOfTicket.get(ticketNumber);
      if (firstRow !== undefined) reject(`Doublon dans le fichier : ticket déjà présent ligne ${firstRow}`);
      else firstRowOfTicket.set(ticketNumber, rowNumber);
    }

    // An empty date means "now"; an unreadable one must not silently reset the SLA.
    let registeredAt = importTime;
    if (rawDate !== '' && rawDate !== null && rawDate !== undefined) {
      const parsed = parseRegisteredAt(rawDate);
      if (parsed) registeredAt = parsed;
      else reject(`Date d'enregistrement illisible : "${String(rawDate)}" (format attendu JJ/MM/AAAA HH:MM)`);
    }

    const zone = resolveZone(rawZoneText, ctx);
    if (zone.crossSectorName) {
      reject(`Zone "${rawZoneText}" appartient à [${zone.crossSectorName}], hors du secteur choisi [${targetSectorName}]. Fichier réservé au secteur ${targetSectorName}.`);
    }

    return {
      rowNumber,
      ticketNumber,
      clientNumber: clientNumber || 'N/A',
      clientName,
      clientPhone,
      clientAddress,
      rawZoneText: rawZoneText || 'NON_SPECIFIE',
      splitterRef,
      resolvedZoneId: zone.zoneId,
      resolvedZoneLabel: zone.zoneLabel,
      resolvedSectorId: ctx.targetSectorId,
      resolvedSectorName: targetSectorName,
      registeredAt,
      isValid,
      rejectionReason,
    };
  });
}
