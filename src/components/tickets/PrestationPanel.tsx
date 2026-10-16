import React, { useEffect, useState } from 'react';
import { Ticket } from '../../types';
import { store } from '../../services/storage';
import { describeMaterials, prestationLabel } from '../../domain/prestations';
import { formatCasablancaDateTime } from '../../domain/format';
import { Camera, X } from 'lucide-react';

// NF details declared by the technician: prestation, material, ONT serial and photos.
export const PrestationPanel: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  const [photos, setPhotos] = useState<{ id: string; kind: string; dataUrl: string }[] | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const hasPhotos = !!(ticket.prestation?.photoIds.length || ticket.serialPhotoIds?.length);

  useEffect(() => {
    setPhotos(null);
    if (!hasPhotos) return;
    store.getTicketPhotos(ticket).then(setPhotos).catch(() => setPhotos([]));
  }, [ticket.id, hasPhotos]);

  if (ticket.currentStatus !== 'COMPLETED' && !ticket.prestation) return null;

  const lead = ticket.collectiveLeadTicketId ? store.getTicketById(ticket.collectiveLeadTicketId) : null;

  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50/40 text-xs space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Compte-rendu technicien</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-slate-500 block">NF</span>
          <b className="text-slate-900">{ticket.nfType === 'CENTRAL_CONFIG' ? 'Config centrale' : 'Standard'}</b>
          {ticket.ontSerialNumber && <span className="block font-mono text-slate-700">ONT : {ticket.ontSerialNumber}</span>}
        </div>
        <div>
          <span className="text-slate-500 block">Prestation</span>
          {ticket.prestationStatus === 'NON_FACTURABLE' ? (
            <b className="text-rose-700">Non facturable : reprise de sa propre intervention (≤ 7 jours)</b>
          ) : ticket.prestationStatus === 'INCLUSE' ? (
            <b className="text-slate-700">Incluse dans l'incident splitter{lead ? ` (ticket ${lead.ticketNumber})` : ''}</b>
          ) : ticket.prestation ? (
            <>
              <b className="text-slate-900">
                {prestationLabel(ticket.prestation.code)}
                {ticket.prestation.raccordements ? ` × ${ticket.prestation.raccordements} raccordement(s)` : ''}
              </b>
              <span className="block text-slate-600">{describeMaterials(ticket.prestation.materials)}</span>
              <span className="block text-[10px] text-slate-500">
                Déclarée par {ticket.prestation.declaredBy} le {formatCasablancaDateTime(ticket.prestation.declaredAt)}
              </span>
            </>
          ) : (
            <b className="text-brand-orange-600">À déclarer par le technicien</b>
          )}
        </div>
      </div>

      {hasPhotos && (
        <div className="flex flex-wrap gap-2 pt-1">
          {photos === null && <span className="text-slate-500 flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> Chargement des photos…</span>}
          {photos?.map(p => (
            <button key={p.id} onClick={() => setZoomed(p.dataUrl)} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200" title={p.kind === 'SERIAL' ? 'Étiquette ONT' : 'Matériel installé'}>
              <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] font-bold py-0.5">{p.kind === 'SERIAL' ? 'N° série' : 'Matériel'}</span>
            </button>
          ))}
        </div>
      )}

      {zoomed && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setZoomed(null)}>
          <button className="absolute top-4 right-4 text-white" aria-label="Fermer"><X className="w-7 h-7" /></button>
          <img src={zoomed} alt="Photo" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
};
