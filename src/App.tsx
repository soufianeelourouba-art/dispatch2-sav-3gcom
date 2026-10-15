import React, { useState, useEffect } from 'react';
import { User, Ticket } from './types';
import { store, AuthStatus } from './services/storage';
import { Navbar } from './components/Navbar';
import { SumCheckBanner } from './components/SumCheckBanner';
import { DispatchView } from './components/orienteur/DispatchView';
import { LiveMonitoringView } from './components/orienteur/LiveMonitoringView';
import { ImportExcelView } from './components/orienteur/ImportExcelView';
import { SpecialQueuesView } from './components/orienteur/SpecialQueuesView';
import { ManagerDashboardView } from './components/manager/ManagerDashboardView';
import { ReferentielView } from './components/manager/ReferentielView';
import { TechniciensView } from './components/manager/TechniciensView';
import { TelegramSimulatorDrawer } from './components/telegram/TelegramSimulatorDrawer';
import { TicketHistoryModal } from './components/TicketHistoryModal';
import { LoginView } from './components/auth/LoginView';
import { TechnicianMobilePortal } from './components/technician/TechnicianMobilePortal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(store.getCurrentUser());
  const [authStatus, setAuthStatus] = useState<AuthStatus>(store.getAuthStatus());
  const [activeTab, setActiveTab] = useState<string>('dispatch');
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [inspectedTicket, setInspectedTicket] = useState<Ticket | null>(null);
  const [, setVersion] = useState<number>(0);

  // Subscribe to storage changes for pure reactivity
  useEffect(() => {
    const handleStoreChange = () => {
      const next = store.getCurrentUser();
      setCurrentUser(prev => {
        // Land on the role's home tab right after signing in
        if (next && (!prev || prev.role !== next.role)) {
          setActiveTab(next.role === 'DISPATCHER' ? 'dispatch' : 'manager-dashboard');
        }
        return next;
      });
      setAuthStatus(store.getAuthStatus());
      setVersion(v => v + 1);
    };

    const unsubscribe = store.subscribe(handleStoreChange);
    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    store.logout();
  };

  // Mobile technician portal, opened with the technician's secret link (?act=...)
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const actParam = urlParams?.get('act') || urlParams?.get('start');

  if (actParam) {
    return (
      <TechnicianMobilePortal
        activationToken={actParam}
        onExitPortal={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setVersion(v => v + 1);
        }}
      />
    );
  }

  if (authStatus === 'LOADING') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Chargement de votre espace…
      </div>
    );
  }

  // If user is not logged in, display the secure LoginView
  if (!currentUser) {
    return <LoginView noProfile={authStatus === 'NO_PROFILE'} />;
  }

  // Calculate sum check for the active scope
  const sumCheck = store.computeSumCheck(currentUser);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans antialiased">
      
      {/* Top Bar Contract Navigation (§2) */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        onTabChange={tab => setActiveTab(tab)}
        onToggleSimulator={() => setIsSimulatorOpen(!isSimulatorOpen)}
        isSimulatorOpen={isSimulatorOpen}
        onLogout={handleLogout}
      />

      {/* Systematic Sum Check Invariant Banner (§8.3) */}
      <SumCheckBanner sumCheck={sumCheck} />

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Orienteur Scoped Views */}
        {currentUser.role === 'DISPATCHER' && (
          <>
            {activeTab === 'dispatch' && (
              <DispatchView
                currentUser={currentUser}
                onOpenTicketHistory={t => setInspectedTicket(t)}
                onNavigateToImport={() => setActiveTab('import')}
                onNavigateToSuivi={() => setActiveTab('suivi')}
              />
            )}

            {activeTab === 'suivi' && (
              <LiveMonitoringView
                currentUser={currentUser}
                onOpenTicketHistory={t => setInspectedTicket(t)}
                onOpenSimulator={() => setIsSimulatorOpen(true)}
              />
            )}

            {activeTab === 'import' && (
              <ImportExcelView
                currentUser={currentUser}
                onImportCompleted={() => setActiveTab('dispatch')}
              />
            )}

            {activeTab === 'techniciens' && (
              <TechniciensView currentUser={currentUser} />
            )}

            {activeTab === 'files' && (
              <SpecialQueuesView
                currentUser={currentUser}
                onOpenTicketHistory={t => setInspectedTicket(t)}
              />
            )}
          </>
        )}

        {/* Manager Consolidated Views */}
        {currentUser.role === 'MANAGER' && (
          <>
            {activeTab === 'manager-dashboard' && (
              <ManagerDashboardView onOpenTicketHistory={t => setInspectedTicket(t)} />
            )}

            {activeTab === 'referentiel' && (
              <ReferentielView />
            )}

            {activeTab === 'techniciens' && (
              <TechniciensView currentUser={currentUser} />
            )}

            {activeTab === 'import' && (
              <ImportExcelView
                currentUser={currentUser}
                onImportCompleted={() => setActiveTab('manager-dashboard')}
              />
            )}
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 sm:px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            3GCOM · Plateforme de Dispatch SAV Fibre Optique Maroc Telecom
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Traçabilité inaltérable (Append-Only Event Store) · Fuseau Africa/Casablanca
          </span>
        </div>
      </footer>

      {/* Telegram Smartphone Interactive Simulator Drawer (§6 & §10) */}
      <TelegramSimulatorDrawer
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
      />

      {/* Append-Only Event Replay Modal (§8.1 & §8.5) */}
      <TicketHistoryModal
        ticket={inspectedTicket}
        onClose={() => setInspectedTicket(null)}
      />

    </div>
  );
}
