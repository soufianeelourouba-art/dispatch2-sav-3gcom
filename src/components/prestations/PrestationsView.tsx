import React, { useEffect, useState } from 'react';
import { Ticket, User } from '../../types';
import { store } from '../../services/storage';
import { exportPrestationsToExcel } from '../../services/excelExporter';
import { formatCasablancaDateTime } from '../../domain/format';
import { PRESTATIONS, describeMaterials, hasMaterials, prestationLabel, type PrestationCode, type PrestationStatus } from '../../domain/prestations';
import {
  amountOf, hasTarifs, periodPreset, prestationLines, summarizeByTechnician,
  type Period, type PrestationLine, type Tarifs,
} from '../../domain/prestationReport';
import { Camera, ChevronDown, ChevronRight, Download, Search, Settings2, Wallet } from 'lucide-react';

interface PrestationsViewProps {
  currentUser: User;
  onOpenTicketHistory: (ticket: Ticket) => void;
}

type Preset = 'TODAY' | 'WEEK' | 'MONTH' | 'LAST_MONTH';
const PRESETS: [Preset, string][] = [['TODAY', "Aujourd'hui"], ['WEEK', 'Cette semaine'], ['MONTH', 'Ce mois'], ['LAST_MONTH', 'Mois dernier']];

const STATUS: Record<PrestationStatus, { label: string; className: string }> = {
  DECLAREE: { label: 'Déclarée', className: 'bg-emerald-100 text-emerald-800' },
  A_DECLARER: { label: 'À déclarer', className: 'bg-amber-100 text-amber-900' },
  NON_FACTURABLE: { label: 'Non facturable', className: 'bg-rose-100 text-rose-800' },
  INCLUSE: { label: 'Incluse (splitter)', className: 'bg-slate-100 text-slate-700' },
};

const dh = (n: number) => `${n.toLocaleString('fr-MA')} DH`;

