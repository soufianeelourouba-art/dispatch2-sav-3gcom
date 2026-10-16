import React, { useRef, useState } from 'react';
import { Camera, Minus, Plus, X } from 'lucide-react';
import { compressPhoto } from './photos';

// Big touch-friendly controls for the technician forms (gloves, sunlight, one hand).

export const Stepper: React.FC<{
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  step?: number;
  unit?: string;
  editable?: boolean;
}> = ({ value, onChange, min = 0, max, step = 1, unit, editable = false }) => {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v))));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center disabled:opacity-30 active:bg-slate-200"
        aria-label="Moins"
      >
        <Minus className="w-5 h-5" />
      </button>
      {editable ? (
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={e => set(Number(e.target.value) || 0)}
          className="w-20 h-11 text-center text-lg font-bold font-mono border border-slate-300 rounded-xl"
        />
      ) : (
        <span className="w-12 text-center text-xl font-bold font-mono text-slate-900">{value}</span>
      )}
      <button
        type="button"
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="w-11 h-11 rounded-xl bg-brand-navy-900 text-white flex items-center justify-center disabled:opacity-30 active:bg-brand-navy-800"
        aria-label="Plus"
      >
        <Plus className="w-5 h-5" />
      </button>
      {unit && <span className="text-sm text-slate-600 font-semibold">{unit}</span>}
    </div>
  );
};

export const PhotoPicker: React.FC<{
  photos: string[];
  onChange: (photos: string[]) => void;
  max: number;
  label: string;
}> = ({ photos, onChange, max, label }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, max - photos.length)) {
        added.push(await compressPhoto(file));
      }
      onChange([...photos, ...added]);
    } catch (err: any) {
      setError(err?.message || 'Photo illisible.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
            <img src={p} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
              aria-label="Supprimer la photo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-brand-orange-500 text-brand-orange-600 flex flex-col items-center justify-center gap-1 text-[11px] font-bold active:bg-brand-orange-50"
          >
            <Camera className="w-6 h-6" />
            <span>{busy ? '…' : label}</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onFiles(e.target.files)} />
      {error && <p className="text-xs text-rose-700 font-semibold">{error}</p>}
    </div>
  );
};

export const Choice: React.FC<{ selected: boolean; onClick: () => void; children: React.ReactNode }> = ({ selected, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-h-12 px-3 py-2.5 rounded-xl border-2 text-sm font-bold text-left transition-colors ${
      selected ? 'border-brand-navy-900 bg-brand-navy-900 text-white' : 'border-slate-200 bg-white text-slate-800 active:bg-slate-50'
    }`}
  >
    {children}
  </button>
);
