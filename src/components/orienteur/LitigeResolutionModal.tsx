import React, { useState } from 'react';
import { Ticket } from '../../types';
import { store } from '../../services/storage';
import { formatCasablancaDateTime } from '../../domain/format';
import { 
  AlertTriangle, 
  RotateCcw, 
  CheckCircle, 
  X, 
  Phone, 
  MapPin, 
  Calendar, 
  Send,
  MessageSquare
} from 'lucide-react';

interface LitigeResolutionModalProps {
  ticket: Ticket | null;
  actorName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const LitigeResolutionModal: React.FC<LitigeResolutionModalProps> = ({
  ticket,
  actorName,
  onClose,
  onSuccess,
}) => {
  const [activeAction, setActiveAction] = useState<'REOPEN' | 'VALIDATE'>('REOPEN');
  const [newPhone, setNewPhone] = useState(ticket?.clientPhone || '');
  const [dispatcherNotes, setDispatcherNotes] = useState('');
  const [validationNotes, setValidationNotes] = useState('');

  if (!ticket) return null;

  const handleReopen = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatcherNotes.trim()) {
      alert('Veuillez préciser la mise à jour ou instruction pour le technicien.');
      return;
    }

    store.reopenTicketWithUpdate({
      ticketId: ticket.id,
      actorName,
      dispatcherNotes: dispatcherNotes.trim(),
      newPhone: newPhone.trim() !== ticket.clientPhone ? newPhone.trim() : undefined,
    });

    onSuccess();
    onClose();
  };

  const handleValidate = (e: React.FormEvent) => {
    e.preventDefault();
    store.validateLitige({
      ticketId: ticket.id,
      actorName,
      notes: validationNotes.trim() || undefined,
    });

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-rose-50 border-b border-rose-100 p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Traitement du Litige Terrain · {ticket.ticketNumber}
              </h2>
              <p className="text-xs text-rose-800 font-medium mt-0.5">
                Déclaré par {ticket.lastVisitedTechName || 'Le technicien'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Litige Detail Card */}
        <div className="p-5 bg-slate-50 border-b border-slate-100 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">
              Motif déclaré
            </span>
            <span className="font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded text-[11px]">
              {ticket.lastLitigeReasonLabel || 'Litige non spécifié'}
            </span>
          </div>

          {ticket.lastLitigeRdvDate && (
            <div className="flex items-center gap-2 text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 text-xs">
              <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                RDV convenu par le technicien : <b>{formatCasablancaDateTime(ticket.lastLitigeRdvDate)}</b>
              </span>
            </div>
          )}

          <div className="text-slate-700 text-xs pt-1">
            Client : <b className="text-slate-900">{ticket.clientName}</b> ({ticket.clientPhone})
            <div className="text-slate-500 text-[11px] mt-0.5">{ticket.clientAddress}</div>
          </div>
        </div>

        {/* Action Toggle */}
        <div className="p-5 space-y-4">
          <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveAction('REOPEN')}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeAction === 'REOPEN'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
              <span>Renvoyer avec mise à jour</span>
            </button>

            <button
              onClick={() => setActiveAction('VALIDATE')}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeAction === 'VALIDATE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Valider le motif du technicien</span>
            </button>
          </div>

          {/* Form 1: Reopen with update (§2) */}
          {activeAction === 'REOPEN' && (
            <form onSubmit={handleReopen} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Nouveau numéro de téléphone client (si corrigé/récupéré) :
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="06..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Message & instructions de mise à jour pour le technicien :
                </label>
                <textarea
                  rows={3}
                  value={dispatcherNotes}
                  onChange={e => setDispatcherNotes(e.target.value)}
                  placeholder="Ex: J'ai eu le client au téléphone, le gardien est présent, sonnette B4 au 2e étage. Merci d'y repasser."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                  required
                />
              </div>

              <div className="p-2.5 bg-blue-50 text-blue-900 rounded-lg text-[11px]">
                ℹ️ Le ticket se réouvrira instantanément sur le Telegram du technicien avec cette mise à jour bien visible.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Renvoyer au technicien</span>
                </button>
              </div>
            </form>
          )}

          {/* Form 2: Validate technician reason (§2) */}
          {activeAction === 'VALIDATE' && (
            <form onSubmit={handleValidate} className="space-y-3 text-xs">
              <p className="text-slate-600 text-xs">
                Vous confirmez que le motif du technicien ({ticket.lastLitigeReasonLabel}) est exact. Le dossier sera orienté vers l'équipe Génie Civil, replanifié selon le RDV ou escaladé à Maroc Telecom.
              </p>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Note d'escalade / décision d'orientation (Optionnel) :
                </label>
                <textarea
                  rows={2}
                  value={validationNotes}
                  onChange={e => setValidationNotes(e.target.value)}
                  placeholder="Ex: Prise de RDV confirmée avec le client, dossier mis en attente jusqu'à la date convenue."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-lg shadow-sm"
                >
                  Valider le motif
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
