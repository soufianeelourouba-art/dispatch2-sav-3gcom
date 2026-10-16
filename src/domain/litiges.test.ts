import { describe, it, expect } from 'vitest';
import { dayCode, dayLabel, rdvDayOptions, rdvToIso, parseRdvText, formatPhoneIntl, formatPhonesIntl } from './litiges';

// Friday 16/10/2026 10:00 in Morocco (UTC+0 since 20/09/2026)
const NOW = new Date('2026-10-16T10:00:00Z');

describe('RDV par boutons', () => {
  it('propose aujourd\'hui, demain, après-demain (heure du Maroc)', () => {
    expect(rdvDayOptions(NOW)).toEqual([
      { code: '261016', label: 'Aujourd\'hui 16/10' },
      { code: '261017', label: 'Demain 17/10' },
      { code: '261018', label: 'Après-demain 18/10' },
    ]);
  });

  it('passe au jour suivant à minuit heure du Maroc', () => {
    expect(dayCode(new Date('2026-10-16T23:30:00Z'))).toBe('261016');
    expect(dayCode(new Date('2026-07-16T23:30:00Z'))).toBe('260717'); // UTC+1 en juillet
  });

  it('libellé du jour', () => {
    expect(dayLabel('261017')).toBe('Sam 17/10');
  });

  it('jour + créneau → date ISO', () => {
    expect(rdvToIso('261017', '14:00')).toBe('2026-10-17T14:00:00.000Z');
    expect(rdvToIso('260717', '14:00')).toBe('2026-07-17T13:00:00.000Z');
    expect(rdvToIso('261017', '25:00')).toBeNull();
    expect(rdvToIso('xx', '14:00')).toBeNull();
  });
});

describe('RDV tapé à la main', () => {
  it.each([
    ['18/10 14h30', '2026-10-18T14:30:00.000Z'],
    ['18/10 à 14h30', '2026-10-18T14:30:00.000Z'],
    ['le 18/10 14:30', '2026-10-18T14:30:00.000Z'],
    ['18-10 9h', '2026-10-18T09:00:00.000Z'],
    ['18/10/2026 14:30', '2026-10-18T14:30:00.000Z'],
    ['18/10', '2026-10-18T09:00:00.000Z'],
    ['15h', '2026-10-16T15:00:00.000Z'],
    ['05/01 10h', '2027-01-05T10:00:00.000Z'], // date passée cette année → année suivante
  ])('« %s »', (text, iso) => {
    expect(parseRdvText(text, NOW)).toBe(iso);
  });

  it('refuse ce qui n\'est pas une date', () => {
    for (const text of ['demain matin', '31/02 10h', '18/13', '']) {
      expect(parseRdvText(text, NOW)).toBeNull();
    }
  });
});

describe('numéros de téléphone', () => {
  it('format international cliquable dans Telegram', () => {
    expect(formatPhoneIntl('06 61 22 33 44')).toBe('+212 661 22 33 44');
    expect(formatPhoneIntl('0661223344')).toBe('+212 661 22 33 44');
    expect(formatPhoneIntl('212522525236')).toBe('+212 522 52 52 36');
    expect(formatPhoneIntl('+212 6 61 22 33 44')).toBe('+212 661 22 33 44');
    expect(formatPhoneIntl('661223344')).toBe('+212 661 22 33 44');
  });

  it('laisse tel quel un numéro non marocain ou incomplet', () => {
    expect(formatPhoneIntl('+33 6 12 34 56 78')).toBe('+33 6 12 34 56 78');
    expect(formatPhoneIntl('12345')).toBe('12345');
  });

  it('plusieurs numéros dans un champ', () => {
    expect(formatPhonesIntl('212522525236/212666274849')).toBe('+212 522 52 52 36 / +212 666 27 48 49');
  });
});
