import React from 'react';
import { Ticket, TicketEvent } from '../types';
import { store } from '../services/storage';
import { formatCasablancaDateTime } from '../domain/format';
import { 
  X, 
  Clock, 
  User, 
  Phone, 
  MapPin, 
  AlertCircle, 
  CheckCircle2, 
  Send, 
  ArrowRight,
  RotateCcw,
  Ruler,
  Cpu,
  Calendar
} from 'lucide-react';

interface TicketHistoryModalProps {
  ticket: Ticket | null;
  onClose: () => void;
}

export const TicketHistoryModal: React.FC<TicketHistoryModalProps> = ({ ticket, onClose }) => {
  if (!ticket) return null;

  const events = store.getEventsForTicket(ticket.id);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div 
        className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Traçabilité Inaltérable · {ticket.ticketNumber}
              </h2>
              {ticket.visitCount > 1 && (
                <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  {ticket.visitCount}e visite
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Historique append-only auditable · Fuseau horaire Africa/Casablanca
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Client & Intervention Details Strip */}
        <div className="px-6 py-4 bg-white border-b border-slate-100 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px] font-semibold uppercase">Abonné</span>
            <span className="font-bold text-slate-900 text-sm">{ticket.clientName}</span>
            <span className="text-slate-500 block text-[11px] font-mono">{ticket.clientNumber}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px] font-semibold uppercase">Contact Téléphonique</span>
            <span className="font-bold text-slate-900 font-mono text-sm">{ticket.clientPhone}</span>
            {ticket.reopenedWithNewPhone && (
              <span className="text-[10px] text-blue-700 block font-semibold">
                (Mis à jour par orienteur)
              </span>
            )}
          </div>
          <div className="col-span-2">
            <span className="text-slate-400 block text-[11px] font-semibold uppercase">Adresse d'intervention</span>
            <span className="font-medium text-slate-800">{ticket.clientAddress}</span>
            <span className="text-xs text-slate-500 block mt-0.5">
              Zone MSAN : <b className="text-slate-700">{ticket.rawZoneText}</b>
            </span>
          </div>
        </div>

        {/* Events Timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
            Chronologie inaltérable ({events.length} événements)
          </h3>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {events.map((evt, idx) => {
              const isLast = idx === events.length - 1;
              return (
                <div key={evt.id} className="relative group">
                  {/* Status dot */}
                  <div className={`absolute -left-[19px] top-1 w-3 h-3 rounded-full border-2 bg-white transition-all ${
                    evt.eventType === 'NF_SUBMITTED' ? 'border-emerald-600 bg-emerald-600' :
                    evt.eventType === 'LITIGE_REPORTED' ? 'border-rose-600 bg-rose-600' :
                    evt.eventType === 'LITIGE_REOPENED' ? 'border-blue-600 bg-blue-600' :
                    'border-slate-400'
                  }`} />

                  {/* Event card */}
                  <div className={`p-4 rounded-xl border text-xs ${
                    isLast ? 'bg-slate-50/90 border-slate-300 shadow-xs' : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-slate-900">
                        {renderEventTitle(evt.eventType)}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {formatCasablancaDateTime(evt.createdAt)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-1.5">
                      <span>Auteur : <b>{evt.actorName}</b></span>
                      <span>·</span>
                      <span className="capitalize">{evt.actorRole.toLowerCase()}</span>
                    </div>

                    {/* NF specifics */}
                    {evt.eventType === 'NF_SUBMITTED' && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 space-y-1 mb-2">
                        <div className="font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Clôture NF {evt.nfType === 'CENTRAL_CONFIG' ? 'avec config centrale' : 'Standard'}</span>
                        </div>
                        {evt.ontSerialNumber && (
                          <div className="font-mono text-[11px] flex items-center gap-1">
                            <Cpu className="w-3 h-3 text-emerald-700" />
                            <span>Numéro de série ONT : <b>{evt.ontSerialNumber}</b></span>
                          </div>
                        )}
                        <div className="text-[11px] flex items-center gap-1">
                          <Ruler className="w-3 h-3 text-emerald-700" />
                          <span>Câble optique posé : <b>{evt.cableLengthMeters || 0} mètres</b></span>
                        </div>
                      </div>
                    )}

                    {/* Litige specifics */}
                    {evt.eventType === 'LITIGE_REPORTED' && (
                      <div className="p-2.5 rounded-lg bg-rose-50 text-rose-900 border border-rose-200 space-y-1 mb-2">
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>Litige déclaré : {evt.litigeReasonLabel || evt.litigeReasonCode}</span>
                        </div>
                        {evt.rdvDateTime && (
                          <div className="text-[11px] flex items-center gap-1 text-amber-800 font-medium">
                            <Calendar className="w-3 h-3 text-amber-600" />
                            <span>Rendez-vous convenu : <b>{formatCasablancaDateTime(evt.rdvDateTime)}</b></span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dispatcher Reopen with update */}
                    {evt.eventType === 'LITIGE_REOPENED' && (
                      <div className="p-2.5 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 space-y-1 mb-2">
                        <div className="font-bold flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                          <span>Ticket réouvert avec mise à jour</span>
                        </div>
                        {evt.newClientPhone && (
                          <div className="text-[11px] font-mono">
                            Nouveau téléphone : <b>{evt.newClientPhone}</b>
                          </div>
                        )}
                        {evt.dispatcherUpdateNotes && (
                          <div className="text-[11px] italic bg-white p-2 rounded border border-blue-100">
                            "{evt.dispatcherUpdateNotes}"
                          </div>
                        )}
                      </div>
                    )}

                    {evt.notes && evt.eventType !== 'LITIGE_REOPENED' && (
                      <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded border border-slate-100 mt-1">
                        "{evt.notes}"
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors shadow-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

function renderEventTitle(type: string): string {
  switch (type) {
    case 'IMPORT': return '📥 Import / Enregistrement initial';
    case 'MANUAL_CREATED': return '🛠 Ticket hors opérateur créé';
    case 'PROPOSED': return '💡 Proposition moteur calculée';
    case 'ASSIGNED': return '👤 Affectation validée';
    case 'REASSIGNED': return '🔄 Réaffectation manuelle';
    case 'TELEGRAM_SENT': return '✈️ Ordre transmis par Telegram';
    case 'NF_SUBMITTED': return '🟢 Normalisé (NF) validé';
    case 'LITIGE_REPORTED': return '🔴 Litige Client (LC) déclaré';
    case 'LITIGE_REOPENED': return '🔄 Litige réouvert avec mise à jour';
    case 'LITIGE_VALIDATED': return '✓ Motif de litige validé par l\'orienteur';
    default: return type;
  }
}
