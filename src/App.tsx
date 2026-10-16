import React, { useState, useEffect } from 'react';
import { User, Ticket } from './types';
import { store, AuthStatus } from './services/storage';
import { AppShell } from './components/layout/AppShell';
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
import { PrestationsView } from './components/prestations/PrestationsView';

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
      <div className="min-h-screen bg-brand-navy-900 flex items-center justify-center text-white/60 text-sm">
        Chargement de votre espace…
      </div>
    );
  }

  // If user is not logged in, display the secure LoginView
  if (!currentUser) {
    return <LoginView noProfile={authStatus === 'NO_PROFILE'} />;
  }

  // Calculate sum check for the active scope
  // Orienteurs work on the day's set; the manager keeps the overall figures
  const sumCheck = store.computeSumCheck(currentUser, currentUser.role === 'DISPATCHER');

  return (
    <AppShell
      currentUser={currentUser}
      sumCheck={sumCheck}
      activeTab={activeTab}
      onTabChange={tab => setActiveTab(tab)}
      onLogout={handleLogout}
    >

        
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

            {activeTab === 'prestations' && (
              <PrestationsView currentUser={currentUser} onOpenTicketHistory={t => setInspectedTicket(t)} />
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

            {activeTab === 'prestations' && (
              <PrestationsView currentUser={currentUser} onOpenTicketHistory={t => setInspectedTicket(t)} />
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

    </AppShell>
  );
}
