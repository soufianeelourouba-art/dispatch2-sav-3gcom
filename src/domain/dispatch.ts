// Pure dispatch rules: which technician should receive each ticket.
import type { DispatchProposal, Technician, Ticket } from '../types';

export interface DispatchSimulationResult {
  proposals: DispatchProposal[];
  stats: {
    totalEvaluated: number;
    assignedCount: number;
    unassignedCount: number;
    secondVisitCount: number;
    sameTechCount: number;
    differentTechCount: number;
  };
}

// Load above which the proposal carries an overload warning.
export const DAILY_LOAD_WARNING = 6;

/**
 * Computes the proposed dispatch according to the validated 4-level priority rules:
 * Level 1: Deuxième visite (Same tech if external failure / client unreachable / RDV; Different tech if technical / GC)
 * Level 2: Zone technique MSAN coverage
 * Level 3: Workload balancing (least open tickets)
 * Level 4: Technician active status
 *
 * @param ticketsToDispatch tickets to propose a technician for
 * @param technicians all known technicians (filtered here on active + sector)
 * @param existingTickets tickets already in the system, used to compute current workload
 */
export function computeDispatchProposals(
  ticketsToDispatch: Ticket[],
  technicians: Technician[],
  existingTickets: Ticket[],
  sectorId?: string
): DispatchSimulationResult {
  const sectorTechs = technicians.filter(
    t => t.isActive && (!sectorId || t.sectorId === sectorId || (t.sectorIds || []).includes(sectorId))
  );

  // Workload map
  const workloadMap: Record<string, number> = {};
  sectorTechs.forEach(t => {
    workloadMap[t.id] = 0;
  });

  existingTickets.forEach(t => {
    if (t.currentAssignedTechId && !t.isClosed && workloadMap[t.currentAssignedTechId] !== undefined) {
      workloadMap[t.currentAssignedTechId]++;
    }
  });

  // Least loaded first; ties broken by name so the proposal is stable between runs.
  const byLoad = (a: Technician, b: Technician) =>
    workloadMap[a.id] - workloadMap[b.id] || a.fullName.localeCompare(b.fullName);

  const proposals: DispatchProposal[] = [];
  let secondVisitCount = 0;
  let sameTechCount = 0;
  let differentTechCount = 0;

  ticketsToDispatch.forEach(ticket => {
    if (!ticket.technicalZoneId) {
      proposals.push({
        ticketId: ticket.id,
        technicianId: null,
        technicianName: null,
        rationale: 'Zone technique non répertoriée (en attente de rattachement dans le référentiel).',
        isSecondVisit: ticket.visitCount > 1,
        priorityScore: 0,
      });
      return;
    }

    const qualifiedTechs = sectorTechs.filter(t => t.zoneIds.includes(ticket.technicalZoneId!));

    if (qualifiedTechs.length === 0) {
      proposals.push({
        ticketId: ticket.id,
        technicianId: null,
        technicianName: null,
        rationale: 'Aucun technicien actif n\'est actuellement affecté à cette zone technique.',
        isSecondVisit: ticket.visitCount > 1,
        priorityScore: 0,
      });
      return;
    }

    // Second visit arbitration rule
    const isSecondVisit = ticket.visitCount > 1 || !!ticket.lastLitigeReasonCode;

    if (isSecondVisit) {
      secondVisitCount++;
      const lastTechName = ticket.lastVisitedTechName?.trim().toLowerCase();
      const lastTech = lastTechName
        ? sectorTechs.find(t => t.fullName.trim().toLowerCase() === lastTechName || t.normalizedName === lastTechName)
        : undefined;

      const isExternalLitige =
        ticket.lastLitigeReasonCode === 'CLIENT_UNREACHABLE' ||
        ticket.lastLitigeReasonCode === 'RDV' ||
        ticket.lastFailureCategory === 'EXTERNAL';

      if (isExternalLitige) {
        // Reconduction du même technicien pour cause externe (il connaît l'accès/repères)
        if (lastTech && qualifiedTechs.some(q => q.id === lastTech.id)) {
          sameTechCount++;
          workloadMap[lastTech.id]++;
          proposals.push({
            ticketId: ticket.id,
            technicianId: lastTech.id,
            technicianName: lastTech.fullName,
            rationale: `2e visite cause EXTERNE (${ticket.lastLitigeReasonLabel || 'Client injoignable / RDV'}) : reconduction du même technicien (${lastTech.fullName}) pour repères d'accès.`,
            isSecondVisit: true,
            priorityScore: 100,
          });
          return;
        }
      } else {
        // Affectation d'un technicien différent pour cause technique / GC (regard neuf)
        const candidateDifferentTechs = qualifiedTechs.filter(t => !lastTech || t.id !== lastTech.id);
        if (candidateDifferentTechs.length > 0) {
          candidateDifferentTechs.sort(byLoad);
          const chosenTech = candidateDifferentTechs[0];
          differentTechCount++;
          workloadMap[chosenTech.id]++;
          proposals.push({
            ticketId: ticket.id,
            technicianId: chosenTech.id,
            technicianName: chosenTech.fullName,
            rationale: `2e visite cause TECHNIQUE / GC (${ticket.lastLitigeReasonLabel || 'Infrastructure'}) : technicien différent (${chosenTech.fullName}) pour regard neuf. Précédent : ${ticket.lastVisitedTechName || 'Inconnu'}.`,
            isSecondVisit: true,
            priorityScore: 90,
          });
          return;
        }
      }
    }

    // Default: least loaded technician in zone
    const chosenTech = [...qualifiedTechs].sort(byLoad)[0];
    const currentLoad = workloadMap[chosenTech.id];

    workloadMap[chosenTech.id]++;

    const overloadWarning = currentLoad >= DAILY_LOAD_WARNING ? ' ⚠️ (Seuil de charge quotidienne recommandé atteint)' : '';

    proposals.push({
      ticketId: ticket.id,
      technicianId: chosenTech.id,
      technicianName: chosenTech.fullName,
      rationale: `Affecté à ${chosenTech.fullName} (Zone couverte, ${currentLoad} intervention(s) en cours)${overloadWarning}.`,
      isSecondVisit,
      priorityScore: 50,
    });
  });

  const assignedCount = proposals.filter(p => p.technicianId !== null).length;
  const unassignedCount = proposals.length - assignedCount;

  return {
    proposals,
    stats: {
      totalEvaluated: proposals.length,
      assignedCount,
      unassignedCount,
      secondVisitCount,
      sameTechCount,
      differentTechCount,
    },
  };
}
