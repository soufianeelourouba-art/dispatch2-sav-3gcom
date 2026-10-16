import React from 'react';
import { Ticket, MANUAL_TICKET_NATURES } from '../../types';
import { Cable, Wrench } from 'lucide-react';
import { describeMaterials, hasMaterials, prestationLabel } from '../../domain/prestations';
import { rdvProximity } from '../../domain/litiges';
import { formatCasablancaDateTime } from '../../domain/format';

// "Splitter SP-12 · 4 tickets": highlighted when several open tickets share the splitter.
export const SplitterBadge: React.FC<{ ticket: Ticket; groupSize?: number }> = ({ ticket, groupSize = 1 }) => {
  if (!ticket.splitterRef) return null;
  const collective = groupSize > 1;
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
        collective ? 'bg-brand-orange-500 text-white' : 'bg-brand-orange-50 text-brand-orange-600 border border-brand-orange-400/40'
      }`}
      title={collective ? 'Incident collectif : un seul technicien, une seule intervention' : 'Splitter du client'}
    >
      <Cable className="w-3 h-3" />
      <span>Splitter {ticket.splitterRef}{collective ? ` · ${groupSize} tickets` : ''}</span>
    </span>
  );
};

// NF closure summary on ticket cards: type, ONT serial, photos and prestation state.
export const NfSummary: React.FC<{ ticket: Ticket; onOpen?: () => void }> = ({ ticket, onOpen }) => {
  if (ticket.currentStatus !== 'COMPLETED') return null;
  const photos = (ticket.prestation?.photoIds.length || 0) + (ticket.serialPhotoIds?.length || 0);
  const prestation =
    ticket.prestationStatus === 'INCLUSE' ? <span className="text-slate-600">incluse dans l'incident splitter</span>
    : ticket.prestation ? (
      <b className="text-emerald-800">
        {prestationLabel(ticket.prestation.code)}{ticket.prestation.raccordements ? ` × ${ticket.prestation.raccordements}` : ''}
        {hasMaterials(ticket.prestation.materials) ? ` · ${describeMaterials(ticket.prestation.materials)}` : ''}
      </b>
    )
    : <b className="text-brand-orange-600">à déclarer</b>;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5 hover:bg-emerald-100/70"
      title="Voir le compte-rendu et les photos"
    >
      <span className="font-bold text-emerald-900">
        {ticket.nfType === 'CENTRAL_CONFIG' ? `NF config centrale${ticket.ontSerialNumber ? ` · ONT ${ticket.ontSerialNumber}` : ''}` : 'NF standard'}
      </span>
      <span>Prestation : {prestation}</span>
      {photos > 0 && <span className="text-slate-700">📷 {photos} photo{photos > 1 ? 's' : ''}</span>}
    </button>
  );
};

// Litige accepted by the orienteur: on hold, with the RDV (highlighted when due) and "Relancer".
export const SuspendedNotice: React.FC<{ ticket: Ticket; onRelaunch: () => void }> = ({ ticket, onRelaunch }) => {
  if (ticket.currentStatus !== 'SUSPENDED') return null;
  const proximity = ticket.lastLitigeRdvDate ? rdvProximity(ticket.lastLitigeRdvDate) : null;
  const rdvStyle =
    proximity === 'PAST' ? 'bg-rose-100 text-rose-800' :
    proximity === 'TODAY' ? 'bg-amber-200 text-amber-900' :
    proximity === 'TOMORROW' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700';
  const rdvLabel =
    proximity === 'PAST' ? 'RDV dépassé' :
    proximity === 'TODAY' ? 'RDV aujourd\'hui' :
    proximity === 'TOMORROW' ? 'RDV demain' : 'RDV';
  return (
    <div className="bg-slate-100 border border-slate-300 p-2.5 rounded-xl text-xs text-slate-800 flex flex-wrap items-center justify-between gap-2">
      <div className="space-y-0.5">
        <div><b>⏸ Suspendu</b> · motif validé : {ticket.lastLitigeReasonLabel || 'Litige'}</div>
        {ticket.lastLitigeRdvDate && (
          <span className={`inline-block font-semibold px-1.5 py-0.5 rounded ${rdvStyle}`}>
            📅 {rdvLabel} : {formatCasablancaDateTime(ticket.lastLitigeRdvDate)}
          </span>
        )}
      </div>
      <button onClick={onRelaunch} className="px-3 py-1.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0">
        🔄 Relancer
      </button>
    </div>
  );
};

// "Hors ticket · Fiabilisation": created in the app, to follow up and bill.
export const ManualTicketBadge: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  if (ticket.origin !== 'MANUAL') return null;
  const label = MANUAL_TICKET_NATURES.find(n => n.code === ticket.manualNature)?.label || 'Intervention';
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 bg-violet-100 text-violet-800"
      title={`Créé dans l'application${ticket.createdByName ? ` par ${ticket.createdByName}` : ''} — à facturer`}
    >
      <Wrench className="w-3 h-3" />
      <span>Hors ticket · {label}</span>
    </span>
  );
};
