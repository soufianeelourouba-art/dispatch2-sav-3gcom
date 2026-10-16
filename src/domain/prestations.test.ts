import { describe, it, expect } from 'vitest';
import {
  validateDeclaration,
  validateConfigNf,
  isValidSerial,
  normalizeSerial,
  describeMaterials,
  needsDeclaration,
  prestationLabel,
} from './prestations';

const none = { joints: 0, splitters: 0, cableMeters: 0 };

describe('validateDeclaration', () => {
  it('accepte une prestation simple sans matériel ni photo', () => {
    expect(validateDeclaration({ code: 'FO_04', materials: none, materialPhotoCount: 0 })).toEqual([]);
    expect(validateDeclaration({ code: 'FO_32', materialPhotoCount: 0 })).toEqual([]);
  });

  it('exige une prestation', () => {
    expect(validateDeclaration({ materials: none, materialPhotoCount: 0 })).toEqual(['Choisissez la prestation réalisée.']);
    expect(validateDeclaration({ code: 'FO_99', materialPhotoCount: 0 })).toHaveLength(1);
  });

  it('01-02 FO : nombre de raccordements de 1 à 4', () => {
    expect(validateDeclaration({ code: 'FO_01_02', raccordements: 2, materialPhotoCount: 0 })).toEqual([]);
    expect(validateDeclaration({ code: 'FO_01_02', raccordements: 4, materialPhotoCount: 0 })).toEqual([]);
    for (const bad of [undefined, 0, 5, 1.5, -1]) {
      expect(validateDeclaration({ code: 'FO_01_02', raccordements: bad, materialPhotoCount: 0 })).toHaveLength(1);
    }
  });

  it('matériel posé : photo obligatoire', () => {
    expect(validateDeclaration({ code: 'FO_04', materials: { ...none, joints: 2 }, materialPhotoCount: 0 }))
      .toEqual(['Prenez au moins une photo du matériel installé.']);
    expect(validateDeclaration({ code: 'FO_04', materials: { ...none, cableMeters: 120 }, materialPhotoCount: 1 })).toEqual([]);
  });

  it('refuse des quantités invalides', () => {
    expect(validateDeclaration({ code: 'FO_04', materials: { ...none, joints: -1 }, materialPhotoCount: 1 })).toHaveLength(1);
    expect(validateDeclaration({ code: 'FO_04', materials: { ...none, cableMeters: 12.5 }, materialPhotoCount: 1 })).toHaveLength(1);
    expect(validateDeclaration({ code: 'FO_04', materials: { ...none, cableMeters: 99999 }, materialPhotoCount: 1 })).toHaveLength(1);
  });

  it('limite le nombre de photos', () => {
    expect(validateDeclaration({ code: 'FO_04', materials: { ...none, joints: 1 }, materialPhotoCount: 5 })).toHaveLength(1);
  });
});

describe('NF config centrale', () => {
  it('exige le numéro de série et sa photo', () => {
    expect(validateConfigNf('ALCLB1234567', 1)).toEqual([]);
    expect(validateConfigNf(undefined, 1)).toHaveLength(1);
    expect(validateConfigNf('ALCLB1234567', 0)).toEqual(['Prenez la photo de l\'étiquette du numéro de série.']);
  });

  it('numéro de série : lettres et chiffres, 8 à 24, espaces et tirets ignorés', () => {
    expect(normalizeSerial(' alcl-b123 4567 ')).toBe('ALCLB1234567');
    expect(isValidSerial('alcl b123 4567')).toBe(true);
    expect(isValidSerial('ABC123')).toBe(false);
    expect(isValidSerial('ALCL/1234567')).toBe(false);
  });
});

describe('affichage et état', () => {
  it('décrit le matériel', () => {
    expect(describeMaterials({ joints: 1, splitters: 2, cableMeters: 80 })).toBe('1 joint, 2 splitters, 80 m de câble');
    expect(describeMaterials(none)).toBe('Aucun matériel');
    expect(prestationLabel('FO_32')).toBe('32 FO (splitter)');
  });

  it('ticket à déclarer : NF sans déclaration, hors tickets inclus dans un splitter', () => {
    expect(needsDeclaration({ currentStatus: 'COMPLETED' })).toBe(true);
    expect(needsDeclaration({ currentStatus: 'COMPLETED', prestationStatus: 'A_DECLARER' })).toBe(true);
    expect(needsDeclaration({ currentStatus: 'COMPLETED', prestationStatus: 'DECLAREE' })).toBe(false);
    expect(needsDeclaration({ currentStatus: 'COMPLETED', prestationStatus: 'INCLUSE' })).toBe(false);
    expect(needsDeclaration({ currentStatus: 'LITIGE' })).toBe(false);
    // reprise of his own intervention: nothing to declare
    expect(needsDeclaration({ currentStatus: 'COMPLETED', prestationStatus: 'NON_FACTURABLE' })).toBe(false);
    // cleared when a new intervention starts
    expect(needsDeclaration({ currentStatus: 'COMPLETED', prestationStatus: null })).toBe(true);
  });
});
