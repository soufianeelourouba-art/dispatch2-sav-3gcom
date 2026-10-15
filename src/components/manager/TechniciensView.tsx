import React, { useState, useMemo } from 'react';
import { Technician, TechnicalZone, Sector, User, DC } from '../../types';
import { store, formatCasablancaDateTime } from '../../services/storage';
import { 
  Users, 
  UserPlus, 
  AlertTriangle, 
  Trash2, 
  GitMerge, 
  Check, 
  Phone, 
  Send, 
  ShieldAlert,
  Search,
  CheckCircle2, 
  Edit2, 
  X, 
  Radio, 
  ExternalLink,
  MessageSquare,
  Copy,
  PowerOff,
  Sparkles,
  Building2,
  MapPin,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { TelegramLinkModal } from './TelegramLinkModal';

interface TechniciensViewProps {
  currentUser?: User;
}

export const TechniciensView: React.FC<TechniciensViewProps> = ({ currentUser }) => {
  const isDispatcher = currentUser?.role === 'DISPATCHER';

  const [activeTab, setActiveTab] = useState<'LIST' | 'DEDUP' | 'NEW'>('LIST');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDcFilter, setSelectedDcFilter] = useState<string>('ALL');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('ALL');
  const [selectedTechForTelegram, setSelectedTechForTelegram] = useState<Technician | null>(null);
  const [, setStoreVersion] = useState(0);

  // Subscribe directly to store for instant reactivity when technicians/sectors change
  React.useEffect(() => {
    const unsub = store.subscribe(() => setStoreVersion(v => v + 1));
    return () => unsub();
  }, []);
  
  // Available referentials based on user scope
  const dcs = store.getDCs();
  const allowedSectors = store.getSectors(currentUser);
  const allowedZones = store.getTechnicalZones(currentUser);

  // New technician form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTelegram, setNewTelegram] = useState('');
  const [newSectorId, setNewSectorId] = useState<string>(() => allowedSectors[0]?.id || '');
  const [newSelectedZones, setNewSelectedZones] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit Technician modal
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [editSectorId, setEditSectorId] = useState('');
  const [editSelectedZones, setEditSelectedZones] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editNotes, setEditNotes] = useState('');

  // Technicians according to user permission (Intra-Secteur for Orienteur vs National for Manager)
  const allScopedTechnicians = store.getTechnicians(currentUser);

  // Filtered Technicians
  const filteredTechs = useMemo(() => {
    return allScopedTechnicians.filter(t => {
      // Sector filter
      if (selectedSectorFilter !== 'ALL' && t.sectorId !== selectedSectorFilter) {
        return false;
      }
      // DC filter (Manager only)
      if (!isDispatcher && selectedDcFilter !== 'ALL') {
        const sec = allowedSectors.find(s => s.id === t.sectorId);
        if (!sec || sec.dcId !== selectedDcFilter) {
          return false;
        }
      }
      // Text search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.fullName.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q) ||
        t.normalizedName.includes(q)
      );
    });
  }, [allScopedTechnicians, selectedSectorFilter, selectedDcFilter, searchQuery, isDispatcher, allowedSectors]);

  // Deduplication Scanner within scoped technicians
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Technician[]>();
    allScopedTechnicians.forEach(t => {
      const norm = t.normalizedName.trim();
      const list = map.get(norm) || [];
      list.push(t);
      map.set(norm, list);
    });

    const duplicates: { normalizedName: string; techs: Technician[] }[] = [];
    map.forEach((list, norm) => {
      if (list.length > 1) {
        duplicates.push({ normalizedName: norm, techs: list });
      }
    });
    return duplicates;
  }, [allScopedTechnicians]);

  // Non-human accounts detection
  const nonHumanAccounts = useMemo(() => {
    const suspiciousKeywords = ['urgent', 'ferme', 'compte', 'test', 'generique', 'sav', 'stock'];
    return allScopedTechnicians.filter(t => {
      const lower = t.fullName.toLowerCase();
      return suspiciousKeywords.some(kw => lower.includes(kw));
    });
  }, [allScopedTechnicians]);

  // Zones available for selected sector in New form
  const zonesForNewSector = useMemo(() => {
    return allowedZones.filter(z => z.sectorId === newSectorId);
  }, [allowedZones, newSectorId]);

  // Zones available for selected sector in Edit modal
  const zonesForEditSector = useMemo(() => {
    return allowedZones.filter(z => z.sectorId === editSectorId);
  }, [allowedZones, editSectorId]);

  const handleCreateTechnician = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!newName.trim() || !newPhone.trim() || !newSectorId) {
      setErrorMsg('Veuillez renseigner le nom complet, le numéro de téléphone et le secteur.');
      return;
    }

    // Permission check for DISPATCHER
    if (isDispatcher && !allowedSectors.some(s => s.id === newSectorId)) {
      setErrorMsg('Action non autorisée : vous ne pouvez créer des techniciens que dans votre secteur.');
      return;
    }

    const newTech = store.addTechnician({
      sectorId: newSectorId,
      fullName: newName.trim(),
      phone: newPhone.trim(),
      telegramChatId: newTelegram.trim() || undefined,
      zoneIds: newSelectedZones,
      isActive: true,
    });

    setNewName('');
    setNewPhone('');
    setNewTelegram('');
    setNewSelectedZones([]);
    setSuccessMsg(`Technicien ${newTech.fullName} ajouté avec succès au secteur !`);
    setTimeout(() => setSuccessMsg(null), 4000);
    setActiveTab('LIST');
    setSelectedTechForTelegram(newTech);
  };

  const handleOpenEdit = (tech: Technician) => {
    // Intersector permission check
    if (isDispatcher && !store.canUserManageTechnician(currentUser || null, tech)) {
      alert('Action restreinte : vous ne pouvez pas modifier les techniciens d\'un autre secteur.');
      return;
    }

    setEditingTech(tech);
    setEditName(tech.fullName);
    setEditPhone(tech.phone);
    setEditTelegram(tech.telegramChatId || '');
    setEditSectorId(tech.sectorId);
    setEditSelectedZones([...tech.zoneIds]);
    setEditIsActive(tech.isActive);
    setEditNotes(tech.notes || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTech) return;

    // Security check: Orienteur cannot reassign a technician outside their sector
    if (isDispatcher) {
      if (!allowedSectors.some(s => s.id === editSectorId)) {
        alert('Action refusée : déplacement intersecteur réservé au compte Manager.');
        return;
      }
    }

    store.updateTechnician(editingTech.id, {
      fullName: editName.trim(),
      phone: editPhone.trim(),
      telegramChatId: editTelegram.trim() || undefined,
      sectorId: editSectorId,
      zoneIds: editSelectedZones,
      isActive: editIsActive,
      notes: editNotes.trim() || undefined,
    });

    setEditingTech(null);
    setSuccessMsg(`Fiche du technicien ${editName} mise à jour avec succès.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDeleteTech = (id: string, name: string) => {
    const tech = allScopedTechnicians.find(t => t.id === id);
    if (isDispatcher && tech && !store.canUserManageTechnician(currentUser || null, tech)) {
      alert('Action restreinte aux techniciens de votre secteur.');
      return;
    }

    if (confirm(`Êtes-vous sûr de vouloir supprimer définitivement le technicien ${name} ?`)) {
      store.deleteTechnician(id);
    }
  };

  const handleMerge = (sourceId: string, targetId: string) => {
    store.mergeTechnicians(sourceId, targetId);
    setSuccessMsg('Doublon fusionné avec succès. Les interventions ont été transférées.');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const toggleZoneSelection = (zoneId: string, isEdit: boolean) => {
    if (isEdit) {
      setEditSelectedZones(prev => 
        prev.includes(zoneId) ? prev.filter(id => id !== zoneId) : [...prev, zoneId]
      );
    } else {
      setNewSelectedZones(prev => 
        prev.includes(zoneId) ? prev.filter(id => id !== zoneId) : [...prev, zoneId]
      );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Scope Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {isDispatcher ? 'Mes Techniciens Terrain (Intra-Secteur)' : 'Gestion des Techniciens & Affectations'}
              </h1>
              {isDispatcher ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Gestion Intra-Secteur</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                  <Building2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Vue Nationale & Intersecteurs</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {isDispatcher 
                ? 'Gestion des techniciens de vos secteurs : coordonnées, lien Telegram, et affectation aux zones d\'intervention.'
                : 'Supervision nationale de tous les techniciens de l\'ensemble des Directions Régionales (DC) et Secteurs.'}
            </p>
          </div>

          <button
            onClick={() => setActiveTab('NEW')}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Ajouter un technicien</span>
          </button>
        </div>

        {/* Filters bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          {/* DC Filter (Manager only) */}
          {!isDispatcher && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-slate-600">DC :</span>
              <select
                value={selectedDcFilter}
                onChange={e => {
                  setSelectedDcFilter(e.target.value);
                  setSelectedSectorFilter('ALL');
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800"
              >
                <option value="ALL">Toutes les Directions (National)</option>
                {dcs.map(dc => (
                  <option key={dc.id} value={dc.id}>{dc.name} ({dc.code})</option>
                ))}
              </select>
            </div>
          )}

          {/* Sector Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-600">Secteur :</span>
            <select
              value={selectedSectorFilter}
              onChange={e => setSelectedSectorFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800"
            >
              <option value="ALL">
                {isDispatcher ? 'Tous mes secteurs affectés' : 'Tous les secteurs'}
              </option>
              {allowedSectors
                .filter(s => !isDispatcher && selectedDcFilter !== 'ALL' ? s.dcId === selectedDcFilter : true)
                .map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
            </select>
          </div>

          <div className="text-xs text-slate-500 ml-auto">
            Total affiché : <b>{filteredTechs.length}</b> technicien(s)
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('LIST')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'LIST' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Liste des Techniciens ({allScopedTechnicians.length})
        </button>
        <button
          onClick={() => setActiveTab('DEDUP')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'DEDUP' ? 'bg-amber-600 text-white' : 'text-amber-800 bg-amber-50 hover:bg-amber-100'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Doublons & Déduplication ({duplicateGroups.length})</span>
        </button>
      </div>

      {/* Tab: Technicians List */}
      {activeTab === 'LIST' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom, GSM..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {filteredTechs.length} technicien(s) trouvé(s)
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Technicien</th>
                    <th className="py-3 px-4">Secteur</th>
                    <th className="py-3 px-4">GSM</th>
                    <th className="py-3 px-4">Liaison Telegram (Supervision)</th>
                    <th className="py-3 px-4">Zones d'Intervention Couvertes</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTechs.map(t => {
                    const sec = allowedSectors.find(s => s.id === t.sectorId);
                    const techZones = allowedZones.filter(z => t.zoneIds.includes(z.id));
                    const isTgActive = t.telegramActivationStatus === 'ACTIVATED' && !t.telegramLinkDisabled;
                    const isTgRevoked = t.telegramLinkDisabled || t.telegramActivationStatus === 'REVOKED';

                    return (
                      <tr key={t.id} className={!t.isActive ? 'bg-slate-50/70 opacity-60' : 'hover:bg-slate-50/50'}>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {t.fullName}
                          {t.notes && (
                            <span className="text-[10px] text-slate-400 block font-normal">
                              {t.notes}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-semibold border border-slate-200">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            <span>{sec?.name || 'Non défini'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {t.phone}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => setSelectedTechForTelegram(t)}
                            className="group flex flex-col items-start text-left cursor-pointer transition-transform active:scale-95"
                            title="Gérer le lien d'activation Telegram (WhatsApp, SMS, Reset)"
                          >
                            {isTgRevoked ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 group-hover:bg-rose-100">
                                <PowerOff className="w-3 h-3 text-rose-600" />
                                <span>Lien Suspendu</span>
                              </span>
                            ) : isTgActive ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 group-hover:bg-emerald-100">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Connecté {t.telegramUsername ? `(@${t.telegramUsername})` : ''}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block pl-1">
                                  Chat ID : {t.telegramChatId}
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 group-hover:bg-amber-100 animate-pulse">
                                  <Radio className="w-3 h-3 text-amber-600" />
                                  <span>En attente d'activation</span>
                                </span>
                                <span className="text-[10px] text-amber-700 font-medium block pl-1">
                                  Cliquer pour envoyer via WhatsApp/SMS
                                </span>
                              </div>
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {techZones.length > 0 ? (
                              techZones.map(z => (
                                <span key={z.id} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
                                  {z.label}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-amber-700 font-medium">
                                Aucune zone affectée (Non éligible au dispatch)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            t.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {t.isActive ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            onClick={() => setSelectedTechForTelegram(t)}
                            className="p-1.5 text-sky-700 hover:text-sky-900 hover:bg-sky-50 rounded-lg inline-flex items-center gap-1 font-semibold text-xs transition-colors"
                            title="Lien Telegram"
                          >
                            <Send className="w-3.5 h-3.5 text-sky-600" />
                            <span>Lien Telegram</span>
                          </button>
                          <button
                            onClick={() => handleOpenEdit(t)}
                            className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 font-semibold text-xs transition-colors"
                            title="Modifier zones & coordonnées"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Modifier</span>
                          </button>
                          {!isDispatcher && (
                            <button
                              onClick={() => handleDeleteTech(t.id, t.fullName)}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 font-semibold text-xs transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Supprimer</span>
                            </button>
                          )}
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

      {/* Tab: New Technician */}
      {activeTab === 'NEW' && (
        <form onSubmit={handleCreateTechnician} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 max-w-3xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              <span>Nouveau Technicien {isDispatcher ? '(Intra-Secteur)' : ''}</span>
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab('LIST')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Annuler
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom complet *</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="ex: Khalid Bennani"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Numéro GSM / Téléphone *</label>
              <input
                type="text"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="ex: +212 661 234567"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Secteur d'appartenance *
              </label>
              <select
                value={newSectorId}
                onChange={e => {
                  setNewSectorId(e.target.value);
                  setNewSelectedZones([]);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                required
              >
                {allowedSectors.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Identifiant Telegram / Chat ID (Optionnel)</label>
              <input
                type="text"
                value={newTelegram}
                onChange={e => setNewTelegram(e.target.value)}
                placeholder="ex: 123456789 ou laisser vide (lien envoyé par SMS/WhatsApp)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
              />
            </div>
          </div>

          {/* Multi-Zone Assignment Checkboxes */}
          <div className="pt-3 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-800 block mb-1.5 flex items-center justify-between">
              <span>Zones d'intervention affectées à ce technicien (Secteur : {allowedSectors.find(s => s.id === newSectorId)?.name})</span>
              <span className="text-[11px] font-normal text-slate-500">
                {newSelectedZones.length} sélectionnée(s)
              </span>
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              Un même technicien peut couvrir plusieurs zones, et une même zone peut être couverte par plusieurs techniciens.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
              {zonesForNewSector.map(z => {
                const isChecked = newSelectedZones.includes(z.id);
                return (
                  <label key={z.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 text-xs">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleZoneSelection(z.id, false)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-900 block">{z.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{z.msanCode}</span>
                    </div>
                  </label>
                );
              })}
              {zonesForNewSector.length === 0 && (
                <div className="col-span-3 text-center py-4 text-xs text-slate-500">
                  Aucune zone n'est configurée dans ce secteur.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('LIST')}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors"
            >
              Créer & Générer Lien Telegram
            </button>
          </div>
        </form>
      )}

      {/* Tab: Deduplication Scanner */}
      {activeTab === 'DEDUP' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span>Détection Automatique des Doublons</span>
          </h2>
          <p className="text-xs text-slate-500">
            Identification des fiches techniciens partageant la même identité phonétique ou orthographique.
          </p>

          {duplicateGroups.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <span>Aucun doublon détecté dans ce périmètre. Base de techniciens propre !</span>
            </div>
          ) : (
            <div className="space-y-4">
              {duplicateGroups.map((group, idx) => (
                <div key={idx} className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-amber-900">
                      Identité commune détectée : « {group.normalizedName} » ({group.techs.length} fiches)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {group.techs.map(t => {
                      const sec = allowedSectors.find(s => s.id === t.sectorId);
                      return (
                        <div key={t.id} className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                          <div className="font-bold text-slate-900">{t.fullName}</div>
                          <div className="text-slate-500">Secteur : {sec?.name || t.sectorId}</div>
                          <div className="font-mono text-slate-600">GSM : {t.phone}</div>
                          <div className="pt-2">
                            {group.techs.filter(other => other.id !== t.id).map(target => (
                              <button
                                key={target.id}
                                onClick={() => handleMerge(t.id, target.id)}
                                className="px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors"
                              >
                                Fusionner vers {target.fullName}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Technician Modal */}
      {editingTech && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-slate-700" />
                <span>Modifier la Fiche Technicien</span>
              </h3>
              <button
                onClick={() => setEditingTech(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom complet</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Numéro GSM</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1 flex items-center justify-between">
                    <span>Secteur d'affectation</span>
                    {isDispatcher && (
                      <span title="Verrouillé au périmètre du compte">
                        <Lock className="w-3 h-3 text-slate-400" />
                      </span>
                    )}
                  </label>
                  <select
                    value={editSectorId}
                    onChange={e => {
                      setEditSectorId(e.target.value);
                      setEditSelectedZones([]);
                    }}
                    disabled={isDispatcher && allowedSectors.length <= 1}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold disabled:bg-slate-100"
                    required
                  >
                    {allowedSectors.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Chat ID Telegram (Optionnel)</label>
                  <input
                    type="text"
                    value={editTelegram}
                    onChange={e => setEditTelegram(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono"
                    placeholder="ex: 123456789"
                  />
                </div>
              </div>

              {/* Zones Checkboxes */}
              <div className="pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Zones d'intervention couvertes ({zonesForEditSector.length} disponibles dans ce secteur)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                  {zonesForEditSector.map(z => {
                    const isChecked = editSelectedZones.includes(z.id);
                    return (
                      <label key={z.id} className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleZoneSelection(z.id, true)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-semibold text-slate-800">{z.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={e => setEditIsActive(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Technicien Actif (Éligible au dispatch automatique)</span>
                </label>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Notes / Compétences</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="ex: Expert soudure optique, secteur nord..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingTech(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Telegram Link Modal */}
      {selectedTechForTelegram && (
        <TelegramLinkModal
          technician={selectedTechForTelegram}
          onClose={() => setSelectedTechForTelegram(null)}
          onUpdate={() => {
            // Re-render
            setActiveTab('LIST');
          }}
        />
      )}

    </div>
  );
};
