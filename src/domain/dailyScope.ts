// Orienteur working set: what was received or handled today, plus everything still to handle
// from previous days. Tickets closed on previous days stay in the database (and in the future
// global dashboard) but leave the daily screens.
import type { Ticket } from '../types';
import { dayCode } from './litiges.js';

export function isInDailyScope(ticket: Ticket, now = new Date()): boolean {
  const today = dayCode(now);
  const handledToday = (iso?: string) => !!iso && dayCode(new Date(iso)) === today;
  if (ticket.currentStatus === 'COMPLETED') return handledToday(ticket.completedAt || ticket.lastEventAt);
  // Suspended litiges have their own tab; they show in the day's lists only when suspended today
  if (ticket.currentStatus === 'SUSPENDED') return handledToday(ticket.lastEventAt);
  return true;
}
