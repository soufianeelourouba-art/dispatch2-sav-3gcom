// Display helpers (French labels, Africa/Casablanca time zone).
import type { SLAStatus } from '../types';
import { toMoroccoWallClock } from './moroccoTime.js';

// --- Format SLA remaining text for clean display ---
export function formatSLADisplay(remainingHours: number, status: SLAStatus): { text: string; label: string } {
  // Round on total minutes so 2.999h shows "3h", never "2h60"
  const totalMinutes = Math.round(Math.abs(remainingHours) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const text = `${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}`;
  return {
    text,
    label: status === 'EXPIRED' ? `En retard de ${text}` : `Reste ${text}`,
  };
}

// --- Invariant 5: Timezone formatting (Morocco wall clock, see moroccoTime.ts) ---
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });

function formatMorocco(utcIsoString: string | undefined, formatter: Intl.DateTimeFormat): string {
  if (!utcIsoString) return '—';
  const date = new Date(utcIsoString);
  if (isNaN(date.getTime())) return utcIsoString;
  return formatter.format(toMoroccoWallClock(date));
}

export function formatCasablancaDateTime(utcIsoString: string | undefined): string {
  return formatMorocco(utcIsoString, dateTimeFormatter);
}

export function formatCasablancaTimeOnly(utcIsoString: string | undefined): string {
  return formatMorocco(utcIsoString, timeFormatter);
}
