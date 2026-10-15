import * as XLSX from 'xlsx';
import { ImportReport, RejectedRow } from '../types';
import { store } from './storage';
import { detectHeaders, interpretRows, DetectedColumns, InterpretedRow } from '../domain/excelImport';

export { detectHeaders };
export type { DetectedColumns, InterpretedRow };

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

  const sectors = store.getSectors();
  const targetSectorName = sectors.find(s => s.id === targetSectorId)?.name || 'Secteur indéfini';
  const interpretedRows = interpretRows(rawRows, detected, {
    targetSectorId,
    sectors,
    zones: store.getTechnicalZones(),
    aliases: store.getZoneAliases(),
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
// XLSX.write with type 'array' returns an ArrayBuffer (not a Uint8Array).
export function generateSampleExcelFile(targetSectorId?: string): ArrayBuffer {
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
