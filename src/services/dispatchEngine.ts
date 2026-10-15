import { Ticket } from '../types';
import { store } from './storage';
import { computeDispatchProposals, DispatchSimulationResult } from '../domain/dispatch';

export type { DispatchSimulationResult };

// Dispatch proposals computed from the data currently loaded in the store.
export function calculateDispatchProposals(
  ticketsToDispatch: Ticket[],
  sectorId?: string
): DispatchSimulationResult {
  return computeDispatchProposals(ticketsToDispatch, store.getTechnicians(), store.getTickets(), sectorId);
}
