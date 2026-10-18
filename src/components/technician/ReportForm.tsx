import React, { useEffect, useRef, useState } from 'react';
import {
  LIMITS,
  MAX_RACCORDEMENTS,
  PRESTATIONS,
  isNoWork,
  describeMaterials,
  hasMaterials,
  prestationLabel,
  validateConfigNf,
  validateDeclaration,
  type MaterialsInstalled,
  type PrestationCode,
} from '../../domain/prestations';
import { Choice, PhotoPicker, Stepper } from './FieldControls';
import { ArrowLeft, CheckCircle2, Cable, Send } from 'lucide-react';

export interface FormTicket {
  id: string;
  ticketNumber: string;
  clientName: string;
  clientAddress: string;
  splitterRef?: string;
  nfType?: 'STANDARD' | 'CENTRAL_CONFIG';
  nonBillable?: boolean; // reprise of his own intervention: no prestation
}

interface ReportFormProps {
  token: string;
  ticket: FormTicket;
  // "nf": close the ticket (and declare now or later); "declare": ticket already closed
  mode: 'nf' | 'declare';
  initialNfType?: 'STANDARD' | 'CENTRAL_CONFIG';
  splitterGroupSize?: number; // > 1: the NF applies to the whole splitter incident
  onDone: (message: string) => void;
  onCancel: () => void;
}

const NO_MATERIALS: MaterialsInstalled = { joints: 0, splitters: 0, cableMeters: 0 };

