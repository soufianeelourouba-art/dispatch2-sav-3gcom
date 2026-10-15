import React from 'react';
import { Ticket, MANUAL_TICKET_NATURES } from '../../types';
import { Cable, Wrench } from 'lucide-react';

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
