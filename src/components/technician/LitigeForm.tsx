import React, { useState } from 'react';
import { LITIGE_REASONS, LitigeReasonCode } from '../../types';
import { dayCode, parseRdvText, rdvToIso } from '../../domain/litiges';
import { Choice } from './FieldControls';
import { ArrowRight, Send } from 'lucide-react';

interface LitigeFormProps {
  token: string;
  ticket: { id: string; ticketNumber: string; clientName: string; splitterRef?: string };
  groupSize: number;
  onDone: (message: string) => void;
  onCancel: () => void;
}

// Litige from the technician app: same choices and wording as the Telegram buttons
// (لا يجيب, RDV → غدا / تاريخ آخر, GC, مشكل آخر, Hors Zone). Texts in simple Arabic.
export const LitigeForm: React.FC<LitigeFormProps> = ({ token, ticket, groupSize, onDone, onCancel }) => {
  const [reason, setReason] = useState<LitigeReasonCode | ''>('');
  const [rdvChoice, setRdvChoice] = useState<'TOMORROW' | 'OTHER' | ''>('');
  const [rdvText, setRdvText] = useState('');
  const [notes, setNotes] = useState('');
  const [applyToSplitter, setApplyToSplitter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wholeSplitter = groupSize > 1 && applyToSplitter;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!reason) return setError('اختر سبب الـ Litige.');
    if (reason === 'RDV' && !rdvChoice) return setError('اختر « غدا » أو « تاريخ آخر ».');
    if (reason === 'RDV' && rdvChoice === 'OTHER' && !rdvText.trim()) return setError('اكتب موعد الـ RDV.');
    if (reason === 'AUTRE' && !notes.trim()) return setError('اشرح المشكل.');

    // RDV: tomorrow without time, or the text typed (a date is read from it when possible)
    const rdvDateTime = reason !== 'RDV' ? undefined
      : rdvChoice === 'TOMORROW' ? rdvToIso(dayCode(new Date(Date.now() + 86400_000)), '00:00') || undefined
      : parseRdvText(rdvText) || undefined;
    const reportNotes = reason === 'RDV' ? (rdvChoice === 'TOMORROW' ? 'غدا' : rdvText.trim()) : notes.trim() || undefined;

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
          report: { kind: 'LITIGE', reasonCode: reason, rdvDateTime, notes: reportNotes },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'تعذر الإرسال، أعد المحاولة.');
      const label = LITIGE_REASONS.find(r => r.code === reason)?.techLabel || reason;
      const who = wholeSplitter ? `${groupSize} tickets (Splitter ${ticket.splitterRef})` : `Ticket ${ticket.ticketNumber}`;
      onDone(`تم تسجيل Litige : ${who} (${label}). تم إخبار المنسق.`);
    } catch {
      setError('لا يوجد اتصال بالإنترنت. أعد المحاولة بعد قليل.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const section = 'bg-white rounded-2xl border border-slate-200 p-4 space-y-3';
  const title = 'text-sm font-bold text-slate-500';

  return (
    <form onSubmit={submit} className="space-y-3 pb-28">
      <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
        <ArrowRight className="w-4 h-4" /> رجوع
      </button>
      <div className="bg-rose-600 text-white rounded-2xl p-4">
        <div className="text-xs text-white/75 font-bold">تسجيل Litige</div>
        <div dir="ltr" className="font-mono font-bold text-lg text-right">{ticket.ticketNumber}</div>
        <div dir="auto" className="text-sm text-white/85">{ticket.clientName}</div>
      </div>

      {groupSize > 1 && (
        <label className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-orange-50 border border-brand-orange-400 text-sm cursor-pointer">
          <input type="checkbox" checked={applyToSplitter} onChange={e => setApplyToSplitter(e.target.checked)} className="mt-1" />
          <span><b>تطبيق على كل التذاكر ({groupSize})</b><span dir="ltr" className="block text-right text-xs text-slate-600">Splitter {ticket.splitterRef}</span></span>
        </label>
      )}

      <div className={section}>
        <div className={title}>السبب</div>
        <div className="grid grid-cols-2 gap-2">
          {LITIGE_REASONS.map(r => (
            <Choice key={r.code} selected={reason === r.code} onClick={() => { setReason(r.code); setError(null); }}>{r.techLabel}</Choice>
          ))}
        </div>
      </div>

      {reason === 'RDV' && (
        <div className={section}>
          <div className={title}>موعد الـ RDV</div>
          <div className="grid grid-cols-2 gap-2">
            <Choice selected={rdvChoice === 'TOMORROW'} onClick={() => setRdvChoice('TOMORROW')}>📅 غدا</Choice>
            <Choice selected={rdvChoice === 'OTHER'} onClick={() => setRdvChoice('OTHER')}>🗓 تاريخ آخر</Choice>
          </div>
          {rdvChoice === 'OTHER' && (
            <input
              value={rdvText}
              onChange={e => setRdvText(e.target.value)}
              placeholder="مثال : 20/10 15h"
              dir="auto"
              className="w-full h-12 px-3 border border-slate-300 rounded-xl text-base"
            />
          )}
        </div>
      )}

      {reason && reason !== 'RDV' && (
        <div className={section}>
          <div className={title}>{reason === 'AUTRE' ? 'اشرح المشكل (إجباري)' : 'ملاحظة (اختياري)'}</div>
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            dir="auto"
            placeholder={reason === 'CLIENT_UNREACHABLE' ? 'مثال : 3 مكالمات بدون جواب' : 'ملاحظة للمنسق'}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
          />
        </div>
      )}

      {error && <div dir="auto" className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-sm font-semibold">{error}</div>}

      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 p-3 backdrop-blur">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full max-w-lg mx-auto h-14 rounded-2xl bg-rose-600 active:bg-rose-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send className="w-5 h-5" /> {isSubmitting ? 'جاري الإرسال…' : 'إرسال Litige'}
        </button>
      </div>
    </form>
  );
};
