import { describe, it, expect, vi } from 'vitest';

vi.mock('./storage', () => ({
  store: {
    getSectors: () => [{ id: 'sec-casa', dcId: 'dc', code: 'CASA', name: 'Casablanca Centre', createdAt: '' }],
    getTechnicalZones: () => [
      { id: 'z1', sectorId: 'sec-casa', label: 'Maarif Centre', msanCode: 'MSAN-MAA', createdAt: '' },
      { id: 'z2', sectorId: 'sec-casa', label: 'Gauthier', msanCode: 'MSAN-GAU', createdAt: '' },
    ],
    getZoneAliases: () => [],
  },
}));

const { generateSampleExcelFile, parseExcelBuffer } = await import('./excelImporter');

describe('fichier type (bouton « Test 1 clic »)', () => {
  it('est relu sans erreur par l\'import, avec les bons noms et rejets', () => {
    const sample = generateSampleExcelFile('sec-casa');
    expect(sample).toBeInstanceOf(ArrayBuffer);
    const parsed = parseExcelBuffer(sample, 'sec-casa');

    expect(parsed.totalRawRows).toBe(7);
    expect(parsed.detectedColumns.clientNameCol).toBe('Nom Abonné');
    expect(parsed.previewRows[0]).toMatchObject({
      clientName: 'Karim Bensouda',
      resolvedZoneId: 'z1',
      registeredAt: '2026-10-14T08:30:00.000Z',
      isValid: true,
    });
    // Ligne volontairement sans numéro de ticket
    expect(parsed.previewRows[5].isValid).toBe(false);
    // Zone inconnue : valide mais à rattacher
    expect(parsed.previewRows[6]).toMatchObject({ isValid: true, resolvedZoneId: undefined });
  });
});
