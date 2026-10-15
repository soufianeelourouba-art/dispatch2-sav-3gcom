import * as XLSX from 'xlsx';
import { ImportReport, RejectedRow, Ticket, TechnicalZone, ZoneAlias } from '../types';
import { store } from './storage';

// Flexible column matching dictionary
const COLUMN_ALIASES = {
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
  registeredAt: [
    'date d\'enregistrement', 'date enregistrement', 'date réclamation', 'date reclamation',
    'date création', 'date creation', 'date', 'date heure', 'date ouverture', 'horodatage'
  ],
};

function normalizeHeader(header: string): string {
  return header
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]/g, ' ');
}

export interface DetectedColumns {
  ticketNumberCol?: string;
  clientNumberCol?: string;
  clientNameCol?: string;
  clientPhoneCol?: string;
  clientAddressCol?: string;
  zoneTextCol?: string;
  registeredAtCol?: string;
}

export interface InterpretedRow {
  rowNumber: number;
  ticketNumber: string;
  clientNumber: string;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  rawZoneText: string;
  resolvedZoneId?: string;
  resolvedZoneLabel?: string;
  resolvedSectorId?: string;
  resolvedSectorName?: string;
  registeredAt: string;
  isValid: boolean;
  rejectionReason?: string;
}

export function detectHeaders(rawHeaders: string[]): DetectedColumns {
  const result: DetectedColumns = {};

  rawHeaders.forEach(origHeader => {
    const normalized = normalizeHeader(origHeader);

    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if ((result as any)[key + 'Col']) continue;

      for (const alias of aliases) {
        const normAlias = normalizeHeader(alias);
        if (normalized === normAlias || normalized.includes(normAlias) || normAlias.includes(normalized)) {
          (result as any)[key + 'Col'] = origHeader;
          break;
        }
      }
    }
  });

  return result;
}

