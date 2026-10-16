import React, { useState } from 'react';
import { DC, Sector, TechnicalZone, ZoneAlias, User, Technician } from '../../types';
import { store } from '../../services/storage';
import { formatCasablancaDateTime } from '../../domain/format';
import { 
  Building2, 
  MapPin, 
  Plus, 
  Link2, 
  Check, 
  Search, 
  Radio, 
  KeyRound,
  ShieldCheck,
  Edit2,
  Trash2,
  X,
  Users,
  Lock,
  Eye,
  EyeOff,
  UserCheck,
  Send,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Network,
  Layers,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { setupTelegramBot } from '../../services/api';

export const ReferentielView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'HIERARCHY' | 'DCS' | 'SECTORS' | 'ZONES' | 'USERS' | 'ALIASES' | 'TELEGRAM_CONFIG'>('HIERARCHY');
  const [, setStoreVersion] = useState(0);

  // Subscribe directly to store for instant reactivity when items are added/modified
  React.useEffect(() => {
    const unsub = store.subscribe(() => setStoreVersion(v => v + 1));
    return () => unsub();
  }, []);
  
  // Store data
  const dcs = store.getDCs();
  const sectors = store.getSectors();
  const zones = store.getTechnicalZones();
  const aliases = store.getZoneAliases();
  const allUsers = store.getAllUsers();
  const allTechs = store.getTechnicians();

  // Expanded DCs and Sectors in Hierarchy tree
  const [expandedDcs, setExpandedDcs] = useState<Record<string, boolean>>({
    'dc-casa': true,
    'dc-rabat': true,
    'dc-nord': true,
  });
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({
    'sec-cas-nord': true,
    'sec-cas-centre': true,
    'sec-rab-sale': true,
  });

  // DC Form & Edit Modal
  const [newDcCode, setNewDcCode] = useState('');
  const [newDcName, setNewDcName] = useState('');
  const [newDcDesc, setNewDcDesc] = useState('');
  const [editingDc, setEditingDc] = useState<DC | null>(null);
  const [editDcCode, setEditDcCode] = useState('');
  const [editDcName, setEditDcName] = useState('');
  const [editDcDesc, setEditDcDesc] = useState('');

  // Sector Form & Edit Modal
  const [newSectorCode, setNewSectorCode] = useState('');
  const [newSectorName, setNewSectorName] = useState('');
  // The selects show their first option by default; when nothing was picked yet (or the
  // list was still loading when the page opened), that first option is the selection.
  const [newSectorDcId, setNewSectorDcId] = useState('');
  const sectorDcId = dcs.some(d => d.id === newSectorDcId) ? newSectorDcId : dcs[0]?.id || '';
  const [newSectorDispatcherId, setNewSectorDispatcherId] = useState('');
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [editSectorCode, setEditSectorCode] = useState('');
  const [editSectorName, setEditSectorName] = useState('');
  const [editSectorDcId, setEditSectorDcId] = useState('');
  const [editSectorDispatcherId, setEditSectorDispatcherId] = useState('');

  // Zone Form & Edit Modal
  const [newZoneSectorId, setNewZoneSectorId] = useState('');
  const zoneSectorId = sectors.some(sec => sec.id === newZoneSectorId) ? newZoneSectorId : sectors[0]?.id || '';
  const [newZoneLabel, setNewZoneLabel] = useState('');
  const [newZoneMsan, setNewZoneMsan] = useState('');
  const [newZoneDesc, setNewZoneDesc] = useState('');
  const [editingZone, setEditingZone] = useState<TechnicalZone | null>(null);
  const [editZoneLabel, setEditZoneLabel] = useState('');
  const [editZoneMsan, setEditZoneMsan] = useState('');
  const [editZoneSectorId, setEditZoneSectorId] = useState('');
  const [editZoneDesc, setEditZoneDesc] = useState('');

  // User Accounts Form & Edit Modal
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [newUserRole, setNewUserRole] = useState<'DISPATCHER' | 'MANAGER'>('DISPATCHER');
  const [newUserSelectedSectorIds, setNewUserSelectedSectorIds] = useState<string[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserSelectedSectorIds, setEditUserSelectedSectorIds] = useState<string[]>([]);

  // Alias Form
  const [newAliasRaw, setNewAliasRaw] = useState('');
  const [newAliasTargetZone, setNewAliasTargetZone] = useState('');

  // Telegram bot (the token lives only in the Vercel environment variables)
  const [isConnectingBot, setIsConnectingBot] = useState(false);
  const [botResult, setBotResult] = useState<{ success: boolean; message: string } | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // --- Handlers: DC ---
  const handleAddDc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDcCode.trim() || !newDcName.trim()) return;

    store.addDC({
      code: newDcCode.trim().toUpperCase(),
      name: newDcName.trim(),
      description: newDcDesc.trim() || undefined,
    });

    setNewDcCode('');
    setNewDcName('');
    setNewDcDesc('');
    notifySuccess('Direction Régionale (DC) ajoutée avec succès !');
  };

  const handleOpenEditDc = (dc: DC) => {
    setEditingDc(dc);
    setEditDcCode(dc.code);
    setEditDcName(dc.name);
    setEditDcDesc(dc.description || '');
  };

  const handleSaveEditDc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDc) return;

    store.updateDC(editingDc.id, {
      code: editDcCode.trim().toUpperCase(),
      name: editDcName.trim(),
      description: editDcDesc.trim() || undefined,
    });

    setEditingDc(null);
    notifySuccess('Direction Régionale mise à jour.');
  };

  const handleDeleteDc = (id: string, name: string) => {
    const hasSectors = sectors.some(s => s.dcId === id);
    if (hasSectors) {
      alert(`Impossible de supprimer la DC "${name}" car des secteurs y sont encore rattachés.`);
      return;
    }
    if (confirm(`Confirmer la suppression de la DC "${name}" ?`)) {
      store.deleteDC(id);
      notifySuccess('DC supprimée.');
    }
  };

  // --- Handlers: Sector ---
  const handleAddSector = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectorDcId) {
      alert("Créez d'abord une Direction Régionale (DC) dans l'onglet « Directions Régionales ».");
      return;
    }
    if (!newSectorCode.trim() || !newSectorName.trim()) return;

    const assignedUser = allUsers.find(u => u.id === newSectorDispatcherId);

    const createdSector = store.addSector({
      dcId: sectorDcId,
      code: newSectorCode.trim().toUpperCase(),
      name: newSectorName.trim(),
      dispatcherId: newSectorDispatcherId || undefined,
      dispatcherIds: newSectorDispatcherId ? [newSectorDispatcherId] : [],
      dispatcherName: assignedUser ? assignedUser.name : undefined,
    });

    // Also update the user's sectorIds so the orienteur is mapped
    if (newSectorDispatcherId && assignedUser) {
      const currentSectorIds = assignedUser.sectorIds || (assignedUser.sectorId ? [assignedUser.sectorId] : []);
      if (!currentSectorIds.includes(createdSector.id)) {
        store.updateUser(assignedUser.id, {
          sectorIds: [...currentSectorIds, createdSector.id],
          sectorId: assignedUser.sectorId || createdSector.id,
        });
      }
    }

    setNewSectorCode('');
    setNewSectorName('');
    notifySuccess('Secteur créé et rattaché à la DC !');
  };

  const handleOpenEditSector = (sec: Sector) => {
    setEditingSector(sec);
    setEditSectorCode(sec.code);
    setEditSectorName(sec.name);
    setEditSectorDcId(sec.dcId);
    setEditSectorDispatcherId(store.getSectorOrienteurs(sec.id)[0]?.id || '');
  };

  const handleSaveEditSector = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSector) return;

    const assignedUser = allUsers.find(u => u.id === editSectorDispatcherId);

    store.updateSector(editingSector.id, {
      code: editSectorCode.trim().toUpperCase(),
      name: editSectorName.trim(),
      dcId: editSectorDcId,
      dispatcherId: editSectorDispatcherId || undefined,
      dispatcherIds: editSectorDispatcherId ? [editSectorDispatcherId] : [],
      dispatcherName: assignedUser ? assignedUser.name : undefined,
    });

    // Update user sectorIds
    if (editSectorDispatcherId && assignedUser) {
      const currentSectorIds = assignedUser.sectorIds || (assignedUser.sectorId ? [assignedUser.sectorId] : []);
      if (!currentSectorIds.includes(editingSector.id)) {
        store.updateUser(assignedUser.id, {
          sectorIds: [...currentSectorIds, editingSector.id],
          sectorId: assignedUser.sectorId || editingSector.id,
        });
      }
    }

    setEditingSector(null);
    notifySuccess('Secteur mis à jour avec succès.');
  };

  const handleDeleteSector = (id: string, name: string) => {
    const hasZones = zones.some(z => z.sectorId === id);
    if (hasZones) {
      alert(`Impossible de supprimer le secteur "${name}" : des zones d'intervention y sont rattachées.`);
      return;
    }
    if (confirm(`Confirmer la suppression du secteur "${name}" ?`)) {
      store.deleteSector(id);
      notifySuccess('Secteur supprimé.');
    }
  };

  // --- Handlers: Zone ---
  const handleAddZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneSectorId) {
      alert("Créez d'abord un secteur dans l'onglet « Secteurs Géographiques ».");
      return;
    }
    if (!newZoneLabel.trim() || !newZoneMsan.trim()) return;

    const parentSector = sectors.find(s => s.id === zoneSectorId);

    store.addTechnicalZone({
      sectorId: zoneSectorId,
      dcId: parentSector?.dcId,
      label: newZoneLabel.trim(),
      msanCode: newZoneMsan.trim().toUpperCase(),
      description: newZoneDesc.trim() || undefined,
    });

    setNewZoneLabel('');
    setNewZoneMsan('');
    setNewZoneDesc('');
    notifySuccess('Zone d\'intervention ajoutée au secteur !');
  };

  const handleOpenEditZone = (zone: TechnicalZone) => {
    setEditingZone(zone);
    setEditZoneLabel(zone.label);
    setEditZoneMsan(zone.msanCode);
    setEditZoneSectorId(zone.sectorId);
    setEditZoneDesc(zone.description || '');
  };

  const handleSaveEditZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingZone) return;

    const parentSector = sectors.find(s => s.id === editZoneSectorId);

    store.updateTechnicalZone(editingZone.id, {
      label: editZoneLabel.trim(),
      msanCode: editZoneMsan.trim().toUpperCase(),
      sectorId: editZoneSectorId,
      dcId: parentSector?.dcId,
      description: editZoneDesc.trim() || undefined,
    });

    setEditingZone(null);
    notifySuccess('Zone technique mise à jour.');
  };

  const handleDeleteZone = (id: string, label: string) => {
    if (confirm(`Confirmer la suppression de la zone "${label}" ?`)) {
      store.deleteTechnicalZone(id);
      notifySuccess('Zone supprimée.');
    }
  };

  // --- Handlers: Users (Firebase Auth accounts + profile with sectors) ---
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    if (newUserPassword.length < 8) {
      setUserFormError('Le mot de passe provisoire doit contenir au moins 8 caractères.');
      return;
    }

    setIsCreatingUser(true);
    try {
      await store.addUser({
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
        sectorIds: newUserSelectedSectorIds,
      });
      setNewUserName('');
      setNewUserPassword('');
      setNewUserEmail('');
      setNewUserSelectedSectorIds([]);
      notifySuccess('Compte créé. Communiquez le mot de passe provisoire à l\'utilisateur.');
    } catch (err: any) {
      const code: string = err?.code || '';
      setUserFormError(
        code === 'auth/email-already-in-use' ? 'Un compte existe déjà avec cette adresse e-mail.'
        : code === 'auth/invalid-email' ? 'Adresse e-mail invalide.'
        : code === 'auth/weak-password' ? 'Mot de passe trop faible.'
        : err?.message || 'Création du compte impossible.'
      );
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserSelectedSectorIds(
      user.sectorIds && user.sectorIds.length > 0
        ? [...user.sectorIds]
        : user.sectorId ? [user.sectorId] : []
    );
  };

  const handleSaveEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    store.updateUser(editingUser.id, {
      name: editUserName.trim(),
      sectorId: editUserSelectedSectorIds[0] || undefined,
      sectorIds: editingUser.role === 'DISPATCHER' ? editUserSelectedSectorIds : [],
    });

    setEditingUser(null);
    notifySuccess('Compte utilisateur mis à jour.');
  };

  const handleSendPasswordReset = async (user: User) => {
    const email = user.email || user.username;
    const res = await store.sendPasswordReset(email);
    notifySuccess(res.success ? `Lien de réinitialisation envoyé à ${email}.` : `Envoi impossible : ${res.error}`);
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (userId === store.getCurrentUser()?.id) {
      alert('Vous ne pouvez pas supprimer votre propre compte.');
      return;
    }
    if (confirm(`Supprimer le compte de "${name}" ? Il ne pourra plus se connecter. Son adresse e-mail pourra être réutilisée.`)) {
      try {
        await store.deleteUser(userId);
        notifySuccess('Compte supprimé.');
      } catch (err: any) {
        alert(`Suppression impossible : ${err?.message || 'erreur inconnue'}`);
      }
    }
  };

  // --- Handlers: Alias & Telegram ---
  const handleAddAlias = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAliasRaw.trim() || !newAliasTargetZone) return;

    store.addZoneAlias(newAliasRaw.trim(), newAliasTargetZone);
    setNewAliasRaw('');
    setNewAliasTargetZone('');
    notifySuccess('Alias enregistré.');
  };

  const handleConnectBot = async () => {
    setIsConnectingBot(true);
    setBotResult(null);
    try {
      const { username } = await setupTelegramBot();
      setBotResult({ success: true, message: `Bot @${username} connecté : il reçoit désormais les activations et les comptes-rendus des techniciens.` });
    } catch (err: any) {
      setBotResult({ success: false, message: err?.message || 'Connexion du bot impossible.' });
    } finally {
      setIsConnectingBot(false);
    }
  };

  const toggleUserSectorChoice = (secId: string, isEdit: boolean) => {
    if (isEdit) {
      setEditUserSelectedSectorIds(prev => 
        prev.includes(secId) ? prev.filter(id => id !== secId) : [...prev, secId]
      );
    } else {
      setNewUserSelectedSectorIds(prev => 
        prev.includes(secId) ? prev.filter(id => id !== secId) : [...prev, secId]
      );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Hierarchy Summary */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Network className="w-5 h-5 text-emerald-600" />
                <span>Organisation</span>
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Organisation contractuelle : <b>DC</b> ➔ <b>Secteurs</b> (1 orienteur affecté, multi-secteurs possible) ➔ <b>Zones d'intervention</b> (affectation multi-techniciens).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200">
              {dcs.length} DC(s) · {sectors.length} Secteurs · {zones.length} Zones
            </span>
          </div>
        </div>

        {/* Global KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">1. Directions (DC)</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">{dcs.length}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">2. Secteurs géo</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">{sectors.length}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">3. Zones MSAN</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">{zones.length}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">4. Orienteurs SAV</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              {allUsers.filter(u => u.role === 'DISPATCHER').length}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-500 block text-[11px]">5. Techniciens</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">{allTechs.length}</span>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('HIERARCHY')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'HIERARCHY' ? 'bg-brand-navy-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Arborescence DC ➔ Secteurs ➔ Zones</span>
        </button>
        <button
          onClick={() => setActiveTab('DCS')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'DCS' ? 'bg-brand-navy-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          1. Directions Régionales ({dcs.length})
        </button>
        <button
          onClick={() => setActiveTab('SECTORS')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'SECTORS' ? 'bg-brand-navy-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          2. Secteurs Géographiques ({sectors.length})
        </button>
        <button
          onClick={() => setActiveTab('ZONES')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'ZONES' ? 'bg-brand-navy-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          3. Zones d'Intervention ({zones.length})
        </button>
        <button
          onClick={() => setActiveTab('USERS')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'USERS' ? 'bg-brand-navy-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>4. Comptes & Affectation Orienteurs ({allUsers.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('ALIASES')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'ALIASES' ? 'bg-brand-navy-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Tolérance Libellés ({aliases.length})
        </button>
        <button
          onClick={() => setActiveTab('TELEGRAM_CONFIG')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'TELEGRAM_CONFIG' ? 'bg-brand-navy-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Bot Telegram
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: VISUAL HIERARCHY TREE                             */}
      {/* ======================================================== */}
      {activeTab === 'HIERARCHY' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Network className="w-5 h-5 text-emerald-600" />
                <span>Schéma Organisationnel : DC ➔ Secteurs ➔ Zones ➔ Techniciens</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chaque Secteur est rattaché à une DC et piloté par un Orienteur. Chaque Zone est couverte par un ou plusieurs techniciens.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const allTrue: Record<string, boolean> = {};
                  dcs.forEach(d => allTrue[d.id] = true);
                  setExpandedDcs(allTrue);
                  const allSecTrue: Record<string, boolean> = {};
                  sectors.forEach(s => allSecTrue[s.id] = true);
                  setExpandedSectors(allSecTrue);
                }}
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold px-2 py-1 bg-slate-100 rounded-md"
              >
                Tout déplier
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {dcs.map(dc => {
              const dcSectors = sectors.filter(s => s.dcId === dc.id);
              const isDcOpen = expandedDcs[dc.id] ?? true;

              return (
                <div key={dc.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                  {/* DC Level Header */}
                  <div
                    onClick={() => setExpandedDcs(prev => ({ ...prev, [dc.id]: !isDcOpen }))}
                    className="p-4 bg-brand-navy-900 text-white flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isDcOpen ? <ChevronDown className="w-4 h-4 text-emerald-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <Building2 className="w-5 h-5 text-emerald-400" />
                      <div>
                        <span className="font-bold text-sm block leading-tight">{dc.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono block">Code DC : {dc.code} · {dc.description || 'Délégation centrale'}</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg">
                      {dcSectors.length} Secteur(s)
                    </span>
                  </div>

                  {/* Sectors under DC */}
                  {isDcOpen && (
                    <div className="p-4 space-y-3 bg-slate-50/50">
                      {dcSectors.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 italic">
                          Aucun secteur n'est rattaché à cette Direction Régionale.
                        </div>
                      ) : (
                        dcSectors.map(sec => {
                          const secZones = zones.filter(z => z.sectorId === sec.id);
                          const secTechs = allTechs.filter(t => t.sectorId === sec.id);
                          const isSecOpen = expandedSectors[sec.id] ?? true;
                          const orienteur = allUsers.find(u => u.id === sec.dispatcherId || (u.sectorIds && u.sectorIds.includes(sec.id)));

                          return (
                            <div key={sec.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                              {/* Sector Header */}
                              <div
                                onClick={() => setExpandedSectors(prev => ({ ...prev, [sec.id]: !isSecOpen }))}
                                className="p-3 bg-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-200/70 transition-colors"
                              >
                                <div className="flex items-center gap-2.5">
                                  {isSecOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                                  <Layers className="w-4 h-4 text-emerald-700" />
                                  <span className="font-bold text-xs text-slate-900">{sec.name} ({sec.code})</span>
                                  {orienteur && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      <UserCheck className="w-3 h-3 text-emerald-700" />
                                      <span>Orienteur : {orienteur.name}</span>
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                                  <span>{secZones.length} zone(s)</span>
                                  <span>·</span>
                                  <span>{secTechs.length} technicien(s)</span>
                                </div>
                              </div>

                              {/* Zones under Sector */}
                              {isSecOpen && (
                                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 bg-white">
                                  {secZones.map(zone => {
                                    const assignedTechs = allTechs.filter(t => t.zoneIds.includes(zone.id));
                                    return (
                                      <div key={zone.id} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 text-xs space-y-1">
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-slate-900 flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-emerald-600" />
                                            <span>{zone.label}</span>
                                          </span>
                                          <span className="font-mono text-[10px] text-slate-500">{zone.msanCode}</span>
                                        </div>
                                        <div className="text-[11px] text-slate-600">
                                          <span className="font-medium text-slate-700">Techniciens ({assignedTechs.length}) : </span>
                                          {assignedTechs.length > 0 ? (
                                            assignedTechs.map(t => t.fullName).join(', ')
                                          ) : (
                                            <span className="text-amber-700 italic">Aucun technicien affecté</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: DIRECTIONS REGIONALES (DC)                        */}
      {/* ======================================================== */}
      {activeTab === 'DCS' && (
        <div className="space-y-4">
          {/* Add DC Form */}
          <form onSubmit={handleAddDc} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Créer une Direction Régionale / Centrale (DC)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Code DC (ex: DC-CASA)</label>
                <input
                  type="text"
                  value={newDcCode}
                  onChange={e => setNewDcCode(e.target.value)}
                  placeholder="DC-..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom complet de la Direction</label>
                <input
                  type="text"
                  value={newDcName}
                  onChange={e => setNewDcName(e.target.value)}
                  placeholder="ex: Direction Régionale Grand Casablanca"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Description / Périmètre</label>
                <input
                  type="text"
                  value={newDcDesc}
                  onChange={e => setNewDcDesc(e.target.value)}
                  placeholder="ex: Casablanca, Mohammedia et périphérie"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl shadow-xs transition-colors"
              >
                Ajouter la Direction
              </button>
            </div>
          </form>

          {/* DC Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Code DC</th>
                  <th className="py-3 px-4">Nom de la Direction</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Secteurs Rattachés</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {dcs.map(dc => {
                  const dcSectors = sectors.filter(s => s.dcId === dc.id);
                  return (
                    <tr key={dc.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{dc.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{dc.name}</td>
                      <td className="py-3 px-4 text-slate-600">{dc.description || '—'}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900">{dcSectors.length}</span> secteur(s)
                        <div className="text-[11px] text-slate-400">
                          {dcSectors.map(s => s.name).join(', ') || 'Aucun secteur'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditDc(dc)}
                          className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Modifier</span>
                        </button>
                        <button
                          onClick={() => handleDeleteDc(dc.id, dc.name)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Supprimer</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: SECTEURS GEOGRAPHIQUES                            */}
      {/* ======================================================== */}
      {activeTab === 'SECTORS' && (
        <div className="space-y-4">
          {/* Add Sector Form */}
          <form onSubmit={handleAddSector} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Créer un Secteur Géographique</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Direction (DC) parente *</label>
                <select
                  value={sectorDcId}
                  onChange={e => setNewSectorDcId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                  required
                >
                  {dcs.map(dc => (
                    <option key={dc.id} value={dc.id}>{dc.name} ({dc.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Code Secteur (ex: CAS-NORD) *</label>
                <input
                  type="text"
                  value={newSectorCode}
                  onChange={e => setNewSectorCode(e.target.value)}
                  placeholder="CAS-..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom du Secteur *</label>
                <input
                  type="text"
                  value={newSectorName}
                  onChange={e => setNewSectorName(e.target.value)}
                  placeholder="ex: Casablanca Nord"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Orienteur affecté à ce secteur</label>
                <select
                  value={newSectorDispatcherId}
                  onChange={e => setNewSectorDispatcherId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                >
                  <option value="">Sélectionner un orienteur...</option>
                  {allUsers.filter(u => u.role === 'DISPATCHER').map(u => (
                    <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl shadow-xs transition-colors"
              >
                Créer le Secteur
              </button>
            </div>
          </form>

          {/* Sectors Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Nom du Secteur</th>
                  <th className="py-3 px-4">Direction Régionale (DC)</th>
                  <th className="py-3 px-4">Orienteur Responsable</th>
                  <th className="py-3 px-4">Zones d'Intervention</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {sectors.map(sec => {
                  const dc = dcs.find(d => d.id === sec.dcId);
                  const secZones = zones.filter(z => z.sectorId === sec.id);
                  const orienteur = allUsers.find(u => u.id === sec.dispatcherId || (u.sectorIds && u.sectorIds.includes(sec.id)));

                  return (
                    <tr key={sec.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{sec.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{sec.name}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-medium">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{dc?.name || 'DC Inconnue'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {orienteur ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <UserCheck className="w-3 h-3 text-emerald-600" />
                            <span>{orienteur.name}</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 italic">Non affecté</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900">{secZones.length}</span> zone(s)
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditSector(sec)}
                          className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Modifier</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSector(sec.id, sec.name)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Supprimer</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: ZONES D'INTERVENTION                              */}
      {/* ======================================================== */}
      {activeTab === 'ZONES' && (
        <div className="space-y-4">
          {/* Add Zone Card */}
          <form onSubmit={handleAddZone} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Créer une Nouvelle Zone d'Intervention Technique</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Secteur géographique *</label>
                <select
                  value={zoneSectorId}
                  onChange={e => setNewZoneSectorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                >
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Code MSAN (ex: MSAN-BERN-01) *</label>
                <input
                  type="text"
                  value={newZoneMsan}
                  onChange={e => setNewZoneMsan(e.target.value)}
                  placeholder="MSAN-..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Libellé / Quartier *</label>
                <input
                  type="text"
                  value={newZoneLabel}
                  onChange={e => setNewZoneLabel(e.target.value)}
                  placeholder="ex: Sidi Bernoussi"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Repères / Description</label>
                <input
                  type="text"
                  value={newZoneDesc}
                  onChange={e => setNewZoneDesc(e.target.value)}
                  placeholder="ex: Bd Chefchaouni / Zone Al Qods"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl shadow-xs transition-colors"
              >
                Ajouter la Zone
              </button>
            </div>
          </form>

          {/* Zones Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Code MSAN</th>
                  <th className="py-3 px-4">Libellé Zone</th>
                  <th className="py-3 px-4">Secteur</th>
                  <th className="py-3 px-4">Techniciens Affectés (Multi-affectation)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {zones.map(zone => {
                  const sec = sectors.find(s => s.id === zone.sectorId);
                  const assignedTechs = allTechs.filter(t => t.zoneIds.includes(zone.id));

                  return (
                    <tr key={zone.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{zone.msanCode}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {zone.label}
                        {zone.description && (
                          <span className="text-[10px] text-slate-400 block font-normal">{zone.description}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-medium">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{sec?.name || 'Inconnu'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {assignedTechs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedTechs.map(t => (
                              <span key={t.id} className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {t.fullName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-700 italic">Aucun technicien affecté</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditZone(zone)}
                          className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Modifier</span>
                        </button>
                        <button
                          onClick={() => handleDeleteZone(zone.id, zone.label)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Supprimer</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: COMPTES UTILISATEURS & ORIENTEURS MULTI-SECTEURS  */}
      {/* ======================================================== */}
      {activeTab === 'USERS' && (
        <div className="space-y-4">
          {/* Add User Form */}
          <form onSubmit={handleAddUser} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Créer un Compte Orienteur ou Manager</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom & Prénom *</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="ex: Omar Benjelloun"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">E-mail de connexion *</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  placeholder="ex: omar.benjelloun@3gcom.ma"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Mot de passe provisoire * (8+ car.)</label>
                <input
                  type="text"
                  autoComplete="new-password"
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  placeholder="à communiquer à l'utilisateur"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Rôle Système *</label>
                <select
                  value={newUserRole}
                  onChange={e => setNewUserRole(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                >
                  <option value="DISPATCHER">Orienteur SAV (Dispatch)</option>
                  <option value="MANAGER">Manager National (Supervision SAV)</option>
                </select>
              </div>
            </div>

            {/* Multi-Sector Checkboxes for Orienteur */}
            {newUserRole === 'DISPATCHER' && (
              <div className="pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Secteurs affectés à cet orienteur (Même orienteur peut gérer plusieurs secteurs)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Cochez le ou les secteurs dont cet orienteur sera responsable.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {sectors.map(s => {
                    const isChecked = newUserSelectedSectorIds.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleUserSectorChoice(s.id, false)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-semibold text-slate-800">{s.name} ({s.code})</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {userFormError && (
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>{userFormError}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isCreatingUser}
                className="px-5 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {isCreatingUser ? 'Création…' : 'Créer l\'utilisateur'}
              </button>
            </div>
          </form>

          {/* Users Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Utilisateur</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Secteurs Gérés (Multi-secteurs)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {allUsers.map(u => {
                  const userSectorIds = u.sectorIds || (u.sectorId ? [u.sectorId] : []);
                  const userSectors = sectors.filter(s => userSectorIds.includes(s.id));

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">{u.username}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          u.role === 'MANAGER' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {u.role === 'MANAGER' ? 'Manager National' : 'Orienteur SAV'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {u.role === 'MANAGER' ? (
                          <span className="text-slate-500 font-semibold">Toutes les Directions (Royaume)</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {userSectors.map(s => (
                              <span key={s.id} className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                {s.name}
                              </span>
                            ))}
                            {userSectors.length === 0 && (
                              <span className="text-amber-700 italic">Aucun secteur affecté</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleSendPasswordReset(u)}
                          className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                          title="Envoyer un e-mail de réinitialisation du mot de passe"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Mot de passe</span>
                        </button>
                        <button
                          onClick={() => handleOpenEditUser(u)}
                          className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Modifier</span>
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 font-semibold text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Supprimer</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 6: ALIASES TOLERANCE EXCEL                           */}
      {/* ======================================================== */}
      {activeTab === 'ALIASES' && (
        <div className="space-y-4">
          <form onSubmit={handleAddAlias} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Associer un Libellé Brut à une Zone Technique</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Texte brut dans le fichier Excel</label>
                <input
                  type="text"
                  value={newAliasRaw}
                  onChange={e => setNewAliasRaw(e.target.value)}
                  placeholder="ex: Bernoussi, Ain-Sebaa, Sidi-Moumen..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Zone Technique cible</label>
                <select
                  value={newAliasTargetZone}
                  onChange={e => setNewAliasTargetZone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                  required
                >
                  <option value="">Sélectionner une zone...</option>
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>{z.label} ({z.msanCode})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl shadow-xs transition-colors"
              >
                Créer la correspondance
              </button>
            </div>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Libellé Brut Fichier</th>
                  <th className="py-3 px-4">Zone Technique Rattachée</th>
                  <th className="py-3 px-4">Secteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {aliases.map(a => {
                  const targetZone = zones.find(z => z.id === a.technicalZoneId);
                  const sec = sectors.find(s => s.id === targetZone?.sectorId);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{a.rawLabel}</td>
                      <td className="py-3 px-4 font-bold text-emerald-800">{targetZone?.label || 'Zone inconnue'}</td>
                      <td className="py-3 px-4 text-slate-600">{sec?.name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 7: TELEGRAM BOT CONFIG                               */}
      {/* ======================================================== */}
      {activeTab === 'TELEGRAM_CONFIG' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 max-w-2xl">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Send className="w-5 h-5 text-sky-600" />
            <span>Configuration du Bot Telegram Superviseur</span>
          </h2>
          <div className="p-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-900 text-xs flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <span>
              Le <b>token</b> du bot (fourni par <b>@BotFather</b>) est un secret : il est stocké uniquement sur le serveur
              (variable d'environnement Vercel <code className="font-mono">TELEGRAM_BOT_TOKEN</code>) et n'est jamais envoyé aux navigateurs.
            </span>
          </div>

          <div className="text-xs space-y-1 text-slate-600">
            <p>
              Bot actuellement connecté :{' '}
              <b className="font-mono text-slate-900">
                {store.getTelegramBotUsername() ? `@${store.getTelegramBotUsername()}` : 'aucun'}
              </b>
            </p>
            <p>Après avoir ajouté ou changé le token dans Vercel, cliquez sur le bouton pour (re)brancher le bot sur cette application.</p>
          </div>

          {botResult && (
            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              botResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {botResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
              <span>{botResult.message}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleConnectBot}
            disabled={isConnectingBot}
            className="px-5 py-2.5 text-xs font-bold text-white bg-brand-navy-900 hover:bg-brand-navy-800 rounded-xl shadow-xs transition-colors disabled:opacity-50"
          >
            {isConnectingBot ? 'Connexion en cours…' : 'Connecter le bot'}
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* EDIT MODALS                                              */}
      {/* ======================================================== */}
      {/* Edit DC Modal */}
      {editingDc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Modifier la Direction Régionale</h3>
              <button onClick={() => setEditingDc(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditDc} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Code DC</label>
                <input
                  type="text"
                  value={editDcCode}
                  onChange={e => setEditDcCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono uppercase"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom</label>
                <input
                  type="text"
                  value={editDcName}
                  onChange={e => setEditDcName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Description</label>
                <input
                  type="text"
                  value={editDcDesc}
                  onChange={e => setEditDcDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setEditingDc(null)} className="px-4 py-2 font-semibold text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 font-bold text-white bg-slate-900 rounded-xl">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Sector Modal */}
      {editingSector && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Modifier le Secteur</h3>
              <button onClick={() => setEditingSector(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditSector} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Direction Régionale (DC)</label>
                <select
                  value={editSectorDcId}
                  onChange={e => setEditSectorDcId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                  required
                >
                  {dcs.map(dc => (
                    <option key={dc.id} value={dc.id}>{dc.name} ({dc.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Code</label>
                <input
                  type="text"
                  value={editSectorCode}
                  onChange={e => setEditSectorCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono uppercase"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom</label>
                <input
                  type="text"
                  value={editSectorName}
                  onChange={e => setEditSectorName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Orienteur affecté</label>
                <select
                  value={editSectorDispatcherId}
                  onChange={e => setEditSectorDispatcherId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                >
                  <option value="">Sélectionner un orienteur...</option>
                  {allUsers.filter(u => u.role === 'DISPATCHER').map(u => (
                    <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setEditingSector(null)} className="px-4 py-2 font-semibold text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 font-bold text-white bg-slate-900 rounded-xl">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Zone Modal */}
      {editingZone && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Modifier la Zone d'Intervention</h3>
              <button onClick={() => setEditingZone(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditZone} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Secteur</label>
                <select
                  value={editZoneSectorId}
                  onChange={e => setEditZoneSectorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                >
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Code MSAN</label>
                <input
                  type="text"
                  value={editZoneMsan}
                  onChange={e => setEditZoneMsan(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono uppercase"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Libellé / Quartier</label>
                <input
                  type="text"
                  value={editZoneLabel}
                  onChange={e => setEditZoneLabel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Description</label>
                <input
                  type="text"
                  value={editZoneDesc}
                  onChange={e => setEditZoneDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setEditingZone(null)} className="px-4 py-2 font-semibold text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 font-bold text-white bg-slate-900 rounded-xl">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Modifier le Compte Utilisateur</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditUser} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom</label>
                <input
                  type="text"
                  value={editUserName}
                  onChange={e => setEditUserName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>

              {editingUser.role === 'DISPATCHER' && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Secteurs affectés (Multi-secteurs possible)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-xl">
                    {sectors.map(s => {
                      const isChecked = editUserSelectedSectorIds.includes(s.id);
                      return (
                        <label key={s.id} className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 bg-white cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleUserSectorChoice(s.id, true)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-semibold text-slate-800">{s.name} ({s.code})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 font-semibold text-slate-600">Annuler</button>
                <button type="submit" className="px-5 py-2 font-bold text-white bg-slate-900 rounded-xl">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
