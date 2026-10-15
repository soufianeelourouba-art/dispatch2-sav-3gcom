import { it } from 'vitest';

it('diagnostic fuseau', () => {
  const f = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', timeZoneName: 'longOffset', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  console.log('TZDIAG', JSON.stringify({
    node: process.version,
    icu: process.versions.icu,
    tz: process.versions.tz,
    unicode: process.versions.unicode,
    envTZ: process.env.TZ,
    oct2026: f('2026-10-14T07:30:00Z'),
    jul2026: f('2026-07-14T07:30:00Z'),
    jan2026: f('2026-01-14T07:30:00Z'),
    mar2026: f('2026-03-01T12:00:00Z'),
  }));
});
