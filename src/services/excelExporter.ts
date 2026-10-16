import * as XLSX from 'xlsx';
import { Ticket, Technician, MANUAL_TICKET_NATURES } from '../types';
import { formatCasablancaDateTime } from '../domain/format';
import { store } from './storage';
import { PRESTATIONS, prestationLabel } from '../domain/prestations';
import { amountOf, hasTarifs, type Period, type PrestationLine, type Tarifs, type TechnicianSummary } from '../domain/prestationReport';

export function exportTicketsToExcel(tickets: Ticket[], fileName: string = 'tickets_3gcom.xlsx') {
  const techName = (id?: string) => (id ? store.getTechnicians().find(tech => tech.id === id)?.fullName : undefined);
  const rows = tickets.map(t => ({
    'N° Réclamation': t.ticketNumber,
    'Origine': t.origin === 'MANUAL' ? 'Hors ticket (à facturer)' : 'Ticket opérateur',
    'Nature': t.origin === 'MANUAL' ? MANUAL_TICKET_NATURES.find(n => n.code === t.manualNature)?.label || '' : '',
    'Description': t.description || '',
    'Créé par': t.createdByName || '',
    'Splitter': t.splitterRef || '',
    'Code Client': t.clientNumber,
    'Nom Client': t.clientName,
    'Téléphone': t.clientPhone,
    'Adresse': t.clientAddress,
    'Zone Technique': t.rawZoneText,
    'Statut Actuel': translateStatus(t.currentStatus),
    'SLA 24h': t.slaStatus === 'EXPIRED' ? `DÉPASSÉ (${t.slaRemainingHours}h)` : `CONFORME (reste ${t.slaRemainingHours}h)`,
    'Passage / Visites': t.visitCount,
    'Technicien Affecté': techName(t.currentAssignedTechId) || t.lastVisitedTechName || 'Non assigné',
    'Litige / Motif': t.lastLitigeReasonLabel || t.lastFailureReasonLabel || 'N/A',
    'Clôture NF': t.currentStatus === 'COMPLETED' ? (t.nfType === 'CENTRAL_CONFIG' ? `Config Centrale (ONT: ${t.ontSerialNumber || ''})` : 'Standard') : 'Non clôturé',
    'Longueur Câble (m)': t.cableLengthMeters || 0,
    'Date Enregistrement (Casablanca)': formatCasablancaDateTime(t.registeredAt),
    'Dernière Activité': formatCasablancaDateTime(t.lastEventAt || t.updatedAt),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tickets SAV');
  XLSX.writeFile(wb, fileName);
}

export function exportTechnicianMatrixToExcel(
  technicians: Technician[],
  tickets: Ticket[],
  fileName: string = 'performance_techniciens_3gcom.xlsx'
) {
  const rows = technicians.map(tech => {
    const techTickets = tickets.filter(t => t.currentAssignedTechId === tech.id);
    const completed = techTickets.filter(t => t.currentStatus === 'COMPLETED').length;
    const litiges = techTickets.filter(t => t.currentStatus === 'LITIGE').length;
    const inProgress = techTickets.filter(t => ['ASSIGNED', 'REOPENED'].includes(t.currentStatus)).length;
    const totalHandled = techTickets.length;

    const successRate = totalHandled >= 5 
      ? `${Math.round((completed / totalHandled) * 100)} %` 
      : totalHandled > 0 ? `${completed} sur ${totalHandled}` : 'N/A';

    return {
      'Technicien': tech.fullName,
      'Téléphone': tech.phone,
      'Identifiant Telegram': tech.telegramChatId || 'Non configuré',
      'Statut Compte': tech.isActive ? 'Actif' : 'Inactif',
      'Total Interventions': totalHandled,
      'En Cours': inProgress,
      'Normalisés (NF)': completed,
      'Litiges (LC)': litiges,
      'Taux de Clôture NF': successRate,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Techniciens');
  XLSX.writeFile(wb, fileName);
}

function translateStatus(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'Normalisé (NF)';
    case 'LITIGE': return 'Litige Client (LC)';
    case 'SUSPENDED': return 'Suspendu (motif validé)';
    case 'REOPENED': return 'Réouvert mise à jour';
    case 'ASSIGNED': return 'Transmis technicien';
    case 'PROPOSED': return 'Proposition en attente';
    case 'TO_ASSIGN': return 'À affecter manuellement';
    case 'ZONE_TO_MAP': return 'Zone technique à rattacher';
    default: return status;
  }
}

// Prestations of a period: one sheet per view (summary per technician, detail, still to declare)
export function exportPrestationsToExcel(params: {
  summaries: TechnicianSummary[];
  lines: PrestationLine[];
  period: Period;
  tarifs: Tarifs;
  scopeLabel: string;
}) {
  const { summaries, lines, period, tarifs, scopeLabel } = params;
  const withAmounts = hasTarifs(tarifs);
  const statusLabel: Record<string, string> = {
    DECLAREE: 'Déclarée', A_DECLARER: 'À déclarer', NON_FACTURABLE: 'Non facturable (reprise)', INCLUSE: 'Incluse (splitter)',
  };
  const ticketNumber = (id?: string) => (id ? store.getTicketById(id)?.ticketNumber || '' : '');

  const summaryRows = summaries.map(s => ({
    'Technicien': s.techName,
    'NF': s.nf,
    'Déclarées': s.declared,
    'À déclarer': s.toDeclare,
    'Non facturables': s.nonBillable,
    'Incluses (splitter)': s.included,
    ...Object.fromEntries(PRESTATIONS.map(p => [p.withRaccordements ? `${p.label} (raccordements)` : p.label, s.units[p.code]])),
    'Joints': s.materials.joints,
    'Splitters': s.materials.splitters,
    'Câble (m)': s.materials.cableMeters,
    ...(withAmounts ? { 'Montant (DH)': s.amount } : {}),
  }));

  const detailRows = lines.map(l => ({
    'Technicien': l.techName,
    'Date': formatCasablancaDateTime(l.date),
    'N° Réclamation': l.ticketNumber,
    'Client': l.clientName,
    'Origine': l.manual ? 'Hors ticket' : 'Ticket opérateur',
    'Cycle': l.earlierCycle ? 'Intervention précédente' : 'Dernière intervention',
    'Statut': statusLabel[l.status] || l.status,
    'Prestation': l.code ? prestationLabel(l.code) : '',
    'Raccordements': l.code === 'FO_01_02' ? l.units : '',
    'Joints': l.materials.joints,
    'Splitters': l.materials.splitters,
    'Câble (m)': l.materials.cableMeters,
    'Photos': l.photoCount,
    'Ticket principal (splitter)': ticketNumber(l.leadTicketId),
    ...(withAmounts ? { 'Montant (DH)': amountOf(l, tarifs) } : {}),
  }));

  const toDeclare = detailRows.filter((_, i) => lines[i].status === 'A_DECLARER');

  const wb = XLSX.utils.book_new();
  const header = [[`Prestations 3GCOM · ${scopeLabel} · du ${dayFr(period.from)} au ${dayFr(period.to)}`], []];
  const summarySheet = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(summarySheet, summaryRows, { origin: 'A3' });
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Synthèse');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Détail');
  if (toDeclare.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toDeclare), 'À déclarer');
  XLSX.writeFile(wb, `prestations_${period.from}_${period.to}.xlsx`);
}

function dayFr(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
