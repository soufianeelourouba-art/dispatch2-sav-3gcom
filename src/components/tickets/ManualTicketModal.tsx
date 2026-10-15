import React, { useState } from 'react';
import { ManualTicketNature, MANUAL_TICKET_NATURES, User } from '../../types';
import { store } from '../../services/storage';
import { Wrench, X } from 'lucide-react';

interface ManualTicketModalProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onCreated?: (ticketNumber: string, sent: boolean) => void;
}

// Incident without an operator ticket (urgent splitter, urgent client, fiabilisation…):
// created and optionally assigned right away, then followed and billed like any ticket.
export const ManualTicketModal: React.FC<ManualTicketModalProps> = ({ isOpen, currentUser, onClose, onCreated }) => {
  const sectors = store.getSectors(currentUser);
  const [nature, setNature] = useState<ManualTicketNature>('URGENT_SPLITTER');
  const [pickedSectorId, setSectorId] = useState('');
  const [pickedZoneId, setZoneId] = useState('');
  const [splitterRef, setSplitterRef] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Selections fall back to the first option shown (lists may still be loading)
  const sectorId = sectors.some(s => s.id === pickedSectorId) ? pickedSectorId : sectors[0]?.id || '';
  const zones = store.getTechnicalZones(currentUser, sectorId);
  const zoneId = zones.some(z => z.id === pickedZoneId) ? pickedZoneId : zones[0]?.id || '';
  const technicians = store.getTechnicians(currentUser, sectorId).filter(t => t.isActive);
  // Technicians covering the zone first
  const sortedTechs = [...technicians].sort((a, b) =>
    Number(b.zoneIds.includes(zoneId)) - Number(a.zoneIds.includes(zoneId)) || a.fullName.localeCompare(b.fullName));
  const showClient = nature !== 'FIABILISATION';

  const reset = () => {
    setSplitterRef('');
    setDescription('');
    setClientName('');
    setClientPhone('');
    setClientAddress('');
    setTechnicianId('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectorId || !zoneId) {
      setError('Choisissez un secteur et une zone d\'intervention (à créer dans le Référentiel si besoin).');
      return;
    }
    if (!description.trim()) {
      setError('Décrivez l\'incident.');
      return;
    }
    if (nature === 'URGENT_SPLITTER' && !splitterRef.trim()) {
      setError('Indiquez le numéro du splitter.');
      return;
    }
    const tech = technicians.find(t => t.id === technicianId);
    const ticket = store.createManualTicket(
      {
        nature,
        description,
        sectorId,
        technicalZoneId: zoneId,
        splitterRef: splitterRef || undefined,
        clientName: showClient ? clientName : undefined,
        clientPhone: showClient ? clientPhone : undefined,
        clientAddress,
        technician: tech ? { id: tech.id, fullName: tech.fullName } : undefined,
      },
      currentUser
    );
    reset();
    onCreated?.(ticket.ticketNumber, !!tech);
    onClose();
  };

  const input = 'w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-navy-700';
  const label = 'text-[11px] font-semibold text-slate-700 block mb-1';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-xl border border-slate-200 my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-violet-600" />
              <span>Créer un ticket (incident sans ticket)</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Suivi comme les autres tickets et marqué « hors ticket » pour la facturation.</p>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="text-slate-400 hover:text-slate-600" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <span className={label}>Nature de l'intervention *</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MANUAL_TICKET_NATURES.map(n => (
                <label
                  key={n.code}
                  className={`p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                    nature === n.code ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-300' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input type="radio" name="nature" className="sr-only" checked={nature === n.code} onChange={() => setNature(n.code)} />
                  <span className="font-bold text-slate-900 block">{n.label}</span>
                  <span className="text-[11px] text-slate-500">{n.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Secteur *</label>
              <select value={sectorId} onChange={e => { setSectorId(e.target.value); setZoneId(''); setTechnicianId(''); }} className={input}>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Zone d'intervention *</label>
              <select value={zoneId} onChange={e => setZoneId(e.target.value)} className={input}>
                {zones.length === 0 && <option value="">Aucune zone dans ce secteur</option>}
                {zones.map(z => <option key={z.id} value={z.id}>{z.label} ({z.msanCode})</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>N° splitter {nature === 'URGENT_SPLITTER' ? '*' : '(si concerné)'}</label>
            <input value={splitterRef} onChange={e => setSplitterRef(e.target.value)} placeholder="ex : SP-12/3" className={`${input} font-mono`} />
          </div>

          <div>
            <label className={label}>Description de l'incident *</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="ex : Splitter arraché suite à travaux, 6 clients sans service rue Ibn Sina"
              className={input}
            />
          </div>

          {showClient && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Client / contact (optionnel)</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Téléphone (optionnel)</label>
                <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} className={`${input} font-mono`} />
              </div>
            </div>
          )}
          <div>
            <label className={label}>Adresse / lieu (optionnel)</label>
            <input value={clientAddress} onChange={e => setClientAddress(e.target.value)} className={input} />
          </div>

          <div>
            <label className={label}>Technicien (optionnel — sinon le ticket attend dans le dispatch)</label>
            <select value={technicianId} onChange={e => setTechnicianId(e.target.value)} className={input}>
              <option value="">— Affecter plus tard —</option>
              {sortedTechs.map(t => (
                <option key={t.id} value={t.id}>
                  {t.fullName}{t.zoneIds.includes(zoneId) ? ' (couvre la zone)' : ''}{t.telegramChatId ? '' : ' — Telegram non activé'}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-semibold">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-xs font-semibold text-slate-600">
              Annuler
            </button>
            <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl">
              {technicianId ? 'Créer et envoyer au technicien' : 'Créer le ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
