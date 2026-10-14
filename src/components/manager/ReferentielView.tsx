import React, { useState } from 'react';
import { Sector, TechnicalZone, ZoneAlias, User } from '../../types';
import { store, formatCasablancaDateTime } from '../../services/storage';
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
  AlertCircle
} from 'lucide-react';
import { telegramBotService } from '../../services/telegramBotService';

export const ReferentielView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ZONES' | 'ALIASES' | 'SECTORS' | 'USERS' | 'TELEGRAM_CONFIG'>('ZONES');
  
  // Create Zone form
  const [newZoneSectorId, setNewZoneSectorId] = useState('');
  const [newZoneLabel, setNewZoneLabel] = useState('');
  const [newZoneMsan, setNewZoneMsan] = useState('');
  
  // Edit Zone modal
  const [editingZone, setEditingZone] = useState<TechnicalZone | null>(null);
  const [editZoneLabel, setEditZoneLabel] = useState('');
  const [editZoneMsan, setEditZoneMsan] = useState('');
  const [editZoneSectorId, setEditZoneSectorId] = useState('');

  // Alias form
  const [newAliasRaw, setNewAliasRaw] = useState('');
  const [newAliasTargetZone, setNewAliasTargetZone] = useState('');

  // Telegram bot config
  const [botToken, setBotToken] = useState(store.getTelegramToken());
  const [tokenSaved, setTokenSaved] = useState(false);
  const [isVerifyingBot, setIsVerifyingBot] = useState(false);
  const [botVerifyResult, setBotVerifyResult] = useState<{ success: boolean; message: string } | null>(null);

  const sectors = store.getSectors();
  const zones = store.getTechnicalZones();
  const aliases = store.getZoneAliases();
  const allUsers = store.getAllUsers();

  // User Accounts form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'DISPATCHER' | 'MANAGER'>('DISPATCHER');
  const [newUserSectorId, setNewUserSectorId] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [userSuccessMsg, setUserSuccessMsg] = useState<string | null>(null);

  // Edit User modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserSectorId, setEditUserSectorId] = useState('');

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserUsername || !newUserPassword) return;

    store.addUser({
      name: newUserName.trim(),
      username: newUserUsername.trim().toLowerCase(),
      password: newUserPassword.trim(),
      role: newUserRole,
      sectorId: newUserRole === 'DISPATCHER' ? newUserSectorId : undefined,
      email: newUserEmail.trim() || undefined,
    });

    setNewUserName('');
    setNewUserUsername('');
    setNewUserPassword('');
    setNewUserEmail('');
    setNewUserSectorId('');
    setUserSuccessMsg('Compte créé avec succès dans la base de données !');
    setTimeout(() => setUserSuccessMsg(null), 3000);
  };

  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserPassword(user.password || '');
    setEditUserSectorId(user.sectorId || '');
  };

  const handleSaveEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    store.updateUser(editingUser.id, {
      name: editUserName.trim(),
      password: editUserPassword.trim(),
      sectorId: editingUser.role === 'DISPATCHER' ? editUserSectorId : undefined,
    });

    setEditingUser(null);
  };

  const handleDeleteUser = (userId: string, name: string) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le compte "${name}" ?`)) {
      store.deleteUser(userId);
    }
  };

  const handleAddZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneSectorId || !newZoneLabel || !newZoneMsan) return;

    store.addTechnicalZone({
      sectorId: newZoneSectorId,
      label: newZoneLabel.trim(),
      msanCode: newZoneMsan.trim().toUpperCase(),
    });

    setNewZoneLabel('');
    setNewZoneMsan('');
  };

  const handleOpenEditZone = (zone: TechnicalZone) => {
    setEditingZone(zone);
    setEditZoneLabel(zone.label);
    setEditZoneMsan(zone.msanCode);
    setEditZoneSectorId(zone.sectorId);
  };

  const handleSaveEditZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingZone) return;

    store.updateTechnicalZone(editingZone.id, {
      label: editZoneLabel.trim(),
      msanCode: editZoneMsan.trim().toUpperCase(),
      sectorId: editZoneSectorId,
    });

    setEditingZone(null);
  };

  const handleDeleteZone = (id: string, label: string) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer la zone technique "${label}" ?`)) {
      store.deleteTechnicalZone(id);
    }
  };

  const handleAddAlias = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAliasRaw || !newAliasTargetZone) return;

    store.addZoneAlias(newAliasRaw, newAliasTargetZone);
    setNewAliasRaw('');
    setNewAliasTargetZone('');
  };

  const handleSaveTelegramToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingBot(true);
    setBotVerifyResult(null);
    store.setTelegramToken(botToken.trim());

    try {
      const info = await telegramBotService.refreshBotInfo(botToken.trim());
      if (info) {
        telegramBotService.startPolling();
        setBotVerifyResult({
          success: true,
          message: `Bot @${info.username} connecté avec succès ! Prêt pour l'envoi de liens et la supervision.`,
        });
      } else {
        setBotVerifyResult({
          success: false,
          message: 'Token enregistré, mais impossible de joindre Telegram API. Vérifiez votre connexion internet.',
        });
      }
    } catch (err: any) {
      setBotVerifyResult({
        success: false,
        message: `Erreur Telegram : ${err.message}`,
      });
    } finally {
      setIsVerifyingBot(false);
      setTokenSaved(true);
      setTimeout(() => setTokenSaved(false), 5000);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Référentiel des Zones Techniques & MSAN
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Gestion complète : modification et suppression des zones MSAN (§3), rattachement des libellés et configuration Telegram.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('ZONES')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'ZONES' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Zones & MSAN ({zones.length})
        </button>
        <button
          onClick={() => setActiveTab('ALIASES')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'ALIASES' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Rattachement Libellés ({aliases.length})
        </button>
        <button
          onClick={() => setActiveTab('SECTORS')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'SECTORS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Secteurs ({sectors.length})
        </button>
        <button
          onClick={() => setActiveTab('USERS')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'USERS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Comptes Orienteurs ({allUsers.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('TELEGRAM_CONFIG')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'TELEGRAM_CONFIG' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Bot Telegram
        </button>
      </div>

      {/* Tab: Zones Techniques (With full Edit & Delete) */}
      {activeTab === 'ZONES' && (
        <div className="space-y-4">
          
          {/* Add Zone Card */}
          <form onSubmit={handleAddZone} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Créer une Nouvelle Zone Technique</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Secteur géographique</label>
                <select
                  value={newZoneSectorId}
                  onChange={e => setNewZoneSectorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                >
                  <option value="">Sélectionner un secteur...</option>
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Code MSAN (ex: MSAN-BERN-01)</label>
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
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom de quartier usuel (ex: Sidi Bernoussi)</label>
                <input
                  type="text"
                  value={newZoneLabel}
                  onChange={e => setNewZoneLabel(e.target.value)}
                  placeholder="Nom de quartier..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>
            </div>

            <div className="text-right pt-1">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs"
              >
                Ajouter la zone
              </button>
            </div>
          </form>

          {/* Zones Table with Edit & Delete actions */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Code MSAN</th>
                    <th className="py-3 px-4">Libellé Officiel</th>
                    <th className="py-3 px-4">Secteur</th>
                    <th className="py-3 px-4">Techniciens Couvrants</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {zones.map(z => {
                    const sec = sectors.find(s => s.id === z.sectorId);
                    const coveringTechs = store.getTechnicians().filter(t => t.isActive && t.zoneIds.includes(z.id));

                    return (
                      <tr key={z.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{z.msanCode}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{z.label}</td>
                        <td className="py-3 px-4">{sec?.name || 'Inconnu'}</td>
                        <td className="py-3 px-4 font-mono">
                          <b>{coveringTechs.length}</b> technicien(s)
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                          <button
                            onClick={() => handleOpenEditZone(z)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold"
                            title="Modifier cette zone"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Modifier</span>
                          </button>
                          <button
                            onClick={() => handleDeleteZone(z.id, z.label)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold"
                            title="Supprimer cette zone"
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

        </div>
      )}

      {/* Edit Zone Modal (§3) */}
      {editingZone && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Modifier la Zone Technique · {editingZone.label}
              </h3>
              <button onClick={() => setEditingZone(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditZone} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom de la zone</label>
                <input
                  type="text"
                  value={editZoneLabel}
                  onChange={e => setEditZoneLabel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Code MSAN</label>
                <input
                  type="text"
                  value={editZoneMsan}
                  onChange={e => setEditZoneMsan(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Secteur rattaché</label>
                <select
                  value={editZoneSectorId}
                  onChange={e => setEditZoneSectorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900"
                  required
                >
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingZone(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab: Aliases */}
      {activeTab === 'ALIASES' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-slate-700" />
              <span>Associer un Libellé Texte Excel à une Zone Officielle</span>
            </h3>

            <form onSubmit={handleAddAlias} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Texte brut dans le fichier</label>
                <input
                  type="text"
                  value={newAliasRaw}
                  onChange={e => setNewAliasRaw(e.target.value)}
                  placeholder="Ex: Bernoussi Al Qods"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Zone officielle cible</label>
                <select
                  value={newAliasTargetZone}
                  onChange={e => setNewAliasTargetZone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                >
                  <option value="">Sélectionner la zone correspondante...</option>
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>
                      {z.label} ({z.msanCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs"
                >
                  Créer la correspondance
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Libellé Brut Rencontré</th>
                  <th className="py-3 px-4">Zone Technique Canonique</th>
                  <th className="py-3 px-4">Secteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {aliases.map(a => {
                  const targetZone = zones.find(z => z.id === a.technicalZoneId);
                  const sec = targetZone ? sectors.find(s => s.id === targetZone.sectorId) : null;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">"{a.rawLabel}"</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{targetZone?.label} ({targetZone?.msanCode})</td>
                      <td className="py-3 px-4 text-slate-600">{sec?.name || 'N/A'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Sectors */}
      {activeTab === 'SECTORS' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Secteur</th>
                <th className="py-3 px-4">Orienteur Responsable</th>
                <th className="py-3 px-4">Zones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {sectors.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.code}</td>
                  <td className="py-3 px-4 font-semibold text-slate-900">{s.name}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{s.dispatcherName || 'Non assigné'}</td>
                  <td className="py-3 px-4 font-mono">{zones.filter(z => z.sectorId === s.id).length} zones</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Users & Passwords Management */}
      {activeTab === 'USERS' && (
        <div className="space-y-4">
          
          {/* Create User Form */}
          <form onSubmit={handleAddUser} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Créer un Nouveau Compte Orienteur / Gestionnaire</span>
            </h3>

            {userSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{userSuccessMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom complet & prénom</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="ex: Reda Cherkaoui"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Identifiant de connexion (Username)</label>
                <input
                  type="text"
                  value={newUserUsername}
                  onChange={e => setNewUserUsername(e.target.value)}
                  placeholder="ex: orienteur_mohammedia"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono lowercase"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Mot de passe initial</label>
                <input
                  type="text"
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  placeholder="ex: motdepasse2026"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Rôle dans l'application</label>
                <select
                  value={newUserRole}
                  onChange={e => setNewUserRole(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                >
                  <option value="DISPATCHER">Orienteur (Cloisonné sur un secteur)</option>
                  <option value="MANAGER">Manager National (Accès tous secteurs)</option>
                </select>
              </div>

              {newUserRole === 'DISPATCHER' && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Secteur géographique attribué</label>
                  <select
                    value={newUserSectorId}
                    onChange={e => setNewUserSectorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                    required={newUserRole === 'DISPATCHER'}
                  >
                    <option value="">Sélectionner le secteur...</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Email de contact (Optionnel)</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  placeholder="prenom.nom@3gcom.ma"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-xs"
              >
                Créer et synchroniser le compte
              </button>
            </div>
          </form>

          {/* User List Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-600" />
                <span>Comptes Actifs & Mots de Passe ({allUsers.length})</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Utilisateur</th>
                    <th className="py-3 px-4">Identifiant (Login)</th>
                    <th className="py-3 px-4">Rôle</th>
                    <th className="py-3 px-4">Secteur cloisonné</th>
                    <th className="py-3 px-4">Mot de passe actuel</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {allUsers.map(user => {
                    const sec = sectors.find(s => s.id === user.sectorId);
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {user.name}
                          {user.email && <span className="text-[11px] text-slate-400 block font-normal">{user.email}</span>}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">
                          {user.username}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            user.role === 'MANAGER' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {user.role === 'MANAGER' ? 'Manager National' : 'Orienteur'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {user.role === 'MANAGER' ? (
                            <span className="text-slate-400 italic">Tous secteurs</span>
                          ) : (
                            sec?.name || 'Non attribué'
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          <span className="bg-slate-100 px-2 py-1 rounded text-[11px]">
                            {user.password || '••••••'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditUser(user)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                              title="Modifier nom ou mot de passe"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {allUsers.length > 1 && (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.name)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                title="Supprimer le compte"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Telegram Bot Config */}
      {activeTab === 'TELEGRAM_CONFIG' && (() => {
        const allTechs = store.getTechnicians();
        const activatedCount = allTechs.filter(t => t.telegramActivationStatus === 'ACTIVATED' && !t.telegramLinkDisabled).length;
        const pendingCount = allTechs.filter(t => t.telegramActivationStatus === 'PENDING' && !t.telegramLinkDisabled).length;
        const suspendedCount = allTechs.filter(t => t.telegramLinkDisabled || t.telegramActivationStatus === 'REVOKED').length;
        const botUsername = telegramBotService.getBotUsername();

        return (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-600" />
                    <span>Configuration & Connexion Bot Telegram</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Le bot est utilisé pour l'activation sans friction des techniciens par lien unique et la réception des ordres de travail.
                  </p>
                </div>
                {botUsername && (
                  <span className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full text-xs font-mono font-bold">
                    @{botUsername}
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveTelegramToken} className="space-y-4 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Token BotFather officiel (@BotFather) :
                  </label>
                  <input
                    type="text"
                    value={botToken}
                    onChange={e => setBotToken(e.target.value)}
                    placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ..."
                    className="w-full font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Ce token est synchronisé dans Firestore et partagé par tous les orienteurs et managers.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isVerifyingBot}
                    className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isVerifyingBot ? 'Vérification...' : 'Enregistrer et Tester le Bot'}</span>
                  </button>
                </div>

                {botVerifyResult && (
                  <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    botVerifyResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    {botVerifyResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{botVerifyResult.message}</span>
                  </div>
                )}
              </form>
            </div>

            {/* Supervision overview of technicians */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-600" />
                <span>Supervision de l'Intégration Techniciens ({allTechs.length})</span>
              </h3>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    🟢 Activés & Connectés
                  </div>
                  <div className="text-xl font-bold text-emerald-950 mt-1">
                    {activatedCount}
                  </div>
                  <div className="text-[10px] text-emerald-800 mt-0.5">
                    Prêts à recevoir les interventions
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    🟡 En attente de clic
                  </div>
                  <div className="text-xl font-bold text-amber-950 mt-1">
                    {pendingCount}
                  </div>
                  <div className="text-[10px] text-amber-800 mt-0.5">
                    Lien envoyé, en attente Start
                  </div>
                </div>

                <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                    🔴 Liens Suspendus
                  </div>
                  <div className="text-xl font-bold text-rose-950 mt-1">
                    {suspendedCount}
                  </div>
                  <div className="text-[10px] text-rose-800 mt-0.5">
                    Accès arrêté par superviseur
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
                💡 <b>Gestion des liens :</b> Rendez-vous sur l'onglet <b>"Techniciens & Doublons"</b> pour copier les liens d'activation personnalisés, les envoyer en 1 clic sur WhatsApp, ou suspendre/réinitialiser un lien.
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                Modifier le compte : {editingUser.name}
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nom complet</label>
                <input
                  type="text"
                  value={editUserName}
                  onChange={e => setEditUserName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nouveau mot de passe</label>
                <input
                  type="text"
                  value={editUserPassword}
                  onChange={e => setEditUserPassword(e.target.value)}
                  placeholder="Nouveau mot de passe..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
                  required
                />
              </div>

              {editingUser.role === 'DISPATCHER' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Secteur géographique attribué</label>
                  <select
                    value={editUserSectorId}
                    onChange={e => setEditUserSectorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                    required
                  >
                    <option value="">Sélectionner un secteur...</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