export const PrestationsView: React.FC<PrestationsViewProps> = ({ currentUser, onOpenTicketHistory }) => {
  const isManager = currentUser.role === 'MANAGER';
  const sectors = store.getSectors(currentUser);
  const [sectorId, setSectorId] = useState('ALL');
  const [preset, setPreset] = useState<Preset | null>('MONTH');
  const [period, setPeriod] = useState<Period>(() => periodPreset('MONTH'));
  const [statusFilter, setStatusFilter] = useState<PrestationStatus | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showTarifs, setShowTarifs] = useState(false);
  const [, setVersion] = useState(0);

  useEffect(() => store.subscribe(() => setVersion(v => v + 1)), []);

  const tarifs = store.getTarifs();
  const withAmounts = hasTarifs(tarifs);
  const tickets = store.getTickets(currentUser, sectorId);
  const technicians = store.getTechnicians();
  const lines = prestationLines(tickets, technicians, period);
  const summaries = summarizeByTechnician(lines, tarifs);

  const count = (status: PrestationStatus) => lines.filter(l => l.status === status).length;
  const total = summaries.reduce((sum, s) => sum + s.amount, 0);
  const nf = lines.filter(l => !l.earlierCycle).length;

  const visible = summaries
    .filter(s => !search.trim() || s.techName.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(s => !statusFilter || s.lines.some(l => l.status === statusFilter));

  const choosePreset = (p: Preset) => { setPreset(p); setPeriod(periodPreset(p)); };
  const keyOf = (techId: string | undefined, techName: string) => techId || techName;
  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const scopeLabel = sectorId === 'ALL'
    ? (isManager ? 'Tous les secteurs' : sectors.map(s => s.name).join(', '))
    : sectors.find(s => s.id === sectorId)?.name || '';

  const exportExcel = () => exportPrestationsToExcel({ summaries, lines, period, tarifs, scopeLabel });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-5 h-5 text-brand-orange-500" /> Paiement des techniciens
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Ce que chaque technicien a réalisé sur la période (date de la NF) : base du paiement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isManager && (
            <button
              onClick={() => setShowTarifs(v => !v)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5"
            >
              <Settings2 className="w-4 h-4" /> Tarifs
            </button>
          )}
          <button
            onClick={exportExcel}
            disabled={lines.length === 0}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Exporter Excel
          </button>
        </div>
      </div>

      {showTarifs && isManager && <TarifsEditor tarifs={tarifs} onClose={() => setShowTarifs(false)} />}

      {/* Period and scope */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center gap-3 text-xs">
        <div className="flex gap-1 overflow-x-auto">
          {PRESETS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => choosePreset(id)}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap ${preset === id ? 'bg-brand-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Du</span>
          <input
            type="date" value={period.from} max={period.to}
            onChange={e => { if (e.target.value) { setPeriod(p => ({ ...p, from: e.target.value })); setPreset(null); } }}
            className="border border-slate-300 rounded-lg px-2 py-1"
          />
          <span className="text-slate-500">au</span>
          <input
            type="date" value={period.to} min={period.from}
            onChange={e => { if (e.target.value) { setPeriod(p => ({ ...p, to: e.target.value })); setPreset(null); } }}
            className="border border-slate-300 rounded-lg px-2 py-1"
          />
        </div>
        {sectors.length > 1 && (
          <select value={sectorId} onChange={e => setSectorId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 font-semibold">
            <option value="ALL">{isManager ? 'Tous les secteurs' : `Tous mes secteurs (${sectors.length})`}</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <div className="relative lg:ml-auto lg:w-56">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Technicien…"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5"
          />
        </div>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Kpi label="NF clôturées" value={nf} />
        <Kpi label="Déclarées" value={count('DECLAREE')} tone="emerald"
          active={statusFilter === 'DECLAREE'} onClick={() => setStatusFilter(statusFilter === 'DECLAREE' ? null : 'DECLAREE')} />
        <Kpi label="À déclarer" value={count('A_DECLARER')} tone="amber" hint="à relancer auprès des techniciens"
          active={statusFilter === 'A_DECLARER'} onClick={() => setStatusFilter(statusFilter === 'A_DECLARER' ? null : 'A_DECLARER')} />
        <Kpi label="Non facturables · incluses" value={`${count('NON_FACTURABLE')} · ${count('INCLUSE')}`} tone="slate"
          active={statusFilter === 'NON_FACTURABLE'} onClick={() => setStatusFilter(statusFilter === 'NON_FACTURABLE' ? null : 'NON_FACTURABLE')} />
        <Kpi
          label="Montant à payer"
          value={withAmounts ? dh(total) : '—'}
          hint={withAmounts ? undefined : isManager ? 'renseignez les tarifs' : 'tarifs non renseignés'}
          onClick={isManager && !withAmounts ? () => setShowTarifs(true) : undefined}
        />
      </div>

      {/* Per technician */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Aucune NF sur cette période.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2.5">Technicien</th>
                  <th className="px-2 py-2.5">NF</th>
                  <th className="px-2 py-2.5">Déclarées</th>
                  <th className="px-2 py-2.5">À déclarer</th>
                  {PRESTATIONS.map(p => (
                    <th key={p.code} className="px-2 py-2.5 whitespace-nowrap" title={p.withRaccordements ? 'Nombre de raccordements' : undefined}>
                      {p.label.replace(' (splitter)', '')}{p.withRaccordements ? ' (racc.)' : ''}
                    </th>
                  ))}
                  <th className="text-left px-2 py-2.5">Matériel</th>
                  {withAmounts && <th className="text-right px-3 py-2.5">Montant</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(s => {
                  const key = keyOf(s.techId, s.techName);
                  const open = expanded.has(key);
                  const detail = statusFilter ? s.lines.filter(l => l.status === statusFilter) : s.lines;
                  return (
                    <React.Fragment key={key}>
                      <tr onClick={() => toggle(key)} className={`cursor-pointer ${open ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}>
                        <td className="px-3 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                          {open ? <ChevronDown className="w-3.5 h-3.5 inline mr-1" /> : <ChevronRight className="w-3.5 h-3.5 inline mr-1" />}
                          {s.techName}
                        </td>
                        <td className="text-center font-mono">{s.nf}</td>
                        <td className="text-center font-mono text-emerald-700 font-bold">{s.declared}</td>
                        <td className="text-center font-mono">
                          {s.toDeclare > 0 ? <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">{s.toDeclare}</span> : <span className="text-slate-300">0</span>}
                        </td>
                        {PRESTATIONS.map(p => (
                          <td key={p.code} className={`text-center font-mono ${s.units[p.code] ? 'text-slate-900 font-bold' : 'text-slate-300'}`}>{s.units[p.code]}</td>
                        ))}
                        <td className="px-2 text-slate-600 whitespace-nowrap">{hasMaterials(s.materials) ? describeMaterials(s.materials) : <span className="text-slate-300">—</span>}</td>
                        {withAmounts && <td className="px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{dh(s.amount)}</td>}
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={8 + (withAmounts ? 1 : 0)} className="bg-slate-50/70 px-3 pb-3">
                            <DetailLines lines={detail} tarifs={withAmounts ? tarifs : null} onOpen={onOpenTicketHistory} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500 px-1">
        Une intervention compte à la date de sa NF. Une reprise faite par le même technicien sous 7 jours n'est pas facturable ;
        pour un incident splitter, la prestation est payée une seule fois (les autres tickets sont « inclus »).
      </p>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: React.ReactNode; tone?: 'emerald' | 'amber' | 'slate'; hint?: string; active?: boolean; onClick?: () => void }> =
  ({ label, value, tone, hint, active, onClick }) => {
    const color = tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900';
    return (
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`text-left bg-white p-3 rounded-xl border transition-colors ${active ? 'border-brand-navy-900 ring-2 ring-brand-navy-700/20' : 'border-slate-200'} ${onClick ? 'hover:bg-slate-50' : 'cursor-default'}`}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`text-lg font-bold font-mono mt-0.5 ${color}`}>{value}</div>
        {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
      </button>
    );
  };

const DetailLines: React.FC<{ lines: PrestationLine[]; tarifs: Tarifs | null; onOpen: (ticket: Ticket) => void }> = ({ lines, tarifs, onOpen }) => (
  <div className="mt-1 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
    {lines.map(l => {
      const ticket = store.getTicketById(l.ticketId);
      const lead = l.leadTicketId ? store.getTicketById(l.leadTicketId) : null;
      return (
        <div key={`${l.ticketId}-${l.date}`} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-slate-500 font-mono w-28 shrink-0">{formatCasablancaDateTime(l.date)}</span>
          <button onClick={() => ticket && onOpen(ticket)} className="font-mono font-bold text-slate-900 hover:underline">{l.ticketNumber}</button>
          <span className="text-slate-600 truncate max-w-48">{l.clientName}</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS[l.status].className}`}>{STATUS[l.status].label}</span>
          {l.manual && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 text-violet-800">Hors ticket</span>}
          {l.earlierCycle && <span className="text-[11px] text-slate-500">(intervention précédente)</span>}
          {l.code && (
            <b className="text-slate-900">{prestationLabel(l.code as PrestationCode)}{l.code === 'FO_01_02' ? ` × ${l.units}` : ''}</b>
          )}
          {hasMaterials(l.materials) && <span className="text-slate-600">{describeMaterials(l.materials)}</span>}
          {l.photoCount > 0 && <span className="text-slate-500 flex items-center gap-0.5"><Camera className="w-3 h-3" />{l.photoCount}</span>}
          {lead && <span className="text-slate-500">avec {lead.ticketNumber}</span>}
          {tarifs && <span className="ml-auto font-mono font-bold">{dh(amountOf(l, tarifs))}</span>}
        </div>
      );
    })}
  </div>
);

// Unit prices (manager only): 01-02 FO is paid per raccordement
const TarifsEditor: React.FC<{ tarifs: Tarifs; onClose: () => void }> = ({ tarifs, onClose }) => {
  const [draft, setDraft] = useState<Record<string, string>>(
    () => Object.fromEntries(PRESTATIONS.map(p => [p.code, tarifs[p.code] ? String(tarifs[p.code]) : '']))
  );
  const save = () => {
    const prices: Tarifs = {};
    PRESTATIONS.forEach(p => {
      const value = Number(draft[p.code].replace(',', '.'));
      if (value > 0) prices[p.code] = Math.round(value * 100) / 100;
    });
    store.setTarifs(prices);
    onClose();
  };
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3 text-xs">
      <div className="font-bold text-slate-900">Tarifs payés aux techniciens (DH)</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {PRESTATIONS.map(p => (
          <label key={p.code} className="space-y-1">
            <span className="block font-semibold text-slate-700">{p.label}{p.withRaccordements ? ' · par raccordement' : ''}</span>
            <input
              inputMode="decimal"
              value={draft[p.code]}
              onChange={e => setDraft(d => ({ ...d, [p.code]: e.target.value }))}
              placeholder="0"
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
            />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">Le matériel (joints, splitters, câble) est compté en quantités, sans prix pour l'instant.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
        <button onClick={save} className="px-4 py-1.5 font-bold text-white bg-brand-navy-900 rounded-lg">Enregistrer</button>
      </div>
    </div>
  );
};
