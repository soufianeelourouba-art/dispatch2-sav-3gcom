// Display helpers (French labels, Africa/Casablanca time zone).
import type { SLAStatus } from '../types';

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

// --- Invariant 5: Timezone formatting (Africa/Casablanca) ---
export function formatCasablancaDateTime(utcIsoString: string | undefined): string {
  if (!utcIsoString) return '—';
  try {
    const date = new Date(utcIsoString);
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Casablanca',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return utcIsoString;
  }
}

export function formatCasablancaTimeOnly(utcIsoString: string | undefined): string {
  if (!utcIsoString) return '—';
  try {
    const date = new Date(utcIsoString);
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Casablanca',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return utcIsoString;
  }
}