export function parseExcelBuffer(
  buffer: ArrayBuffer,
  targetSectorId: string
): {
  targetSectorName: string;
  detectedColumns: DetectedColumns;
  headers: string[];
  totalRawRows: number;
  previewRows: InterpretedRow[];
  executeImport: () => ImportReport;
} {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON array of objects
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (rawRows.length === 0) {
    throw new Error('Le fichier Excel est vide ou ne contient aucune ligne de données.');
  }

  const headers = Object.keys(rawRows[0]);
  const detected = detectHeaders(headers);

  const allSectors = store.getSectors();
  const allZones = store.getTechnicalZones();
  const allAliases = store.getZoneAliases();

  const targetSector = allSectors.find(s => s.id === targetSectorId);
  const targetSectorName = targetSector ? targetSector.name : 'Secteur indéfini';
  
  // Zones appartenant strictement au secteur sélectionné
  const sectorZones = allZones.filter(z => z.sectorId === targetSectorId);
  const sectorZoneIds = new Set(sectorZones.map(z => z.id));

  // Helper to match raw zone to a zone of the selected sector
  function resolveZoneForSector(raw: string): { 
    zoneId?: string; 
    zoneLabel?: string; 
    isCrossSector?: boolean;
    crossSectorName?: string;
  } {
    if (!raw) return {};
    const cleanRaw = raw.trim().toUpperCase();

    // 1. Direct match on zones in this target sector
    const directSectorMatch = sectorZones.find(
      z => z.label.toUpperCase() === cleanRaw || z.msanCode.toUpperCase() === cleanRaw
    );
    if (directSectorMatch) {
      return {
        zoneId: directSectorMatch.id,
        zoneLabel: directSectorMatch.label,
      };
    }

    // 2. Match on aliases pointing to a zone in this sector
    const aliasMatch = allAliases.find(a => a.rawLabel.toUpperCase() === cleanRaw);
    if (aliasMatch && sectorZoneIds.has(aliasMatch.technicalZoneId)) {
      const matchedZone = sectorZones.find(z => z.id === aliasMatch.technicalZoneId);
      if (matchedZone) {
        return {
          zoneId: matchedZone.id,
          zoneLabel: matchedZone.label,
        };
      }
    }

    // 3. Check if the raw text actually belongs to ANOTHER sector (cross-sector violation)
    const otherZone = allZones.find(
      z => z.sectorId !== targetSectorId && (z.label.toUpperCase() === cleanRaw || z.msanCode.toUpperCase() === cleanRaw)
    );
    if (otherZone) {
      const otherSec = allSectors.find(s => s.id === otherZone.sectorId);
      return {
        isCrossSector: true,
        crossSectorName: otherSec ? otherSec.name : 'Autre secteur',
      };
    }

    // Check alias pointing to another sector
    if (aliasMatch && !sectorZoneIds.has(aliasMatch.technicalZoneId)) {
      const otherTargetZone = allZones.find(z => z.id === aliasMatch.technicalZoneId);
      const otherSec = otherTargetZone ? allSectors.find(s => s.id === otherTargetZone.sectorId) : null;
      return {
        isCrossSector: true,
        crossSectorName: otherSec ? otherSec.name : 'Autre secteur',
      };
    }

    return {};
  }

  // Interpret all rows
  const interpretedRows: InterpretedRow[] = rawRows.map((row, idx) => {
    const rowNum = idx + 2; // +1 for 0-index, +1 for header line
    const ticketNumber = detected.ticketNumberCol ? String(row[detected.ticketNumberCol]).trim() : '';
    const clientNumber = detected.clientNumberCol ? String(row[detected.clientNumberCol]).trim() : '';
    const clientName = detected.clientNameCol ? String(row[detected.clientNameCol]).trim() : 'Client 3GCOM';
    const clientPhone = detected.clientPhoneCol ? String(row[detected.clientPhoneCol]).trim() : '';
    const clientAddress = detected.clientAddressCol ? String(row[detected.clientAddressCol]).trim() : '';
    const rawZoneText = detected.zoneTextCol ? String(row[detected.zoneTextCol]).trim() : '';
    const rawDate = detected.registeredAtCol ? row[detected.registeredAtCol] : '';

    let formattedDate = new Date().toISOString();
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        formattedDate = parsed.toISOString();
      }
    }

    // Validation checks
    let isValid = true;
    let rejectionReason: string | undefined;

    if (!ticketNumber) {
      isValid = false;
      rejectionReason = 'Numéro de réclamation/ticket manquant';
    } else if (!clientNumber && !clientPhone) {
      isValid = false;
      rejectionReason = 'Identifiant client et numéro de téléphone absents';
    }

    const { zoneId, zoneLabel, isCrossSector, crossSectorName } = resolveZoneForSector(rawZoneText);

    if (isCrossSector) {
      isValid = false;
      rejectionReason = `Zone "${rawZoneText}" appartient à [${crossSectorName}], hors du secteur choisi [${targetSectorName}]. Fichier réservé au secteur ${targetSectorName}.`;
    }

    return {
      rowNumber: rowNum,
      ticketNumber,
      clientNumber: clientNumber || 'N/A',
      clientName,
      clientPhone,
      clientAddress,
      rawZoneText: rawZoneText || 'NON_SPECIFIE',
      resolvedZoneId: zoneId,
      resolvedZoneLabel: zoneLabel,
      resolvedSectorId: targetSectorId,
      resolvedSectorName: targetSectorName,
      registeredAt: formattedDate,
      isValid,
      rejectionReason,
    };
  });

  const previewRows = interpretedRows.slice(0, 10);

  // Function to execute the real import into storage
  const executeImport = (): ImportReport => {
    let importedCount = 0;
    let updatedVisitsCount = 0;
    let unmappedZoneCount = 0;
    const rejectedRows: RejectedRow[] = [];

    interpretedRows.forEach((item, index) => {
      if (!item.isValid) {
        rejectedRows.push({
          rowNumber: item.rowNumber,
          data: rawRows[index],
          reason: item.rejectionReason || 'Ligne invalide',
        });
        return;
      }

      if (!item.resolvedZoneId) {
        unmappedZoneCount++;
      }

      const result = store.upsertTicket({
        ticketNumber: item.ticketNumber,
        clientNumber: item.clientNumber,
        clientName: item.clientName,
        clientPhone: item.clientPhone,
        clientAddress: item.clientAddress,
        rawZoneText: item.rawZoneText,
        technicalZoneId: item.resolvedZoneId,
        sectorId: targetSectorId,
        registeredAt: item.registeredAt,
        visitCount: 1,
      });

      if (result.isNew) {
        importedCount++;
      } else {
        updatedVisitsCount++;
      }
    });

    return {
      totalRowsProcessed: interpretedRows.length,
      importedCount,
      updatedVisitsCount,
      rejectedCount: rejectedRows.length,
      unmappedZoneCount,
      rejectedRows,
      timestamp: new Date().toISOString(),
    };
  };

  return {
    targetSectorName,
    detectedColumns: detected,
    headers,
    totalRawRows: rawRows.length,
    previewRows,
    executeImport,
  };
}

