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

          {/* Zone 3: Primary Actions (Telegram Simulator & User Switcher) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Telegram Smartphone Simulator toggle */}
            <button
              onClick={onToggleSimulator}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                isSimulatorOpen
                  ? 'bg-sky-50 text-sky-700 border-sky-300 ring-2 ring-sky-200'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Tester le canal Telegram technicien sur smartphone simulé"
            >
              <Smartphone className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden sm:inline">Simulateur Telegram</span>
              <span className="sm:hidden">Telegram</span>
            </button>

            {/* User Account / Role switcher dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors border border-slate-200"
              >
                <div className="text-left">
                  <div className="font-semibold text-slate-900 text-[11px] leading-tight">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight">
                    {currentUser.role === 'DISPATCHER'
                      ? `Orienteur · ${currentSector?.name || 'Secteur'}`
                      : 'Manager National'}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 ml-1" />
              </button>

              {showUserDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserDropdown(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50">
                    <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-600 border-b border-slate-100">
                      Changer de profil (Simulation des rôles)
                    </div>
                    {allUsers.map(user => {
                      const userSector = user.sectorId
                        ? allSectors.find(s => s.id === user.sectorId)
                        : null;
                      const isSelected = user.id === currentUser.id;

                      return (
                        <button
                          key={user.id}
                          onClick={() => handleSelectUser(user)}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                            isSelected ? 'bg-slate-50/80 font-medium text-slate-900' : 'text-slate-700'
                          }`}
                        >
                          <div>
                            <div className="font-medium text-slate-900">{user.name}</div>
                            <div className="text-[10px] text-slate-500">
                              {user.role === 'DISPATCHER'
                                ? `Orienteur : ${userSector?.name || 'Non défini'}`
                                : 'Manager National (Tous secteurs)'}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />}
                        </button>
                      );
                    })}

                    {onLogout && (
                      <div className="pt-1.5 mt-1 border-t border-slate-100">
                        <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            onLogout();
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Se déconnecter de la session</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Direct Logout Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                title="Se déconnecter"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Déconnexion</span>
              </button>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
