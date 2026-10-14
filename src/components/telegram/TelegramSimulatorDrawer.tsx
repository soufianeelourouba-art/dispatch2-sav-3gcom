import React, { useState, useEffect } from 'react';
import { Technician, Ticket, LITIGE_REASONS, LitigeReasonCode } from '../../types';
import { store } from '../../services/storage';
import { telegramGateway, TelegramOutboundMessage } from '../../services/telegramSimulator';
import { 
  Smartphone, 
  Wifi, 
  WifiOff, 
  CheckCheck, 
  Clock, 
  MapPin, 
  Phone, 
  AlertTriangle, 
  X, 
  CheckCircle2, 
  ChevronRight,
  RotateCcw,
  Ruler,
  Cpu,
  Send,
  Radio,
  PowerOff,
  Sparkles
} from 'lucide-react';
import { telegramBotService } from '../../services/telegramBotService';

interface TelegramSimulatorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onTicketEventAdded?: () => void;
}

type TelegramStep = 'INITIAL_CHOICE' | 'NF_SUBCHOICE' | 'NF_CONFIG_DETAILS' | 'LITIGE_CHOICE' | 'LITIGE_RDV_DETAILS' | 'LITIGE_COMMENT';

export const TelegramSimulatorDrawer: React.FC<TelegramSimulatorDrawerProps> = ({
  isOpen,
  onClose,
  onTicketEventAdded,
}) => {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [queue, setQueue] = useState<TelegramOutboundMessage[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Active interaction wizard state per ticket
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<TelegramStep>('INITIAL_CHOICE');
  
  // NF form state
  const [nfType, setNfType] = useState<'STANDARD' | 'CENTRAL_CONFIG'>('STANDARD');
  const [ontSerial, setOntSerial] = useState<string>('ALCLB982103F');
  const [cableLength, setCableLength] = useState<number>(45);

  // Litige form state
  const [selectedLitigeCode, setSelectedLitigeCode] = useState<LitigeReasonCode>('CLIENT_UNREACHABLE');
  const [rdvDate, setRdvDate] = useState<string>('');
  const [litigeComment, setLitigeComment] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const techs = store.getTechnicians().filter(t => t.isActive);
      setTechnicians(techs);
      if (!selectedTechId && techs.length > 0) {
        setSelectedTechId(techs[0].id);
      }
      setQueue(telegramGateway.getQueue());
      setIsOnline(telegramGateway.getOnlineStatus());
    };

    update();
    const unsubStore = store.subscribe(update);
    const unsubTg = telegramGateway.subscribe(update);
    return () => {
      unsubStore();
      unsubTg();
    };
  }, [selectedTechId]);

  if (!isOpen) return null;

  const currentTech = technicians.find(t => t.id === selectedTechId) || technicians[0];
  const allTickets = store.getTickets();

  // Active tickets for this tech (ASSIGNED, REOPENED, etc.)
  const activeTechTickets = allTickets.filter(
    t => t.currentAssignedTechId === currentTech?.id && !t.isClosed
  );

  const startNF = (ticketId: string) => {
    setActiveTicketId(ticketId);
    setCurrentStep('NF_SUBCHOICE');
    setNfType('STANDARD');
    setOntSerial('ALCLB' + Math.floor(100000 + Math.random() * 900000));
    setCableLength(40);
  };

  const startLitige = (ticketId: string) => {
    setActiveTicketId(ticketId);
    setCurrentStep('LITIGE_CHOICE');
    setSelectedLitigeCode('CLIENT_UNREACHABLE');
    setRdvDate(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    setLitigeComment('');
  };

  const submitNFStandard = (ticketId: string) => {
    if (!currentTech) return;
    telegramGateway.submitNF({
      ticketId,
      technicianId: currentTech.id,
      technicianName: currentTech.fullName,
      nfType: 'STANDARD',
      cableLengthMeters: cableLength,
    });
    setActiveTicketId(null);
    setCurrentStep('INITIAL_CHOICE');
    if (onTicketEventAdded) onTicketEventAdded();
  };

  const submitNFCentral = (ticketId: string) => {
    if (!currentTech) return;
    telegramGateway.submitNF({
      ticketId,
      technicianId: currentTech.id,
      technicianName: currentTech.fullName,
      nfType: 'CENTRAL_CONFIG',
      ontSerialNumber: ontSerial.trim().toUpperCase(),
      cableLengthMeters: cableLength,
    });
    setActiveTicketId(null);
    setCurrentStep('INITIAL_CHOICE');
    if (onTicketEventAdded) onTicketEventAdded();
  };

  const handleSelectLitigeOption = (ticketId: string, code: LitigeReasonCode) => {
    setSelectedLitigeCode(code);
    if (code === 'RDV') {
      setCurrentStep('LITIGE_RDV_DETAILS');
    } else {
      setCurrentStep('LITIGE_COMMENT');
    }
  };

  const confirmLitige = (ticketId: string) => {
    if (!currentTech) return;
    const def = LITIGE_REASONS.find(r => r.code === selectedLitigeCode);
    telegramGateway.submitLitige({
      ticketId,
      technicianId: currentTech.id,
      technicianName: currentTech.fullName,
      litigeReasonCode: selectedLitigeCode,
      litigeReasonLabel: def?.label || selectedLitigeCode,
      rdvDateTime: selectedLitigeCode === 'RDV' ? rdvDate : undefined,
      notes: litigeComment.trim() || undefined,
    });
    setActiveTicketId(null);
    setCurrentStep('INITIAL_CHOICE');
    if (onTicketEventAdded) onTicketEventAdded();
  };

  const cancelFlow = () => {
    setActiveTicketId(null);
    setCurrentStep('INITIAL_CHOICE');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div 
        className="w-full max-w-md bg-slate-950 h-full shadow-2xl flex flex-col border-l border-slate-800 animate-in slide-in-from-right duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold tracking-tight">
              Console Telegram Smartphone
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const nextState = !isOnline;
                setIsOnline(nextState);
                telegramGateway.setOnlineStatus(nextState);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                isOnline ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'Connecté' : 'Hors-ligne'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Technician Selector */}
        <div className="p-3 bg-slate-900/80 border-b border-slate-800">
          <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1 tracking-wider">
            Technicien sur le terrain :
          </label>
          <select
            value={selectedTechId}
            onChange={e => {
              setSelectedTechId(e.target.value);
              cancelFlow();
            }}
            className="w-full text-xs font-medium bg-slate-800 text-white rounded-md border border-slate-700 px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
          >
            {technicians.map(t => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.phone})
              </option>
            ))}
          </select>
        </div>

        {/* Telegram Chat Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950 text-slate-200">
          
          {/* Telegram Header */}
          <div className="bg-sky-600 p-3 rounded-xl shadow-md text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                🤖
              </div>
              <div>
                <div className="text-xs font-bold leading-tight">Bot SAV Fibre 3GCOM</div>
                <div className="text-[10px] text-sky-100">Arborescence Telegram terrain</div>
              </div>
            </div>
            <div className="text-[11px] font-mono text-sky-200">
              {currentTech?.fullName}
            </div>
          </div>

          {activeTechTickets.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-200">Aucune intervention en cours</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Aucun ticket actif assigné à {currentTech?.fullName}.
              </p>
            </div>
          ) : (
            activeTechTickets.map(ticket => {
              const isInteracting = activeTicketId === ticket.id;

              return (
                <div
                  key={ticket.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg text-xs space-y-3"
                >
                  {/* Reopened Banner by Dispatcher (§2) */}
                  {ticket.currentStatus === 'REOPENED' && (
                    <div className="bg-amber-950/80 border border-amber-600/70 p-2.5 rounded-lg text-amber-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-300">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>TICKET RÉOUVERT PAR L'ORIENTEUR</span>
                      </div>
                      <div className="text-[11px] text-white font-medium bg-amber-900/40 p-2 rounded border border-amber-700/50">
                        "{ticket.lastDispatcherUpdateNotes || 'Nouvelles instructions reçues'}"
                      </div>
                      {ticket.reopenedWithNewPhone && (
                        <div className="text-[11px] text-amber-200 font-mono">
                          📞 Nouveau numéro client : <b>{ticket.reopenedWithNewPhone}</b>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ticket Header & Details */}
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono font-bold text-sky-400 text-xs">
                        {ticket.ticketNumber}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        Abonné : <b>{ticket.clientName}</b>
                      </span>
                    </div>

                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {ticket.rawZoneText}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-300 bg-slate-950/50 p-2.5 rounded-lg border border-slate-850">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-slate-500" />
                      <span className="font-mono font-semibold text-white">{ticket.clientPhone}</span>
                    </div>
                    <div className="flex items-start gap-2 text-slate-400">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                      <span>{ticket.clientAddress}</span>
                    </div>
                  </div>

                  {/* TELEGRAM BUTTONS FLOW (§1) */}
                  {!isInteracting && (
                    <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2">
                      {/* Button 1: NF */}
                      <button
                        onClick={() => startNF(ticket.id)}
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>🟢 NF (Normalisé)</span>
                      </button>

                      {/* Button 2: Litige / LC */}
                      <button
                        onClick={() => startLitige(ticket.id)}
                        className="py-2 px-3 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>🔴 Litige (LC)</span>
                      </button>
                    </div>
                  )}

                  {/* WIZARD: STEP NF */}
                  {isInteracting && currentStep === 'NF_SUBCHOICE' && (
                    <div className="p-3 bg-slate-850 rounded-lg border border-emerald-900/60 space-y-3 animate-in fade-in">
                      <div className="font-semibold text-emerald-400 text-xs">
                        Clôture NF — Sélectionnez le type de normalisation :
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setNfType('STANDARD');
                            setCurrentStep('NF_CONFIG_DETAILS');
                          }}
                          className="p-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-lg text-left border border-slate-700"
                        >
                          <div className="font-bold text-xs">NF Standard</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Raccordement direct sans config centrale</div>
                        </button>

                        <button
                          onClick={() => {
                            setNfType('CENTRAL_CONFIG');
                            setCurrentStep('NF_CONFIG_DETAILS');
                          }}
                          className="p-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-lg text-left border border-slate-700"
                        >
                          <div className="font-bold text-xs flex items-center gap-1 text-emerald-400">
                            <Cpu className="w-3 h-3" />
                            <span>NF Config Centrale</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">ONT + Paramétrage opérateur</div>
                        </button>
                      </div>

                      <button
                        onClick={cancelFlow}
                        className="w-full text-center text-[11px] text-slate-400 hover:text-white pt-1"
                      >
                        Annuler
                      </button>
                    </div>
                  )}

                  {/* WIZARD: NF DETAILS (Serial number if central config + Cable length in meters §1) */}
                  {isInteracting && currentStep === 'NF_CONFIG_DETAILS' && (
                    <div className="p-3 bg-slate-850 rounded-lg border border-emerald-900/60 space-y-3 animate-in fade-in">
                      <div className="font-bold text-emerald-400 text-xs">
                        {nfType === 'CENTRAL_CONFIG' ? 'Config Centrale & Métrage' : 'Métrage Câble Posé'}
                      </div>

                      {nfType === 'CENTRAL_CONFIG' && (
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">
                            Numéro de série ONT (Obligatoire) :
                          </label>
                          <input
                            type="text"
                            value={ontSerial}
                            onChange={e => setOntSerial(e.target.value)}
                            placeholder="ex: ALCLB982103F ou ZTEG..."
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-xs uppercase"
                          />
                        </div>
                      )}

                      {/* Cable Length input / quick buttons (§1) */}
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider flex items-center gap-1">
                          <Ruler className="w-3 h-3 text-slate-400" />
                          <span>Longueur de câble posé (mètres) :</span>
                        </label>
                        <div className="flex items-center gap-1.5 mb-2">
                          {[0, 25, 45, 70, 100].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setCableLength(m)}
                              className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                                cableLength === m 
                                  ? 'bg-emerald-700 text-white font-bold' 
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                              }`}
                            >
                              {m === 0 ? '0m' : `${m}m`}
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          value={cableLength}
                          onChange={e => setCableLength(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-xs"
                          placeholder="Métrage personnalisé..."
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setCurrentStep('NF_SUBCHOICE')}
                          className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
                        >
                          Retour
                        </button>
                        <button
                          onClick={() => nfType === 'CENTRAL_CONFIG' ? submitNFCentral(ticket.id) : submitNFStandard(ticket.id)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold"
                        >
                          Valider NF ({cableLength}m)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* WIZARD: LITIGE REASONS (§1: Client injoignable, RDV, GC, Autre) */}
                  {isInteracting && currentStep === 'LITIGE_CHOICE' && (
                    <div className="p-3 bg-slate-850 rounded-lg border border-rose-900/60 space-y-2.5 animate-in fade-in">
                      <div className="font-semibold text-rose-400 text-xs">
                        Déclarer un Litige (LC) — Choisir le motif :
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleSelectLitigeOption(ticket.id, 'CLIENT_UNREACHABLE')}
                          className="p-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-lg text-left border border-slate-700"
                        >
                          <div className="font-bold text-xs">Client injoignable</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Appels sans réponse</div>
                        </button>

                        <button
                          onClick={() => handleSelectLitigeOption(ticket.id, 'RDV')}
                          className="p-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-lg text-left border border-slate-700"
                        >
                          <div className="font-bold text-xs text-amber-400">RDV Client</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Report à date fixée</div>
                        </button>

                        <button
                          onClick={() => handleSelectLitigeOption(ticket.id, 'GC')}
                          className="p-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-lg text-left border border-slate-700"
                        >
                          <div className="font-bold text-xs text-orange-400">GC (Génie Civil)</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Fourreau / chambre bloqué</div>
                        </button>

                        <button
                          onClick={() => handleSelectLitigeOption(ticket.id, 'AUTRE')}
                          className="p-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-lg text-left border border-slate-700"
                        >
                          <div className="font-bold text-xs">Autre motif</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Refus client, incident...</div>
                        </button>
                      </div>

                      <button
                        onClick={cancelFlow}
                        className="w-full text-center text-[11px] text-slate-400 hover:text-white pt-1"
                      >
                        Annuler
                      </button>
                    </div>
                  )}

                  {/* WIZARD: RDV Date details (§1: "si on clique ici on entre la date") */}
                  {isInteracting && currentStep === 'LITIGE_RDV_DETAILS' && (
                    <div className="p-3 bg-slate-850 rounded-lg border border-amber-900/60 space-y-3 animate-in fade-in">
                      <div className="font-bold text-amber-400 text-xs">
                        Planification du Rendez-vous Client
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">
                          Date et heure du nouveau rendez-vous convenu :
                        </label>
                        <input
                          type="datetime-local"
                          value={rdvDate}
                          onChange={e => setRdvDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono text-xs"
                          required
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">
                          Précision du client (Optionnel) :
                        </label>
                        <input
                          type="text"
                          value={litigeComment}
                          onChange={e => setLitigeComment(e.target.value)}
                          placeholder="Ex: Le client sera dispo uniquement après 16h..."
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white text-xs"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setCurrentStep('LITIGE_CHOICE')}
                          className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
                        >
                          Retour
                        </button>
                        <button
                          onClick={() => confirmLitige(ticket.id)}
                          className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold"
                        >
                          Enregistrer RDV
                        </button>
                      </div>
                    </div>
                  )}

                  {/* WIZARD: LITIGE COMMENT FOR GC / AUTRE */}
                  {isInteracting && currentStep === 'LITIGE_COMMENT' && (
                    <div className="p-3 bg-slate-850 rounded-lg border border-rose-900/60 space-y-3 animate-in fade-in">
                      <div className="font-bold text-rose-400 text-xs">
                        Détail du Litige ({selectedLitigeCode === 'GC' ? 'Génie Civil' : 'Constat'})
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">
                          Observation terrain pour l'orienteur :
                        </label>
                        <textarea
                          rows={2}
                          value={litigeComment}
                          onChange={e => setLitigeComment(e.target.value)}
                          placeholder={
                            selectedLitigeCode === 'GC'
                              ? 'Ex: Fourreau bouché à 15 mètres du PBO, chambre de tirage sous le goudron...'
                              : 'Précisez la situation rencontrée...'
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setCurrentStep('LITIGE_CHOICE')}
                          className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
                        >
                          Retour
                        </button>
                        <button
                          onClick={() => confirmLitige(ticket.id)}
                          className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold"
                        >
                          Confirmer le Litige
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              );
            })
          )}

        </div>

      </div>
    </div>
  );
};