// Generates a mock sample Excel workbook for immediate testing per sector
export function generateSampleExcelFile(targetSectorId?: string): Uint8Array {
  const sectors = store.getSectors();
  const zones = store.getTechnicalZones();

  const selectedSector = targetSectorId 
    ? sectors.find(s => s.id === targetSectorId) || sectors[0]
    : sectors[0];

  const sectorZones = zones.filter(z => z.sectorId === selectedSector?.id);
  const zoneList = sectorZones.length > 0 
    ? sectorZones 
    : [{ label: 'Zone Principale', msanCode: 'MSAN-01' }];

  const z1 = zoneList[0]?.label || 'Zone 1';
  const z2 = zoneList[1]?.label || z1;
  const z3 = zoneList[2]?.label || z1;

  const data = [
    {
      'N° Réclamation': `REC-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      'Code Client': 'ABN-3G-77102',
      'Nom Abonné': 'Karim Bensouda',
      'Téléphone': '06 61 22 33 44',
      'Adresse Client': `Résidence Al Mansour, ${z1}`,
      'Zone MSAN': z1,
      'Date Enregistrement': '2026-10-14 08:30',
    },
    {
      'N° Réclamation': `REC-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      'Code Client': 'ABN-3G-77105',
      'Nom Abonné': 'Salma Tazi',
      'Téléphone': '06 62 33 44 55',
      'Adresse Client': `Avenue Mohammed V, ${z2}`,
      'Zone MSAN': z2,
      'Date Enregistrement': '2026-10-14 08:45',
    },
    {
      'N° Réclamation': `REC-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      'Code Client': 'ABN-3G-77109',
      'Nom Abonné': 'Société Atlas Telecom',
      'Téléphone': '05 22 40 11 22',
      'Adresse Client': `Bd Hassan II, ${z3}`,
      'Zone MSAN': z3,
      'Date Enregistrement': '2026-10-14 09:00',
    },
    {
      'N° Réclamation': `REC-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      'Code Client': 'ABN-3G-88219',
      'Nom Abonné': 'Driss El Kettani (Deuxième visite)',
      'Téléphone': '06 61 45 88 12',
      'Adresse Client': `Immeuble 4B, ${z1}`,
      'Zone MSAN': z1,
      'Date Enregistrement': '2026-10-14 09:15',
    },
    {
      'N° Réclamation': `REC-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      'Code Client': 'ABN-3G-77120',
      'Nom Abonné': 'Mehdi Chraibi',
      'Téléphone': '06 64 77 88 99',
      'Adresse Client': `Quartier Administratif, ${z2}`,
      'Zone MSAN': z2,
      'Date Enregistrement': '2026-10-14 09:30',
    },
    {
      // Ligne invalide volontaire pour tester le rapport de rejet
      'N° Réclamation': '', // Ticket vide
      'Code Client': 'ABN-ERR-001',
      'Nom Abonné': 'Ligne Sans Numéro Ticket',
      'Téléphone': '06 00 00 00 00',
      'Adresse Client': 'Adresse test',
      'Zone MSAN': z1,
      'Date Enregistrement': '2026-10-14 09:35',
    },
    {
      // Ligne avec zone non répertoriée pour tester la file "Zone à rattacher"
      'N° Réclamation': `REC-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      'Code Client': 'ABN-3G-77133',
      'Nom Abonné': 'Younes Berrada',
      'Téléphone': '06 65 11 22 33',
      'Adresse Client': 'Nouvelle Extension Urbaine',
      'Zone MSAN': 'MSAN-NOUVELLE-EXTENSION',
      'Date Enregistrement': '2026-10-14 09:40',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `SAV_${selectedSector?.code || '3GCOM'}`);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
