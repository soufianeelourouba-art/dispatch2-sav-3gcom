import React, { useEffect, useState } from 'react';
import { Ticket } from '../../types';
import { store } from '../../services/storage';
import { formatCasablancaDateTime, formatRdvDate } from '../../domain/format';
import { 
  AlertTriangle, 
  RotateCcw, 
  CheckCircle, 
  X, 
  Phone, 
  MapPin, 
  Calendar, 
  Send,
  MessageSquare,
  UserCog
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
  const [activeAction, setActiveAction] = useState<'REOPEN' | 'VALIDATE' | 'REASSIGN'>('REOPEN');
  const [newTechId, setNewTechId] = useState('');
  const [reassignNote, setReassignNote] = useState('');

  // "Hors de ma zone" → reassignment is the expected answer
  useEffect(() => {
    if (!ticket) return;
    setActiveAction(ticket.lastLitigeReasonCode === 'HORS_ZONE' ? 'REASSIGN' : 'REOPEN');
    setNewTechId('');
    setReassignNote('');
  }, [ticket?.id]);
  // Empty = number unchanged (the current one is shown as placeholder)
  const [newPhone, setNewPhone] = useState('');
  const [dispatcherNotes, setDispatcherNotes] = useState('');
  const [validationNotes, setValidationNotes] = useState('');

  if (!ticket) return null;
  const isSuspended = ticket.currentStatus === 'SUSPENDED';

  const handleReopen = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatcherNotes.trim()) {
      alert('Veuillez préciser la mise à jour ou instruction pour le technicien.');
      return;
    }

    if (ticket.lastLitigeNeedsContact && !newPhone.trim()
      && !window.confirm('Le technicien a demandé un autre numéro. Renvoyer quand même sans nouveau numéro ?')) {
      return;
    }
    store.reopenTicketWithUpdate({
      ticketId: ticket.id,
      actorName,
      dispatcherNotes: dispatcherNotes.trim(),
      newPhone: newPhone.trim() && newPhone.trim() !== ticket.clientPhone ? newPhone.trim() : undefined,
    });
    setNewPhone('');
    setDispatcherNotes('');

    onSuccess();
    onClose();
  };

  // Other technicians of the ticket's sector, those covering its zone first
  const candidates = store.getTechnicians()
    .filter(t => t.isActive && t.id !== ticket.currentAssignedTechId
      && (t.sectorId === ticket.sectorId || (t.sectorIds || []).includes(ticket.sectorId || '')))
    .sort((a, b) =>
      Number(b.zoneIds.includes(ticket.technicalZoneId || '')) - Number(a.zoneIds.includes(ticket.technicalZoneId || ''))
      || a.fullName.localeCompare(b.fullName));

  const handleReassign = (e: React.FormEvent) => {
    e.preventDefault();
    const tech = candidates.find(t => t.id === newTechId);
    if (!tech) {
      alert('Choisissez le technicien à qui confier le ticket.');
      return;
    }
    store.reassignTicket(ticket.id, tech.id, tech.fullName, actorName,
      reassignNote.trim() || `Réaffecté suite au litige « ${ticket.lastLitigeReasonLabel || 'litige'} »`);
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
                {isSuspended ? 'Relancer le ticket suspendu' : 'Traitement du Litige Terrain'} · {ticket.ticketNumber}
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

          {ticket.lastLitigeNeedsContact && (
            <div className="flex items-center gap-2 text-blue-900 bg-blue-50 p-2 rounded border border-blue-200 text-xs font-semibold">
              <Phone className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Le technicien demande un autre numéro pour joindre le client.</span>
            </div>
          )}

          {ticket.lastLitigeNotes && (
            <div className="flex items-start gap-2 text-slate-800 bg-white p-2 rounded border border-slate-200 text-xs">
              <MessageSquare className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>Commentaire du technicien : <i>« {ticket.lastLitigeNotes} »</i></span>
            </div>
          )}

          {ticket.lastLitigeRdvDate && (
            <div className="flex items-center gap-2 text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 text-xs">
              <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                RDV convenu par le technicien : <b>{formatRdvDate(ticket.lastLitigeRdvDate)}</b>
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

            {!isSuspended && <button
              onClick={() => setActiveAction('REASSIGN')}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeAction === 'REASSIGN'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCog className="w-3.5 h-3.5 text-violet-600" />
              <span>Réaffecter</span>
            </button>}

            {!isSuspended && <button
              onClick={() => setActiveAction('VALIDATE')}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeAction === 'VALIDATE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Valider le motif (suspendre)</span>
            </button>}
          </div>

          {/* Form 1: Reopen with update (§2) */}
          {/* Form: reassign to another technician (wrong zone…) */}
          {activeAction === 'REASSIGN' && !isSuspended && (
            <form onSubmit={handleReassign} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nouveau technicien :</label>
                <select
                  value={newTechId}
                  onChange={e => setNewTechId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  <option value="">— Choisir un technicien —</option>
                  {candidates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}{t.zoneIds.includes(ticket.technicalZoneId || '') ? ' (couvre la zone)' : ''}{t.telegramChatId ? '' : ' — Telegram non activé'}
                    </option>
                  ))}
                </select>
                {candidates.length === 0 && <p className="text-amber-700 mt-1">Aucun autre technicien actif dans ce secteur.</p>}
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Note (facultative) :</label>
                <input
                  value={reassignNote}
                  onChange={e => setReassignNote(e.target.value)}
                  placeholder="ex : zone Californie, pas Inara"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="p-2.5 bg-violet-50 text-violet-900 rounded-lg text-[11px]">
                ℹ️ Le nouveau technicien reçoit l'ordre de travail sur Telegram ; le ticket repasse « Transmis ».
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-sm flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  <span>Réaffecter et envoyer</span>
                </button>
              </div>
            </form>
          )}

          {(activeAction === 'REOPEN' || isSuspended) && (
            <form onSubmit={handleReopen} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Nouveau numéro du client (laisser vide si inchangé) :
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder={`Actuel : ${ticket.clientPhone || '—'}`}
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
                ℹ️ Le technicien reçoit sur Telegram un message de relance court : nouveau numéro (cliquable pour appeler) et votre consigne en premier.
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
          {activeAction === 'VALIDATE' && !isSuspended && (
            <form onSubmit={handleValidate} className="space-y-3 text-xs">
              <p className="text-slate-600 text-xs">
                Vous confirmez le motif du technicien ({ticket.lastLitigeReasonLabel}). Le ticket passe en <b>⏸ Suspendu</b> : il sort des litiges et de la liste du technicien, et vous le relancerez depuis l'onglet « Suspendus » (par exemple le jour du RDV).
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
