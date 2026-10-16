import React, { useEffect, useState } from 'react';
import { SumCheckResult, User } from '../../types';
import { store } from '../../services/storage';
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, LayoutDashboard, LogOut, Menu, Network,
  Radio, Send, Users, Wallet, Layers, X, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  group: string;
  badge?: number;
  badgeTone?: 'orange' | 'rose';
  primary?: boolean; // shown in the mobile bottom bar
}

// Navigation per role, with live counters taken from the sum check
export function navItems(user: User, sumCheck: SumCheckResult): NavItem[] {
  const b = sumCheck.breakdown;
  if (user.role === 'DISPATCHER') {
    return [
      { id: 'dispatch', label: 'Dispatch du jour', icon: Send, group: 'Opérations', badge: b.toAssign + b.zoneToMap, badgeTone: 'orange', primary: true },
      { id: 'suivi', label: 'Suivi direct', icon: Radio, group: 'Opérations', badge: b.litige, badgeTone: 'rose', primary: true },
      { id: 'files', label: 'Files spéciales', icon: Layers, group: 'Opérations', primary: true },
      { id: 'import', label: 'Importer Excel', icon: FileSpreadsheet, group: 'Données' },
      { id: 'techniciens', label: 'Mes techniciens', icon: Users, group: 'Équipe' },
      { id: 'prestations', label: 'Prestations', icon: Wallet, group: 'Équipe', primary: true },
    ];
  }
  return [
    { id: 'manager-dashboard', label: 'Tableau de bord', icon: LayoutDashboard, group: 'Pilotage', primary: true },
    { id: 'prestations', label: 'Prestations', icon: Wallet, group: 'Pilotage', primary: true },
    { id: 'import', label: 'Import Excel', icon: FileSpreadsheet, group: 'Données', primary: true },
    { id: 'referentiel', label: 'Référentiel', icon: Network, group: 'Organisation' },
    { id: 'techniciens', label: 'Techniciens', icon: Users, group: 'Organisation', primary: true },
  ];
}

const todayLabel = () => {
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Casablanca' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
};

interface AppShellProps {
  currentUser: User;
  sumCheck: SumCheckResult;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentUser, sumCheck, activeTab, onTabChange, onLogout, children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = navItems(currentUser, sumCheck);
  const active = items.find(i => i.id === activeTab) || items[0];
  const sectors = store.getSectors(currentUser);
  const scopeLabel = currentUser.role === 'DISPATCHER'
    ? sectors.length > 1 ? `${sectors.length} secteurs` : sectors[0]?.name || 'Secteur'
    : 'Direction SAV';

  useEffect(() => { setDrawerOpen(false); }, [activeTab]);

  const go = (id: string) => { onTabChange(id); setDrawerOpen(false); window.scrollTo({ top: 0 }); };

