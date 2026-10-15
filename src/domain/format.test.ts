import { describe, it, expect } from 'vitest';
import { formatSLADisplay, formatCasablancaDateTime, formatCasablancaTimeOnly } from './format';

describe('formatSLADisplay', () => {
  it('temps restant', () => {
    expect(formatSLADisplay(5.5, 'WARNING')).toEqual({ text: '5h30', label: 'Reste 5h30' });
    expect(formatSLADisplay(12, 'ON_TIME')).toEqual({ text: '12h', label: 'Reste 12h' });
  });

  it('met toujours les minutes sur deux chiffres', () => {
    expect(formatSLADisplay(2.1, 'ON_TIME')).toEqual({ text: '2h06', label: 'Reste 2h06' });
  });

  it('retard', () => {
    expect(formatSLADisplay(-3.5, 'EXPIRED')).toEqual({ text: '3h30', label: 'En retard de 3h30' });
  });

  it('n\'affiche jamais « 60 minutes »', () => {
    expect(formatSLADisplay(2.999, 'ON_TIME').text).toBe('3h');
  });
});

describe('formatCasablancaDateTime', () => {
  it('affiche l\'heure du Maroc (UTC+0 depuis le 20/09/2026)', () => {
    expect(formatCasablancaDateTime('2026-10-14T07:30:00Z')).toBe('14/10/2026 07:30');
    expect(formatCasablancaTimeOnly('2026-10-14T07:30:00Z')).toBe('07:30');
  });
  it('affiche l\'heure du Maroc (UTC+1 avant le changement)', () => {
    expect(formatCasablancaDateTime('2026-07-14T07:30:00Z')).toBe('14/07/2026 08:30');
  });
  it('renvoie le texte tel quel si la date est invalide', () => {
    expect(formatCasablancaDateTime('pas une date')).toBe('pas une date');
  });
  it('affiche un tiret si la date est absente', () => {
    expect(formatCasablancaDateTime(undefined)).toBe('—');
  });
});