// Compte-rendu after an intervention: NF type, ONT serial (config centrale), prestation and
// installed material with photos. Same form in the browser portal and inside Telegram.
export const ReportForm: React.FC<ReportFormProps> = ({
  token,
  ticket,
  mode,
  initialNfType = 'STANDARD',
  splitterGroupSize = 1,
  onDone,
  onCancel,
}) => {
  const [nfType, setNfType] = useState<'STANDARD' | 'CENTRAL_CONFIG'>(initialNfType);
  const [serial, setSerial] = useState('');
  const [serialPhotos, setSerialPhotos] = useState<string[]>([]);
  const [code, setCode] = useState<PrestationCode | ''>('');
  const [raccordements, setRaccordements] = useState(1);
  const [withMaterials, setWithMaterials] = useState(false);
  const [materials, setMaterials] = useState<MaterialsInstalled>(NO_MATERIALS);
  const [materialPhotos, setMaterialPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorsRef = useRef<HTMLDivElement>(null);

  // Bring the problems into view once rendered (not hidden behind the fixed submit bar)
  useEffect(() => {
    if (errors.length) errorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errors]);

  const isGroup = mode === 'nf' && splitterGroupSize > 1;
  const isConfig = mode === 'nf' && nfType === 'CENTRAL_CONFIG';
  // The work done is declared only from "À déclarer" (mode "declare"), never in the NF form
  const declaring = mode === 'declare';
  const noWork = isNoWork(code || undefined);
  const effectiveMaterials = withMaterials && !noWork ? materials : NO_MATERIALS;
  const setMaterial = (key: keyof MaterialsInstalled) => (value: number) => setMaterials(m => ({ ...m, [key]: value }));

  const declaration = {
    code: code || undefined,
    raccordements: code === 'FO_01_02' ? raccordements : undefined,
    materials: effectiveMaterials,
    materialPhotos: hasMaterials(effectiveMaterials) ? materialPhotos : [],
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problems = [
      ...(isConfig ? validateConfigNf(serial, serialPhotos.length) : []),
      ...(declaring
        ? validateDeclaration({ ...declaration, materialPhotoCount: declaration.materialPhotos.length })
        : []),
    ];
    setErrors(problems);
    if (problems.length) return;

    setIsSubmitting(true);
    try {
      const body = mode === 'nf'
        ? {
            token,
            action: 'NF_FORM',
            ticketId: ticket.id,
            scope: isGroup ? 'SPLITTER' : 'TICKET',
            nfType,
            ontSerialNumber: isConfig ? serial : undefined,
            serialPhotos: isConfig ? serialPhotos : undefined,
            declaration: declaring ? declaration : undefined,
          }
        : { token, action: 'DECLARE', ticketId: ticket.id, declaration };
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors([data.error || 'Envoi impossible, réessayez.']);
        return;
      }
      const count = data.ticketNumbers?.length || 1;
      onDone(
        mode === 'declare'
          ? `Prestation déclarée pour le ticket ${ticket.ticketNumber}. Merci !`
          : `تم تسجيل NF${count > 1 ? ` (${count} tickets du splitter)` : ''}. سجّل الأشغال لاحقا في « À déclarer ».`
      );
    } catch {
      setErrors(['Pas de connexion Internet. Réessayez dans un instant.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const section = 'bg-white rounded-2xl border border-slate-200 p-4 space-y-3';
  const title = 'text-xs font-bold uppercase tracking-wider text-slate-500';

  return (
    <form onSubmit={submit} className="space-y-3 pb-28">
      <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
        <ArrowLeft className="w-4 h-4" /> {mode === 'nf' ? 'رجوع' : 'Retour'}
      </button>

      <div className="bg-brand-navy-900 text-white rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/60 font-bold">
          {mode === 'nf' ? 'NF' : 'Déclaration de prestation'}
        </div>
        <div className="font-mono font-bold text-lg">{ticket.ticketNumber}</div>
        <div className="text-sm text-white/80">{ticket.clientName}</div>
        {isGroup && (
          <div className="mt-2 inline-flex items-center gap-1.5 bg-brand-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
            <Cable className="w-3.5 h-3.5" /> Splitter {ticket.splitterRef} · {splitterGroupSize} tickets {mode === 'nf' ? 'معا' : 'clôturés ensemble'}
          </div>
        )}
      </div>

      {mode === 'nf' && (
        <div className={section}>
          <div className={title}>نوع NF</div>
          <div className="grid grid-cols-2 gap-2">
            <Choice selected={nfType === 'STANDARD'} onClick={() => setNfType('STANDARD')}>✅ NF</Choice>
            <Choice selected={nfType === 'CENTRAL_CONFIG'} onClick={() => setNfType('CENTRAL_CONFIG')}>⚙️ NF Config</Choice>
          </div>
        </div>
      )}

      {isConfig && (
        <div className={section}>
          <div className={title}>N° série ONT (إجباري)</div>
          <input
            value={serial}
            onChange={e => setSerial(e.target.value.toUpperCase())}
            placeholder="مثال : ALCLB1234567"
            autoCapitalize="characters"
            className="w-full h-12 px-3 text-lg font-mono font-bold border border-slate-300 rounded-xl"
          />
          <div dir="auto" className="text-sm font-semibold text-slate-700">صورة ملصق N° série (إجبارية)</div>
          <PhotoPicker photos={serialPhotos} onChange={setSerialPhotos} max={LIMITS.photosPerKind} label="صورة" />
        </div>
      )}

      {declaring && (
        <>
          <div className={section}>
            <div className={title}>1. Prestation réalisée</div>
            <div className="grid grid-cols-2 gap-2">
              {PRESTATIONS.map(p => (
                <Choice key={p.code} selected={code === p.code} onClick={() => setCode(p.code)}>{p.noWork ? '🚫 ' : ''}{p.label}</Choice>
              ))}
            </div>
            {noWork && (
              <p className="text-xs text-slate-500">Aucun raccordement ni matériel : rien à payer pour ce ticket.</p>
            )}
            {code === 'FO_01_02' && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-sm font-semibold text-slate-700">Nombre de raccordements</span>
                <Stepper value={raccordements} onChange={setRaccordements} min={1} max={MAX_RACCORDEMENTS} />
              </div>
            )}
          </div>

          {!noWork && <div className={section}>
            <div className={title}>Matériel installé</div>
            <div className="grid grid-cols-2 gap-2">
              <Choice selected={!withMaterials} onClick={() => setWithMaterials(false)}>Aucun</Choice>
              <Choice selected={withMaterials} onClick={() => setWithMaterials(true)}>Oui, j'ai posé du matériel</Choice>
            </div>
            {withMaterials && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">Joints</span>
                  <Stepper value={materials.joints} onChange={setMaterial('joints')} max={LIMITS.joints} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">Splitters</span>
                  <Stepper value={materials.splitters} onChange={setMaterial('splitters')} max={LIMITS.splitters} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">Câble</span>
                  <Stepper value={materials.cableMeters} onChange={setMaterial('cableMeters')} max={LIMITS.cableMeters} step={10} unit="m" editable />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-1.5">Photo du matériel (obligatoire)</div>
                  <PhotoPicker photos={materialPhotos} onChange={setMaterialPhotos} max={LIMITS.photosPerKind} label="Photo" />
                </div>
              </div>
            )}
          </div>}
        </>
      )}

      {/* Summary */}
      <div className="bg-slate-100 rounded-2xl p-4 text-sm text-slate-700 space-y-1">
        <div className="font-bold text-slate-900">{mode === 'nf' ? 'ملخص' : 'Récapitulatif'}</div>
        {mode === 'nf' && <div><b>{nfType === 'CENTRAL_CONFIG' ? `NF Config${serial ? ` (${serial})` : ''}` : 'NF'}</b>{isGroup ? ` · ${splitterGroupSize} tickets` : ''}</div>}
        {mode === 'nf' && <div dir="auto" className="text-xs text-slate-500">الأشغال تُسجَّل بعد ذلك في « À déclarer ».</div>}
        {declaring && (
          <>
            <div>Prestation : <b>{code ? `${prestationLabel(code)}${code === 'FO_01_02' ? ` × ${raccordements}` : ''}` : '—'}</b></div>
            <div>Matériel : <b>{describeMaterials(effectiveMaterials)}</b></div>
          </>
        )}
      </div>

      {errors.length > 0 && (
        <div ref={errorsRef} className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3 text-sm font-semibold space-y-1">
          {errors.map((e, i) => <div key={i} dir="auto">• {e}</div>)}
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 p-3 backdrop-blur">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full max-w-lg mx-auto h-14 rounded-2xl bg-brand-orange-500 active:bg-brand-orange-600 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {mode === 'nf' ? <CheckCircle2 className="w-5 h-5" /> : <Send className="w-5 h-5" />}
          {isSubmitting ? (mode === 'nf' ? 'جاري الإرسال…' : 'Envoi…') : mode === 'nf' ? 'تأكيد NF' : 'Envoyer la déclaration'}
        </button>
      </div>
    </form>
  );
};
