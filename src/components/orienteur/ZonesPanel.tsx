import React, { useState } from 'react';
import { TechnicalZone, User } from '../../types';
import { store } from '../../services/storage';
import { Check, MapPin, Pencil, Plus, X } from 'lucide-react';

const normalize = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

// Intervention zones of the orienteur's sectors: created and renamed by the orienteur, usable
// at once by the import and the dispatch. Deleting a zone stays with the manager (Référentiel).
export const ZonesPanel: React.FC<{ currentUser: User; onCreated?: (label: string) => void }> = ({ currentUser, onCreated }) => {
  const sectors = store.getSectors(currentUser);
  const zones = store.getTechnicalZones(currentUser);
  const technicians = store.getTechnicians(currentUser);
  const [sectorId, setSectorId] = useState(sectors[0]?.id || '');
  const [label, setLabel] = useState('');
  const [msan, setMsan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TechnicalZone | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editMsan, setEditMsan] = useState('');

  const effectiveSectorId = sectors.some(s => s.id === sectorId) ? sectorId : sectors[0]?.id || '';
  const duplicate = (sid: string, name: string, exceptId?: string) =>
    zones.some(z => z.sectorId === sid && z.id !== exceptId && normalize(z.label) === normalize(name));

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!effectiveSectorId) return setError('Aucun secteur ne vous est affecté.');
    if (!label.trim()) return setError('Indiquez le nom de la zone.');
    if (duplicate(effectiveSectorId, label)) return setError(`La zone « ${label.trim()} » existe déjà dans ce secteur.`);
    const sector = sectors.find(s => s.id === effectiveSectorId);
    store.addTechnicalZone({
      sectorId: effectiveSectorId,
      dcId: sector?.dcId,
      label: label.trim(),
      msanCode: normalize(msan || label),
    });
    onCreated?.(label.trim());
    setLabel('');
    setMsan('');
  };

  const saveEdit = () => {
    if (!editing) return;
    if (!editLabel.trim()) return setError('Le nom de la zone ne peut pas être vide.');
    if (duplicate(editing.sectorId, editLabel, editing.id)) return setError(`La zone « ${editLabel.trim()} » existe déjà dans ce secteur.`);
    store.updateTechnicalZone(editing.id, { label: editLabel.trim(), msanCode: normalize(editMsan || editLabel) });
    setEditing(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3">
        <div className="text-sm font-bold text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4" /> Nouvelle zone d'intervention</div>
        <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs">
          {sectors.length > 1 ? (
            <select value={effectiveSectorId} onChange={e => setSectorId(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 font-semibold">
              {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <div className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 font-semibold text-slate-700">Secteur {sectors[0]?.name}</div>
          )}
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nom de la zone (ex : Californie)" className="border border-slate-300 rounded-xl px-3 py-2" />
          <input value={msan} onChange={e => setMsan(e.target.value)} placeholder="Code MSAN (facultatif)" className="border border-slate-300 rounded-xl px-3 py-2 uppercase" />
          <button type="submit" className="px-4 py-2 rounded-xl bg-brand-navy-900 text-white font-bold">Créer</button>
        </div>
        <p className="text-[11px] text-slate-500">
          Utilisez le nom tel qu'il apparaît dans la colonne « Zone » des fichiers Excel : l'import reconnaîtra la zone automatiquement.
          La zone est utilisable tout de suite ; affectez-la ensuite à vos techniciens.
        </p>
        {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
      </form>

      {sectors.map(sector => {
        const sectorZones = zones.filter(z => z.sectorId === sector.id).sort((a, b) => a.label.localeCompare(b.label));
        return (
          <div key={sector.id} className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-900">
              {sector.name} <span className="font-normal text-slate-400">· {sectorZones.length} zone(s)</span>
            </div>
            {sectorZones.length === 0 ? (
              <p className="p-4 text-xs text-slate-500">Aucune zone dans ce secteur.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {sectorZones.map(zone => {
                  const covering = technicians.filter(t => t.isActive && t.zoneIds.includes(zone.id));
                  const isEditing = editing?.id === zone.id;
                  return (
                    <div key={zone.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                      {isEditing ? (
                        <>
                          <input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1" autoFocus />
                          <input value={editMsan} onChange={e => setEditMsan(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 uppercase w-32" placeholder="Code MSAN" />
                          <button onClick={saveEdit} className="p-1.5 rounded-lg bg-emerald-600 text-white" aria-label="Enregistrer"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { setEditing(null); setError(null); }} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Annuler"><X className="w-3.5 h-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <b className="text-slate-900">{zone.label}</b>
                          <span className="text-slate-400">{zone.msanCode}</span>
                          <span className={`ml-auto ${covering.length ? 'text-slate-600' : 'text-amber-700 font-semibold'}`}>
                            {covering.length ? `👤 ${covering.map(t => t.fullName).join(', ')}` : 'Aucun technicien affecté'}
                          </span>
                          <button
                            onClick={() => { setEditing(zone); setEditLabel(zone.label); setEditMsan(zone.msanCode); setError(null); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100" title="Renommer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
