import React, { useState } from 'react';
import { User, Sector } from '../types';
import { store } from '../services/storage';
import { Smartphone, Shield, Radio, RefreshCw, ChevronDown, Check, LogOut } from 'lucide-react';

interface NavbarProps {
  currentUser: User;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onToggleSimulator: () => void;
  isSimulatorOpen: boolean;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onTabChange,
  onToggleSimulator,
  isSimulatorOpen,
  onLogout,
}) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const allUsers = store.getAllUsers();
  const allSectors = store.getSectors();

  const currentSector = currentUser.sectorId
    ? allSectors.find(s => s.id === currentUser.sectorId)
    : null;

  const handleSelectUser = (user: User) => {
    store.setCurrentUser(user);
    setShowUserDropdown(false);
    // Switch to relevant default tab
    if (user.role === 'DISPATCHER') {
      onTabChange('dispatch');
    } else {
      onTabChange('manager-dashboard');
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold text-sm tracking-tight shadow-sm">
              3G
            </div>
            <div>
              <span className="text-base font-bold text-slate-900 tracking-tight block leading-none">
                3GCOM SAV
              </span>
              <span className="text-[11px] text-slate-700 font-medium tracking-wide">
                Fibre Optique Maroc Telecom
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation Links based on role */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {currentUser.role === 'DISPATCHER' ? (
              <>
                <button
                  onClick={() => onTabChange('dispatch')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'dispatch'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Dispatch du jour
                </button>
                <button
                  onClick={() => onTabChange('suivi')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'suivi'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Suivi direct
                </button>
                <button
                  onClick={() => onTabChange('import')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'import'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Importer Excel
                </button>
                <button
                  onClick={() => onTabChange('files')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'files'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Files spéciales
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onTabChange('manager-dashboard')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'manager-dashboard'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Vue Royaume
                </button>
                <button
                  onClick={() => onTabChange('referentiel')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'referentiel'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Référentiel & Zones
                </button>
                <button
                  onClick={() => onTabChange('techniciens')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'techniciens'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Techniciens & Doublons
                </button>
                <button
                  onClick={() => onTabChange('import')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    activeTab === 'import'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Import Excel
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: Authenticated User Status & Logout */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200">
              <div className="w-7 h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                {currentUser.name.charAt(0)}
              </div>
              <div className="text-left hidden sm:block">
                <div className="font-bold text-slate-900 text-xs leading-tight">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-600 font-medium leading-tight">
                  {currentUser.role === 'DISPATCHER'
                    ? `Orienteur · ${currentSector?.name || 'Secteur'}`
                    : 'Direction SAV · Manager'}
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                title="Se déconnecter de la session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
