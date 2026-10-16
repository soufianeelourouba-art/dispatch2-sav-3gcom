// Litige helpers shared by the bot, the technician app and the orienteur screens:
// RDV chosen with buttons (day + time slot, Morocco time), RDV typed by hand, phone numbers
// formatted so Telegram makes them tappable.
import { moroccoToUtc, toMoroccoWallClock } from './moroccoTime.js';

export const RDV_SLOTS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// "261017" (yymmdd, Morocco calendar day) — short enough for Telegram callback data
export function dayCode(date: Date): string {
  const wall = toMoroccoWallClock(date);
  return `${String(wall.getUTCFullYear()).slice(2)}${pad(wall.getUTCMonth() + 1)}${pad(wall.getUTCDate())}`;
}

export function dayLabel(code: string): string {
  const [y, m, d] = [2000 + Number(code.slice(0, 2)), Number(code.slice(2, 4)), Number(code.slice(4, 6))];
  const weekday = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${pad(d)}/${pad(m)}`;
}

// Today, tomorrow and the day after, in Morocco
export function rdvDayOptions(now = new Date()): { code: string; label: string }[] {
  return ['Aujourd\'hui', 'Demain', 'Après-demain'].map((name, i) => {
    const code = dayCode(new Date(now.getTime() + i * 86400_000));
    return { code, label: `${name} ${dayLabel(code).split(' ')[1]}` };
  });
}

// Day code + "HH:MM" (Morocco) → ISO UTC
export function rdvToIso(code: string, time: string): string | null {
  const day = /^(\d{2})(\d{2})(\d{2})$/.exec(code);
  const hm = /^(\d{1,2})[:hH](\d{2})?$/.exec(time.trim());
  if (!day || !hm) return null;
  const [y, m, d] = [2000 + Number(day[1]), Number(day[2]), Number(day[3])];
  const [h, min] = [Number(hm[1]), Number(hm[2] || 0)];
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null;
  return moroccoToUtc(y, m, d, h, min).toISOString();
}

/**
 * RDV typed by the technician: "18/10 14h30", "18/10/2026 14:30", "18-10 9h", "14h30" (today).
 * A date without year is the next occurrence (this year, or next year if already past).
 * Returns null when not understood.
 */
export function parseRdvText(text: string, now = new Date()): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^le /, '');
  const timeOnly = /^(\d{1,2})\s*[h:]\s*(\d{2})?$/.exec(t);
  if (timeOnly) return rdvToIso(dayCode(now), `${timeOnly[1]}:${timeOnly[2] || '00'}`);

  const full = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?:\s*(?:à|a)?\s*(\d{1,2})\s*[h:]\s*(\d{2})?)?$/.exec(t);
  if (!full) return null;
  const [d, m] = [Number(full[1]), Number(full[2])];
  const wallNow = toMoroccoWallClock(now);
  let y = full[3] ? Number(full[3]) : wallNow.getUTCFullYear();
  if (y < 100) y += 2000;
  const time = full[4] ? `${full[4]}:${full[5] || '00'}` : '09:00';
  let iso = rdvToIso(`${String(y).slice(2)}${pad(m)}${pad(d)}`, time);
  if (iso && !full[3] && Date.parse(iso) < now.getTime() - 86400_000) {
    iso = rdvToIso(`${String(y + 1).slice(2)}${pad(m)}${pad(d)}`, time);
  }
  // Reject impossible dates (31/02 would silently roll over)
  if (iso) {
    const check = toMoroccoWallClock(new Date(iso));
    if (check.getUTCDate() !== d || check.getUTCMonth() + 1 !== m) return null;
  }
  return iso;
}

// Moroccan numbers in international format, which Telegram turns into tappable links:
// "06 61 22 33 44" → "+212 661 22 33 44", "212522525236" → "+212 522 52 52 36".
export function formatPhoneIntl(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let national = '';
  if (/^0[5-7]\d{8}$/.test(digits)) national = digits.slice(1);
  else if (/^212[5-7]\d{8}$/.test(digits)) national = digits.slice(3);
  else if (/^00212[5-7]\d{8}$/.test(digits)) national = digits.slice(5);
  else if (/^[5-7]\d{8}$/.test(digits)) national = digits;
  if (!national) return raw.trim();
  return `+212 ${national.slice(0, 3)} ${national.slice(3, 5)} ${national.slice(5, 7)} ${national.slice(7, 9)}`;
}

// A field may hold several numbers ("212522525236/212666274849")
export function formatPhonesIntl(raw: string): string {
  return raw.split(/[\/,;]| - /).map(p => p.trim()).filter(Boolean).map(formatPhoneIntl).join(' / ');
}
