// Morocco (Africa/Casablanca) wall-clock time, independent of the runtime's tz database.
//
// Morocco switched permanently to UTC+0 on 2026-09-20 at 02:00 local (01:00 UTC), see IANA
// tzdata 2026c. Browsers and servers shipping older tz data still apply UTC+1, which would
// shift every displayed and imported time by one hour, so the rule is applied here directly.
// Earlier dates use the runtime's tz database, where all versions agree.

export const MOROCCO_PERMANENT_UTC_SINCE = Date.UTC(2026, 8, 20, 1, 0, 0);

const historicalFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Casablanca',
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Offset of Morocco's wall clock from UTC at the given instant, in milliseconds.
export function moroccoOffsetMs(utcMs: number): number {
  if (utcMs >= MOROCCO_PERMANENT_UTC_SINCE) return 0;
  const parts = historicalFormatter.formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Morocco wall-clock date/time → UTC instant.
export function moroccoToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = naive - moroccoOffsetMs(naive);
  utc = naive - moroccoOffsetMs(utc); // second pass settles clock changes
  return new Date(utc);
}

// UTC instant → Date whose UTC fields hold Morocco's wall-clock time (for formatting).
export function toMoroccoWallClock(date: Date): Date {
  return new Date(date.getTime() + moroccoOffsetMs(date.getTime()));
}
