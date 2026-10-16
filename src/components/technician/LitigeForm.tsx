import React, { useState } from 'react';
import { LITIGE_REASONS, LitigeReasonCode } from '../../types';
import { RDV_SLOTS, dayLabel, rdvDayOptions, rdvToIso } from '../../domain/litiges';
import { Choice } from './FieldControls';
import { ArrowLeft, Send } from 'lucide-react';

interface LitigeFormProps {
  token: string;
  ticket: { id: string; ticketNumber: string; clientName: string; splitterRef?: string };
  groupSize: number;
  onDone: (message: string) => void;
  onCancel: () => void;
}

// Litige from the technician app: reason, RDV with day + slot buttons (Morocco time), request
// for another client number when unreachable. Same choices as the Telegram buttons.
export const LitigeForm: React.FC<LitigeFormProps> = ({ token, ticket, groupSize, onDone, onCancel }) => {
  const days = rdvDayOptions();
  const [reason, setReason] = useState<LitigeReasonCode | ''>('');
  const [day, setDay] = useState<string>('');
  const [otherDate, setOtherDate] = useState(''); // yyyy-mm-dd
  const [slot, setSlot] = useState<string>('');
  const [otherTime, setOtherTime] = useState(''); // hh:mm
  const [requestNewContact, setRequestNewContact] = useState(true);
  const [notes, setNotes] = useState('');
  const [applyToSplitter, setApplyToSplitter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wholeSplitter = groupSize > 1 && applyToSplitter;

  const dayCodeChosen = day === 'OTHER'
    ? (otherDate ? `${otherDate.slice(2, 4)}${otherDate.slice(5, 7)}${otherDate.slice(8, 10)}` : '')
    : day;
  const timeChosen = slot === 'OTHER' ? otherTime : slot;
  const rdvIso = reason === 'RDV' && dayCodeChosen && timeChosen ? rdvToIso(dayCodeChosen, timeChosen) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!reason) return setError('Choisissez le motif du litige.');
    if (reason === 'RDV' && !rdvIso) return setError('Choisissez le jour et l\'heure du RDV.');
    if (reason === 'RDV' && Date.parse(rdvIso!) < Date.now() - 3600_000) return setError('Le RDV est dans le passé.');
    if (reason === 'AUTRE' && !notes.trim()) return setError('Décrivez le motif du litige.');

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'REPORT',
          ticketId: ticket.id,
          scope: wholeSplitter ? 'SPLITTER' : 'TICKET',
          report: {
            kind: 'LITIGE',
            reasonCode: reason,
            rdvDateTime: reason === 'RDV' ? rdvIso : undefined,
            requestNewContact: reason === 'CLIENT_UNREACHABLE' && requestNewContact,
            notes: notes.trim() || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Envoi impossible, réessayez.');
      const who = wholeSplitter ? `les ${groupSize} tickets du splitter ${ticket.splitterRef}` : `le ticket ${ticket.ticketNumber}`;
      onDone(`Litige signalé pour ${who}. L'orienteur est alerté.` +
        (reason === 'CLIENT_UNREACHABLE' && requestNewContact ? ' Votre demande de nouveau numéro lui est transmise.' : ''));
    } catch {
      setError('Pas de connexion Internet. Réessayez dans un instant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const section = 'bg-white rounded-2xl border border-slate-200 p-4 space-y-3';
  const title = 'text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <form onSubmit={submit} className="space-y-3 pb-28">
      <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>
      <div className="bg-rose-600 text-white rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/70 font-bold">Signaler un litige</div>
        <div className="font-mono font-bold text-lg">{ticket.ticketNumber}</div>
        <div className="text-sm text-white/85">{ticket.clientName}</div>
      </div>

      {groupSize > 1 && (
        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-orange-50 border border-brand-orange-400 text-sm cursor-pointer">
          <input type="checkbox" checked={applyToSplitter} onChange={e => setApplyToSplitter(e.target.checked)} className="mt-1" />
          <span><b>Appliquer aux {groupSize} tickets du splitter {ticket.splitterRef}</b></span>
        </label>
      )}

      <div className={section}>
        <div className={title}>Motif</div>
        <div className="grid gap-2">
          {LITIGE_REASONS.map(r => (
            <Choice key={r.code} selected={reason === r.code} onClick={() => setReason(r.code)}>{r.label}</Choice>
          ))}
        </div>
      </div>

      {reason === 'CLIENT_UNREACHABLE' && (
        <label className="flex items-start gap-3 p-4 rounded-2xl bg-white border-2 border-brand-navy-900 text-sm cursor-pointer">
          <input type="checkbox" checked={requestNewContact} onChange={e => setRequestNewContact(e.target.checked)} className="mt-1 w-5 h-5" />
          <span>
            <b>📞 Demander un autre numéro à l'orienteur</b>
            <span className="block text-slate-500 text-xs">Il vous renverra le ticket avec le nouveau contact.</span>
          </span>
        </label>
      )}

      {reason === 'RDV' && (
        <div className={section}>
          <div className={title}>Jour du RDV</div>
          <div className="grid grid-cols-2 gap-2">
            {days.map(d => (
              <Choice key={d.code} selected={day === d.code} onClick={() => setDay(d.code)}>{d.label}</Choice>
            ))}
            <Choice selected={day === 'OTHER'} onClick={() => setDay('OTHER')}>Autre date</Choice>
          </div>
          {day === 'OTHER' && (
            <input type="date" value={otherDate} onChange={e => setOtherDate(e.target.value)} className="w-full h-12 px-3 border border-slate-300 rounded-xl" />
          )}

          <div className={title}>Heure</div>
          <div className="grid grid-cols-3 gap-2">
            {RDV_SLOTS.map(s => (
              <Choice key={s} selected={slot === s} onClick={() => setSlot(s)}>{s.replace(':00', 'h')}</Choice>
            ))}
          </div>
          <Choice selected={slot === 'OTHER'} onClick={() => setSlot('OTHER')}>Autre heure</Choice>
          {slot === 'OTHER' && (
            <input type="time" value={otherTime} onChange={e => setOtherTime(e.target.value)} className="w-full h-12 px-3 border border-slate-300 rounded-xl" />
          )}
          {rdvIso && (
            <p className="text-sm font-semibold text-emerald-800">
              RDV : {dayLabel(dayCodeChosen)} à {timeChosen.replace(':', 'h')}
            </p>
          )}
        </div>
      )}

      {reason && (
        <div className={section}>
          <div className={title}>{reason === 'AUTRE' ? 'Motif (obligatoire)' : 'Commentaire (facultatif)'}</div>
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={reason === 'CLIENT_UNREACHABLE' ? 'ex : 3 appels sans réponse, personne sur place' : 'ex : précisions pour l\'orienteur'}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
          />
        </div>
      )}

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-sm font-semibold">{error}</div>}

      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 p-3 backdrop-blur">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full max-w-lg mx-auto h-14 rounded-2xl bg-rose-600 active:bg-rose-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send className="w-5 h-5" /> {isSubmitting ? 'Envoi…' : 'Envoyer le litige'}
        </button>
      </div>
    </form>
  );
};
