import React, { useState, useEffect } from 'react';
import { User, Ticket } from './types';
import { store } from './services/storage';
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
  const [activeTab, setActiveTab] = useState<string>('dispatch');
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [inspectedTicket, setInspectedTicket] = useState<Ticket | null>(null);
  const [, setVersion] = useState<number>(0);

  // Subscribe to storage changes for pure reactivity
  useEffect(() => {
    const handleStoreChange = () => {
      setCurrentUser(store.getCurrentUser());
      setVersion(v => v + 1);
    };

    const unsubscribe = store.subscribe(handleStoreChange);
    return () => unsubscribe();
  }, []);

  // Set default tab when user role changes
  const handleUserChange = (newUser: User) => {
    setCurrentUser(newUser);
    if (newUser.role === 'DISPATCHER') {
      setActiveTab('dispatch');
    } else {
      setActiveTab('manager-dashboard');
    }
  };

  const handleLogout = () => {
    store.logout();
    setCurrentUser(null);
  };

  // Check URL query parameters for mobile technician portal (?tech=... or ?act=...)
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const techParam = urlParams?.get('tech');
  const actParam = urlParams?.get('act') || urlParams?.get('start');

  if (techParam || actParam) {
    return (
      <TechnicianMobilePortal
        technicianId={techParam || undefined}
        activationToken={actParam || undefined}
        onExitPortal={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setVersion(v => v + 1);
        }}
      />
    );
  }

  // If user is not logged in, display the secure LoginView
  if (!currentUser) {
    return <LoginView onLoginSuccess={handleUserChange} />;
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
              <TechniciensView />
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
