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
    'central', 'secteur technique', 'msan code', 'nom msan'
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
  resolvedZoneLabel?: string;
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
  currentSectorId?: string
): {
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

  const zones = store.getTechnicalZones();
  const aliases = store.getZoneAliases();
  const sectors = store.getSectors();

  // Helper to match a raw zone string to a known technical zone
  function resolveZone(raw: string): { zoneId?: string; sectorId?: string; zoneLabel?: string; sectorName?: string } {
    if (!raw) return {};
    const cleanRaw = raw.trim().toUpperCase();

    // 1. Direct match on label or msanCode
    const directMatch = zones.find(
      z => z.label.toUpperCase() === cleanRaw || z.msanCode.toUpperCase() === cleanRaw
    );
    if (directMatch) {
      const sec = sectors.find(s => s.id === directMatch.sectorId);
      return {
        zoneId: directMatch.id,
        sectorId: directMatch.sectorId,
        zoneLabel: directMatch.label,
        sectorName: sec?.name,
      };
    }

    // 2. Match on aliases table
    const aliasMatch = aliases.find(a => a.rawLabel.toUpperCase() === cleanRaw);
    if (aliasMatch) {
      const targetZone = zones.find(z => z.id === aliasMatch.technicalZoneId);
      if (targetZone) {
        const sec = sectors.find(s => s.id === targetZone.sectorId);
        return {
          zoneId: targetZone.id,
          sectorId: targetZone.sectorId,
          zoneLabel: targetZone.label,
          sectorName: sec?.name,
        };
      }
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

    const { zoneId, sectorId, zoneLabel, sectorName } = resolveZone(rawZoneText);

    return {
      rowNumber: rowNum,
      ticketNumber,
      clientNumber: clientNumber || 'N/A',
      clientName,
      clientPhone,
      clientAddress,
      rawZoneText: rawZoneText || 'NON_SPECIFIE',
      resolvedZoneLabel: zoneLabel,
      resolvedSectorName: sectorName,
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

      const { zoneId, sectorId } = resolveZone(item.rawZoneText);
      const effectiveSectorId = sectorId || currentSectorId;

      if (!zoneId) {
        unmappedZoneCount++;
      }

      const result = store.upsertTicket({
        ticketNumber: item.ticketNumber,
        clientNumber: item.clientNumber,
        clientName: item.clientName,
        clientPhone: item.clientPhone,
        clientAddress: item.clientAddress,
        rawZoneText: item.rawZoneText,
        technicalZoneId: zoneId,
        sectorId: effectiveSectorId,
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
    detectedColumns: detected,
    headers,
    totalRawRows: rawRows.length,
    previewRows,
    executeImport,
  };
}

// Generates a mock sample Excel workbook for immediate testing (§3)
export function generateSampleExcelFile(): Uint8Array {
  const data = [
    {
      'N° Réclamation': 'REC-2026-9901',
      'Code Client': 'ABN-CAS-77102',
      'Nom Abonné': 'Karim Bensouda',
      'Téléphone': '06 61 22 33 44',
      'Adresse Client': '12 Bd Chefchaouni, Ain Sebaa',
      'Zone MSAN': 'Ain Sebaa',
      'Date Enregistrement': '2026-10-14 08:30',
    },
    {
      'N° Réclamation': 'REC-2026-9902',
      'Code Client': 'ABN-CAS-77105',
      'Nom Abonné': 'Salma Tazi',
      'Téléphone': '06 62 33 44 55',
      'Adresse Client': 'Résidence Al Mansour, Sidi Bernoussi',
      'Zone MSAN': 'SIDI BERNOUSSI',
      'Date Enregistrement': '2026-10-14 08:45',
    },
    {
      'N° Réclamation': 'REC-2026-9903',
      'Code Client': 'ABN-CAS-77109',
      'Nom Abonné': 'Société Atlas Telecom',
      'Téléphone': '05 22 40 11 22',
      'Adresse Client': '45 Bd Emile Zola, Roches Noires',
      'Zone MSAN': 'ROCHES NOIRES',
      'Date Enregistrement': '2026-10-14 09:00',
    },
    {
      'N° Réclamation': 'REC-2026-9904', // Deuxième visite pour tester la réintervention
      'Code Client': 'ABN-CAS-88219',
      'Nom Abonné': 'Driss El Kettani (Réclamation réouverte)',
      'Téléphone': '06 61 45 88 12',
      'Adresse Client': '42 Bd Chefchaouni, Aïn Sebaâ',
      'Zone MSAN': 'Ain-Sebaa',
      'Date Enregistrement': '2026-10-14 09:15',
    },
    {
      'N° Réclamation': 'REC-2026-9905',
      'Code Client': 'ABN-CAS-77120',
      'Nom Abonné': 'Mehdi Chraibi',
      'Téléphone': '06 64 77 88 99',
      'Adresse Client': 'Quartier Al Yassir, Belvédère',
      'Zone MSAN': 'BELVEDERE',
      'Date Enregistrement': '2026-10-14 09:30',
    },
    {
      // Ligne invalide volontaire pour tester le rapport des rejets (§3)
      'N° Réclamation': '', // Ticket vide
      'Code Client': 'ABN-ERR-001',
      'Nom Abonné': 'Ligne Corrompue Test',
      'Téléphone': '06 00 00 00 00',
      'Adresse Client': 'Adresse inconnue',
      'Zone MSAN': 'AIN SEBAA',
      'Date Enregistrement': '2026-10-14 09:35',
    },
    {
      // Ligne avec zone technique inconnue pour tester la file "zone à rattacher" (§4)
      'N° Réclamation': 'REC-2026-9906',
      'Code Client': 'ABN-CAS-77133',
      'Nom Abonné': 'Younes Berrada',
      'Téléphone': '06 65 11 22 33',
      'Adresse Client': 'Zone Portuaire Nord, Port de Casablanca',
      'Zone MSAN': 'MSAN-PORT-INCONNU',
      'Date Enregistrement': '2026-10-14 09:40',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tickets SAV 3GCOM');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
