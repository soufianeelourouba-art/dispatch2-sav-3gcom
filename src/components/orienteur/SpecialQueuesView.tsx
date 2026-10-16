import React, { useState } from 'react';
import { Ticket, User, Technician } from '../../types';
import { store } from '../../services/storage';
import { StatusPill } from '../tickets/StatusPill';
import { 
  AlertTriangle, 
  MapPin, 
  UserCheck, 
  ArrowRight, 
  FileQuestion, 
  Repeat, 
  PlusCircle,
  CheckCircle2,
  Calendar
} from 'lucide-react';

interface SpecialQueuesViewProps {
  currentUser: User;
  onOpenTicketHistory: (ticket: Ticket) => void;
  onNavigateToReferentiel?: () => void;
}

export const SpecialQueuesView: React.FC<SpecialQueuesViewProps> = ({
  currentUser,
  onOpenTicketHistory,
  onNavigateToReferentiel,
}) => {
  const [activeQueue, setActiveQueue] = useState<'SECOND_VISIT' | 'TO_ASSIGN' | 'UNMAPPED_ZONE'>('SECOND_VISIT');
  const [mappingZoneText, setMappingZoneText] = useState<string | null>(null);
  const [targetZoneId, setTargetZoneId] = useState<string>('');

  const tickets = store.getTickets(currentUser);
  const technicians = store.getTechnicians(currentUser).filter(t => t.isActive);
  const zones = store.getTechnicalZones(currentUser);

  const secondVisitTickets = tickets.filter(t => t.visitCount > 1);
  const unassignedTickets = tickets.filter(t => t.currentStatus === 'TO_ASSIGN');
  const unmappedZoneTickets = tickets.filter(t => t.currentStatus === 'ZONE_TO_MAP');

  const handleQuickAssign = (ticketId: string, techId: string) => {
    const tech = technicians.find(t => t.id === techId);
    if (!tech) return;

    store.reassignTicket(ticketId, tech.id, tech.fullName, currentUser.name, 'Affectation manuelle depuis file spéciale');
  };

  const handleResolveZoneAlias = (rawLabel: string) => {
    if (!targetZoneId) return;
    store.addZoneAlias(rawLabel, targetZoneId);
    setMappingZoneText(null);
    setTargetZoneId('');
  };

  return (
    <div className="space-y-4">
      
      <p className="text-xs text-slate-500">
        Dossiers à surveiller : deuxièmes visites, tickets sans affectation automatique et zones inconnues des fichiers Excel.
      </p>

      {/* Queue selector tabs */}
      <div className="flex gap-1 p-1 bg-white rounded-xl border border-slate-200 overflow-x-auto self-start w-fit max-w-full text-xs font-bold">
        <button
          onClick={() => setActiveQueue('SECOND_VISIT')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeQueue === 'SECOND_VISIT'
              ? 'bg-brand-navy-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>Deuxièmes visites ({secondVisitTickets.length})</span>
        </button>

        <button
          onClick={() => setActiveQueue('TO_ASSIGN')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeQueue === 'TO_ASSIGN'
              ? 'bg-brand-navy-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>À affecter à la main ({unassignedTickets.length})</span>
        </button>

        <button
          onClick={() => setActiveQueue('UNMAPPED_ZONE')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeQueue === 'UNMAPPED_ZONE'
              ? 'bg-brand-navy-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileQuestion className="w-3.5 h-3.5" />
          <span>Zones MSAN à rattacher ({unmappedZoneTickets.length})</span>
        </button>
      </div>

      {/* Content for Second Visits Queue */}
      {activeQueue === 'SECOND_VISIT' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
          <div className="p-4 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between">
            <span className="font-semibold">
              Règle appliquée : Mêmes techniciens pour cause externe · Techniciens différents pour cause technique
            </span>
            <span className="font-mono font-bold text-amber-800">
              {secondVisitTickets.length} dossier(s)
            </span>
          </div>

          {secondVisitTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Aucune deuxième visite en cours dans ce secteur.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Ticket</th>
                    <th className="py-3 px-4">Abonné & Lieu</th>
                    <th className="py-3 px-4">Précédent Échec</th>
                    <th className="py-3 px-4">Technicien Actuel</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {secondVisitTickets.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {t.ticketNumber}
                        <span className="block text-[10px] text-amber-800 font-semibold">
                          Visite #{t.visitCount}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{t.clientName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{t.clientPhone}</div>
                        <div className="text-[11px] text-slate-400">{t.clientAddress}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] text-rose-700 block font-semibold">
                          {t.lastLitigeReasonLabel || 'Défaut non spécifié'}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Précédent : {t.lastVisitedTechName || 'Inconnu'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {technicians.find(tc => tc.id === t.currentAssignedTechId)?.fullName || 'En attente d\'affectation'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusPill status={t.currentStatus} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onOpenTicketHistory(t)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          Historique
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Content for Manual Assignment Queue */}
      {activeQueue === 'TO_ASSIGN' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs text-slate-700 font-semibold">
            Tickets sans affectation automatique
          </div>

          {unassignedTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Aucun ticket à affecter manuellement.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Ticket</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Zone MSAN</th>
                    <th className="py-3 px-4">Affecter à</th>
                    <th className="py-3 px-4 text-right">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {unassignedTickets.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {t.ticketNumber}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {t.clientName}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {t.rawZoneText}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          onChange={e => {
                            if (e.target.value) handleQuickAssign(t.id, e.target.value);
                          }}
                          className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-800"
                        >
                          <option value="">Sélectionner technicien...</option>
                          {technicians.map(tc => (
                            <option key={tc.id} value={tc.id}>
                              {tc.fullName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onOpenTicketHistory(t)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          Voir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Content for Unmapped Zones Queue */}
      {activeQueue === 'UNMAPPED_ZONE' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
          <div className="p-4 bg-rose-50 border-b border-rose-200 text-xs text-rose-900 font-semibold">
            Libellés de zone inconnus rencontrés dans les fichiers Excel. Rattachez-les ci-dessous :
          </div>

          {unmappedZoneTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Toutes les zones techniques des tickets actuels sont identifiées dans le référentiel.
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {unmappedZoneTickets.map(t => (
                <div key={t.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{t.ticketNumber}</span>
                      <span className="text-slate-500 font-medium">· Client : {t.clientName}</span>
                    </div>
                    <div className="text-xs text-rose-700 mt-1 font-semibold">
                      Libellé brut : <span className="underline font-mono bg-white px-1.5 py-0.5 rounded border border-rose-200">{t.rawZoneText}</span>
                    </div>
                  </div>

                  {mappingZoneText === t.rawZoneText ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={targetZoneId}
                        onChange={e => setTargetZoneId(e.target.value)}
                        className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2"
                      >
                        <option value="">-- Choisir la zone officielle --</option>
                        {zones.map(z => (
                          <option key={z.id} value={z.id}>
                            {z.label} ({z.msanCode})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleResolveZoneAlias(t.rawZoneText)}
                        disabled={!targetZoneId}
                        className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-xl transition-colors shadow-xs"
                      >
                        Enregistrer
                      </button>
                      <button
                        onClick={() => setMappingZoneText(null)}
                        className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setMappingZoneText(t.rawZoneText);
                        setTargetZoneId('');
                      }}
                      className="px-4 py-2 text-xs font-bold text-rose-800 bg-rose-100 hover:bg-rose-200 rounded-xl transition-colors"
                    >
                      Rattacher ce libellé à une zone
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