  const sidebar = (
    <div className="flex flex-col h-full bg-brand-navy-950 text-white">
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10 shrink-0">
        <img src="/brand/logo-3gcom-white.png" alt="3GCOM" className="h-9 w-auto" />
        <div className="border-l border-white/15 pl-3 leading-tight">
          <div className="text-sm font-bold">Dispatch SAV</div>
          <div className="text-[11px] text-white/50">Fibre optique</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Navigation principale">
        {[...new Set(items.map(i => i.group))].map(group => (
          <div key={group}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{group}</div>
            <div className="space-y-0.5">
              {items.filter(i => i.group === group).map(item => {
                const isActive = item.id === active.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                      isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-brand-orange-400' : ''}`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {!!item.badge && (
                      <span className={`min-w-6 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center tabular-nums ${
                        item.badgeTone === 'rose' ? 'bg-rose-500 text-white' : 'bg-brand-orange-500 text-white'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <EncoursWidget sumCheck={sumCheck} label={currentUser.role === 'DISPATCHER' ? 'Encours du jour' : 'Encours total'} />

      <div className="p-3 border-t border-white/10 flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-full bg-brand-orange-500 flex items-center justify-center font-bold text-sm uppercase shrink-0">
          {currentUser.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-xs font-bold truncate">{currentUser.name}</div>
          <div className="text-[11px] text-white/50 truncate">{currentUser.role === 'DISPATCHER' ? 'Orienteur' : 'Manager'} · {scopeLabel}</div>
        </div>
        <button onClick={onLogout} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10" title="Se déconnecter" aria-label="Se déconnecter">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const primary = items.filter(i => i.primary).slice(0, 4);

  return (
    <div className="min-h-screen bg-surface text-slate-900 lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30">{sidebar}</aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-brand-navy-950/60" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            {sidebar}
            <button onClick={() => setDrawerOpen(false)} className="absolute top-4 right-3 p-2 text-white/70" aria-label="Fermer le menu">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-20 h-16 bg-white/85 backdrop-blur border-b border-slate-200/80 flex items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button onClick={() => setDrawerOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg text-slate-700 hover:bg-slate-100" aria-label="Ouvrir le menu">
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold tracking-tight text-slate-900 truncate">{active.label}</h1>
          <p className="text-[11px] text-slate-500 truncate">{todayLabel()} · {scopeLabel}</p>
        </div>
        <SumCheckChip sumCheck={sumCheck} />
      </header>

      {!sumCheck.isBalanced && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>Écart de comptage : {sumCheck.discrepancy > 0 ? `+${sumCheck.discrepancy}` : sumCheck.discrepancy} ticket(s).</b>
            {sumCheck.culpritTickets.length > 0 && <> Tickets concernés : {sumCheck.culpritTickets.map(c => c.ticketNumber).join(', ')}</>}
          </span>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-10">{children}</main>

      {/* Mobile bottom bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]" aria-label="Navigation rapide">
        {primary.map(item => {
          const Icon = item.icon;
          const isActive = item.id === active.id;
          return (
            <button key={item.id} onClick={() => go(item.id)} aria-label={item.label} className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${isActive ? 'text-brand-navy-900' : 'text-slate-400'}`}>
              <Icon className={`w-5 h-5 ${isActive ? 'text-brand-orange-500' : ''}`} />
              <span className="truncate max-w-full px-1">{item.label.split(' ')[0]}</span>
              {!!item.badge && (
                <span className={`absolute top-1 left-1/2 ml-1.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center ${item.badgeTone === 'rose' ? 'bg-rose-500' : 'bg-brand-orange-500'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
        <button onClick={() => setDrawerOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-slate-400">
          <Menu className="w-5 h-5" />
          <span>Plus</span>
        </button>
      </nav>
    </div>
  );
};

// Small status chip in the top bar: green when the count is consistent
const SumCheckChip: React.FC<{ sumCheck: SumCheckResult }> = ({ sumCheck }) => (
  <div
    className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
      sumCheck.isBalanced ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
    }`}
    title={`Contrôle des encours : ${sumCheck.sumOfCategories} = ${sumCheck.totalTickets}`}
  >
    {sumCheck.isBalanced ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
    {sumCheck.isBalanced ? 'Comptage conforme' : 'Écart de comptage'}
  </div>
);

// Encours split as a single colored bar, with the legend
const SEGMENTS: { key: keyof SumCheckResult['breakdown']; label: string; color: string }[] = [
  { key: 'toAssign', label: 'À affecter', color: 'bg-brand-orange-500' },
  { key: 'zoneToMap', label: 'Zone inconnue', color: 'bg-amber-300' },
  { key: 'assigned', label: 'Transmis', color: 'bg-sky-400' },
  { key: 'reopened', label: 'Relancés', color: 'bg-indigo-400' },
  { key: 'litige', label: 'Litiges', color: 'bg-rose-500' },
  { key: 'suspended', label: 'Suspendus', color: 'bg-slate-400' },
  { key: 'completed', label: 'NF', color: 'bg-emerald-500' },
];

const EncoursWidget: React.FC<{ sumCheck: SumCheckResult; label: string }> = ({ sumCheck, label }) => {
  const total = sumCheck.totalTickets || 1;
  const shown = SEGMENTS.filter(s => sumCheck.breakdown[s.key] > 0);
  return (
    <div className="mx-3 mb-3 p-3 rounded-xl bg-white/5 border border-white/10 shrink-0">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-white/60">{label}</span>
        <span className="text-lg font-bold tabular-nums">{sumCheck.totalTickets}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex bg-white/10 mt-2">
        {shown.map(s => (
          <div key={s.key} className={s.color} style={{ width: `${(sumCheck.breakdown[s.key] / total) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2.5">
        {shown.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-[11px] text-white/70">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="font-bold text-white tabular-nums">{sumCheck.breakdown[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

