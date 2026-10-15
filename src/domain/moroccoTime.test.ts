import { describe, it, expect } from 'vitest';
import { moroccoOffsetMs, moroccoToUtc, toMoroccoWallClock, MOROCCO_PERMANENT_UTC_SINCE } from './moroccoTime';

const HOUR = 3600_000;

describe('heure du Maroc', () => {
  it('UTC+1 avant le 20/09/2026, UTC+0 ensuite (même si le système n\'est pas à jour)', () => {
    expect(moroccoOffsetMs(Date.UTC(2026, 6, 14, 12))).toBe(HOUR);
    expect(moroccoOffsetMs(Date.UTC(2026, 9, 14, 12))).toBe(0);
    expect(moroccoOffsetMs(Date.UTC(2031, 0, 1))).toBe(0);
  });

  it('bascule le 20/09/2026 à 02:00 locale (01:00 UTC)', () => {
    expect(new Date(MOROCCO_PERMANENT_UTC_SINCE).toISOString()).toBe('2026-09-20T01:00:00.000Z');
    expect(toMoroccoWallClock(new Date('2026-09-20T00:59:00Z')).toISOString()).toBe('2026-09-20T01:59:00.000Z');
    expect(toMoroccoWallClock(new Date('2026-09-20T01:00:00Z')).toISOString()).toBe('2026-09-20T01:00:00.000Z');
  });

  it('convertit une heure locale en UTC de part et d\'autre du changement', () => {
    expect(moroccoToUtc(2026, 9, 19, 10, 0).toISOString()).toBe('2026-09-19T09:00:00.000Z');
    expect(moroccoToUtc(2026, 9, 21, 10, 0).toISOString()).toBe('2026-09-21T10:00:00.000Z');
  });
});
