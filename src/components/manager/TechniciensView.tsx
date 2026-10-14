import React, { useState, useMemo } from 'react';
import { Technician, TechnicalZone, Sector } from '../../types';
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
  Sparkles
} from 'lucide-react';
import { TelegramLinkModal } from './TelegramLinkModal';

export const TechniciensView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'DEDUP' | 'NEW'>('LIST');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTechForTelegram, setSelectedTechForTelegram] = useState<Technician | null>(null);
  
  // New technician form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTelegram, setNewTelegram] = useState('');
  const [newSectorId, setNewSectorId] = useState('');
  const [newSelectedZones, setNewSelectedZones] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit Technician modal
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [editSectorId, setEditSectorId] = useState('');
  const [editSelectedZones, setEditSelectedZones] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);

  const technicians = store.getTechnicians();
  const sectors = store.getSectors();
  const zones = store.getTechnicalZones();

  // Deduplication Scanner (§4)
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Technician[]>();
    technicians.forEach(t => {
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
  }, [technicians]);

  // Non-human accounts detection (§4: "COMPTE URGENT", "FERME FERME")
  const nonHumanAccounts = useMemo(() => {
    const suspiciousKeywords = ['urgent', 'ferme', 'compte', 'test', 'generique', 'sav', 'stock'];
    return technicians.filter(t => {
      const lower = t.fullName.toLowerCase();
      return suspiciousKeywords.some(kw => lower.includes(kw));
    });
  }, [technicians]);

  const handleCreateTechnician = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone || !newSectorId) return;

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
    setSuccessMsg(`Technicien ${newTech.fullName} ajouté avec succès ! Lien d'activation Telegram prêt.`);
    setTimeout(() => setSuccessMsg(null), 4000);
    setActiveTab('LIST');
    setSelectedTechForTelegram(newTech);
  };

  const handleOpenEdit = (tech: Technician) => {
    setEditingTech(tech);
    setEditName(tech.fullName);
    setEditPhone(tech.phone);
    setEditTelegram(tech.telegramChatId || '');
    setEditSectorId(tech.sectorId);
    setEditSelectedZones([...tech.zoneIds]);
    setEditIsActive(tech.isActive);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTech) return;

    store.updateTechnician(editingTech.id, {
      fullName: editName.trim(),
      phone: editPhone.trim(),
      telegramChatId: editTelegram.trim() || undefined,
      sectorId: editSectorId,
      zoneIds: editSelectedZones,
      isActive: editIsActive,
    });

    setEditingTech(null);
    setSuccessMsg('Fiche technicien mise à jour avec succès.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDeleteTech = (id: string, name: string) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer définitivement le technicien ${name} ?`)) {
      store.deleteTechnician(id);
    }
  };

  const handleMerge = (sourceId: string, targetId: string) => {
    store.mergeTechnicians(sourceId, targetId);
    setSuccessMsg('Doublon fusionné avec succès. Les interventions ont été transférées.');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleDeactivateFake = (id: string) => {
    store.removeFakeTechnician(id);
  };

  const handleToggleActive = (tech: Technician) => {
    store.updateTechnician(tech.id, { isActive: !tech.isActive });
  };

  const filteredTechs = useMemo(() => {
    return technicians.filter(t => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.fullName.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q) ||
        t.normalizedName.includes(q)
      );
    });
  }, [technicians, searchQuery]);

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Gestion & Modification des Techniciens
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Mise à jour des coordonnées (§3), assignation des zones MSAN, assainissement des doublons et faux comptes.
          </p>
        </div>

        <button
          onClick={() => setActiveTab('NEW')}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Ajouter un technicien</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
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
          Liste des Techniciens ({technicians.length})
        </button>
        <button
          onClick={() => setActiveTab('DEDUP')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'DEDUP' ? 'bg-amber-600 text-white' : 'text-amber-800 bg-amber-50 hover:bg-amber-100'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Doublons & Faux Comptes ({duplicateGroups.length + nonHumanAccounts.filter(a => a.isActive).length})</span>
        </button>
      </div>

      {/* Tab: Technicians List with full Edit capability */}
      {activeTab === 'LIST' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom, téléphone..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {filteredTechs.length} technicien(s) répertorié(s)
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
                    <th className="py-3 px-4">Zones Couvertes</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTechs.map(t => {
                    const sec = sectors.find(s => s.id === t.sectorId);
                    const techZones = zones.filter(z => t.zoneIds.includes(z.id));
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
                          {sec?.name || 'Non défini'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {t.phone}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => setSelectedTechForTelegram(t)}
                            className="group flex flex-col items-start text-left cursor-pointer transition-transform active:scale-95"
                            title="Gérer le lien d'activation Telegram (WhatsApp, SMS, Reset, Stop)"
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
                                  <span>Connecté {t.telegramUsername ? `(${t.telegramUsername})` : ''}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block pl-1">
                                  Chat ID : {t.telegramChatId}
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 group-hover:bg-amber-100 animate-pulse">
                                  <Radio className="w-3 h-3 text-amber-600" />
                                  <span>En attente de clic</span>
                                </span>
                                <span className="text-[10px] text-amber-700 font-medium block pl-1">
                                  Lien prêt à envoyer
                                </span>
                              </div>
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900">{techZones.length}</span> zone(s)
                          <div className="text-[10px] text-slate-400 truncate max-w-xs">
                            {techZones.map(z => z.label).join(', ') || 'Aucune'}
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
                            title="Gérer le lien et superviser l'activation Telegram"
                          >
                            <Send className="w-3.5 h-3.5 text-sky-600" />
                            <span>Lien Telegram</span>
                          </button>
                          <button
                            onClick={() => handleOpenEdit(t)}
                            className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 font-semibold text-xs transition-colors"
                            title="Modifier les informations"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Modifier</span>
                          </button>
                          <button
                            onClick={() => handleDeleteTech(t.id, t.fullName)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 font-semibold text-xs transition-colors"
                            title="Supprimer"
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

      {/* Edit Technician Modal (§3) */}
      {editingTech && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Modifier la Fiche Technicien · {editingTech.fullName}
              </h3>
              <button onClick={() => setEditingTech(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom complet</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Téléphone GSM</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Secteur</label>
                  <select
                    value={editSectorId}
                    onChange={e => setEditSectorId(e.target.value)}
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
              </div>

              {/* Telegram activation card in Edit modal */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-600" />
                    Intégration & Activation Telegram
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const t = editingTech;
                      setEditingTech(null);
                      setSelectedTechForTelegram(t);
                    }}
                    className="text-[11px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 bg-sky-100 hover:bg-sky-200 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ouvrir la gestion du lien
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Statut :</span>
                  {editingTech.telegramLinkDisabled || editingTech.telegramActivationStatus === 'REVOKED' ? (
                    <span className="font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full text-[10px]">
                      🔴 Lien Suspendu
                    </span>
                  ) : editingTech.telegramActivationStatus === 'ACTIVATED' ? (
                    <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">
                      🟢 Activé & Connecté ({editingTech.telegramUsername || editingTech.telegramChatId})
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full text-[10px]">
                      🟡 En attente de clic du technicien
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                  Zones techniques couvertes :
                </label>
                <div className="grid grid-cols-2 gap-2 border border-slate-200 p-3 rounded-xl max-h-36 overflow-y-auto bg-slate-50">
                  {zones.filter(z => !editSectorId || z.sectorId === editSectorId).map(z => {
                    const checked = editSelectedZones.includes(z.id);
                    return (
                      <label key={z.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            if (e.target.checked) {
                              setEditSelectedZones([...editSelectedZones, z.id]);
                            } else {
                              setEditSelectedZones(editSelectedZones.filter(id => id !== z.id));
                            }
                          }}
                          className="rounded border-slate-300 text-slate-900"
                        />
                        <span className="truncate">{z.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={editIsActive}
                  onChange={e => setEditIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <label htmlFor="activeCheck" className="text-xs text-slate-800 font-semibold cursor-pointer">
                  Technicien actif (Reçoit les propositions de dispatch)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTech(null)}
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

      {/* Tab: Deduplication (§4) */}
      {activeTab === 'DEDUP' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-amber-600" />
              <span>Doublons d'Orthographe et de Casse Détectés ({duplicateGroups.length})</span>
            </h2>

            {duplicateGroups.length === 0 ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-medium">
                ✓ Aucun doublon de nom actif détecté dans le référentiel techniciens.
              </div>
            ) : (
              <div className="space-y-3">
                {duplicateGroups.map((group, idx) => {
                  const [first, second] = group.techs;
                  return (
                    <div key={idx} className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                      <div>
                        <div className="font-bold text-amber-950">
                          Nom normalisé : "{group.normalizedName}"
                        </div>
                        <div className="text-[11px] text-amber-800 mt-1">
                          • Compte A : <b>{first.fullName}</b> ({first.phone})<br/>
                          • Compte B : <b>{second.fullName}</b> ({second.phone})
                        </div>
                      </div>

                      <button
                        onClick={() => handleMerge(second.id, first.id)}
                        className="px-4 py-2 text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white rounded-xl shadow-xs"
                      >
                        Fusionner B vers A ({first.fullName})
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Comptes Non-Humains & Mots-Clés Suspects</span>
            </h2>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {nonHumanAccounts.map(account => (
                <div key={account.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50">
                  <div>
                    <span className="font-bold text-slate-900">{account.fullName}</span>
                    <span className="text-[11px] text-slate-500 block">
                      Statut : {account.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                  </div>

                  {account.isActive ? (
                    <button
                      onClick={() => handleDeactivateFake(account.id)}
                      className="px-3 py-1.5 text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg"
                    >
                      Désactiver
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 font-semibold">✓ Assaini</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: New Technician */}
      {activeTab === 'NEW' && (
        <form onSubmit={handleCreateTechnician} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs max-w-xl space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            Créer un Nouveau Technicien
          </h2>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nom complet</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex: Youssef Mansouri"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Téléphone mobile GSM</label>
              <input
                type="text"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="+212 6..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Secteur</label>
              <select
                value={newSectorId}
                onChange={e => setNewSectorId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900"
                required
              >
                <option value="">Sélectionner...</option>
                {sectors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Automated Telegram Activation Info */}
            <div className="col-span-2 p-3.5 bg-sky-50/70 border border-sky-200/90 rounded-2xl space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  <span>Activation Telegram Automatique par Lien Unique</span>
                </div>
                <span className="text-[10px] bg-sky-200/80 text-sky-800 font-bold px-2 py-0.5 rounded-full">
                  Sans saisie d'ID manuel
                </span>
              </div>
              <p className="text-[11px] text-sky-800 leading-relaxed">
                À l'enregistrement, un <b>lien d'activation direct</b> sera généré pour ce technicien. Vous pourrez l'envoyer en 1 clic par <b>WhatsApp</b> ou <b>SMS</b>. Dès qu'il clique sur "Démarrer", son compte sera automatiquement activé et supervisé en vert.
              </p>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
              Zones MSAN couvertes :
            </label>
            <div className="grid grid-cols-2 gap-2 border border-slate-200 p-3 rounded-xl max-h-36 overflow-y-auto bg-slate-50">
              {zones.filter(z => !newSectorId || z.sectorId === newSectorId).map(z => {
                const checked = newSelectedZones.includes(z.id);
                return (
                  <label key={z.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        if (e.target.checked) {
                          setNewSelectedZones([...newSelectedZones, z.id]);
                        } else {
                          setNewSelectedZones(newSelectedZones.filter(id => id !== z.id));
                        }
                      }}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span className="truncate">{z.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab('LIST')}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5 text-sky-400" />
              <span>Créer le technicien & Générer le lien</span>
            </button>
          </div>
        </form>
      )}

      {/* Telegram Link Supervision & Sharing Modal */}
      <TelegramLinkModal
        technician={selectedTechForTelegram}
        onClose={() => setSelectedTechForTelegram(null)}
      />

    </div>
  );
};
