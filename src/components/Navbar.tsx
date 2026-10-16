import React from 'react';
import { User } from '../types';
import { store } from '../services/storage';
import { LogOut } from 'lucide-react';

interface NavbarProps {
  currentUser: User;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onToggleSimulator?: () => void;
  isSimulatorOpen?: boolean;
  onLogout?: () => void;
}

interface NavTab {
  id: string;
  label: string;
}

const DISPATCHER_TABS: NavTab[] = [
  { id: 'dispatch', label: 'Dispatch du jour' },
  { id: 'suivi', label: 'Suivi direct' },
  { id: 'import', label: 'Importer Excel' },
  { id: 'techniciens', label: 'Mes techniciens' },
  { id: 'files', label: 'Files spéciales' },
  { id: 'prestations', label: 'Prestations' },
];

const MANAGER_TABS: NavTab[] = [
  { id: 'manager-dashboard', label: 'Vue Royaume' },
  { id: 'referentiel', label: 'Référentiel' },
  { id: 'techniciens', label: 'Techniciens' },
  { id: 'import', label: 'Import Excel' },
  { id: 'prestations', label: 'Prestations' },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onTabChange,
  onLogout,
}) => {
  const userSectors = store.getSectors(currentUser);
  const tabs = currentUser.role === 'DISPATCHER' ? DISPATCHER_TABS : MANAGER_TABS;
  const roleLabel = currentUser.role === 'DISPATCHER'
    ? userSectors.length > 1
      ? `Orienteur · ${userSectors.length} secteurs`
      : `Orienteur · ${userSectors[0]?.name || 'Secteur'}`
    : 'Direction SAV · Manager';

  const tabButton = (tab: NavTab, compact: boolean) => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`relative whitespace-nowrap font-semibold transition-colors cursor-pointer ${
          compact ? 'px-3 py-2.5 text-xs' : 'px-3 h-16 text-[13px]'
        } ${isActive ? 'text-white' : 'text-white/65 hover:text-white'}`}
      >
        {tab.label}
        <span
          className={`absolute left-3 right-3 bottom-0 h-[3px] rounded-t-full transition-colors ${
            isActive ? 'bg-brand-orange-500' : 'bg-transparent'
          }`}
        />
      </button>
    );
  };

  return (
    <header className="bg-brand-navy-900 sticky top-0 z-30 shadow-md shadow-brand-navy-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <img src="/brand/logo-3gcom-white.png" alt="3GCOM" className="h-10 w-auto" />
            <div className="hidden sm:block border-l border-white/15 pl-3">
              <span className="text-sm font-bold text-white tracking-tight block leading-none">
                Dispatch SAV
              </span>
              <span className="text-[11px] text-white/55 font-medium">
                Fibre optique
              </span>
            </div>
          </div>

          {/* Navigation (desktop) */}
          <nav className="hidden md:flex items-stretch self-stretch" aria-label="Navigation principale">
            {tabs.map(tab => tabButton(tab, false))}
          </nav>

          {/* User & logout */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-brand-orange-500 text-white flex items-center justify-center font-bold text-xs uppercase">
                {currentUser.name.charAt(0)}
              </div>
              <div className="text-left hidden lg:block">
                <div className="font-semibold text-white text-xs leading-tight">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-white/55 font-medium leading-tight">
                  {roleLabel}
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="Se déconnecter"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation (mobile / tablet): scrollable tab strip */}
      <nav
        className="md:hidden flex overflow-x-auto scrollbar-none border-t border-white/10 bg-brand-navy-950 px-2"
        aria-label="Navigation principale"
      >
        {tabs.map(tab => tabButton(tab, true))}
      </nav>
    </header>
  );
};
