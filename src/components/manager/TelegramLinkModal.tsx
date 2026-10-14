import React, { useState, useEffect } from 'react';
import { Technician } from '../../types';
import { telegramBotService } from '../../services/telegramBotService';
import { store, formatCasablancaDateTime } from '../../services/storage';
import { 
  X, 
  Send, 
  Copy, 
  Check, 
  RefreshCw, 
  PowerOff, 
  Play, 
  CheckCircle2, 
  Radio, 
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Sparkles
} from 'lucide-react';

interface TelegramLinkModalProps {
  technician: Technician | null;
  onClose: () => void;
}

export const TelegramLinkModal: React.FC<TelegramLinkModalProps> = ({ technician, onClose }) => {
  const [currentTech, setCurrentTech] = useState<Technician | null>(technician);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setCurrentTech(technician);
    setTestResult(null);
  }, [technician]);

  // Subscribe to store changes so modal updates live when technician clicks link
  useEffect(() => {
    if (!technician) return;
    const unsubscribe = store.subscribe(() => {
      const updated = store.getTechnicians().find(t => t.id === technician.id);
      if (updated) {
        setCurrentTech(updated);
      }
    });
    return () => unsubscribe();
  }, [technician]);

  if (!currentTech) return null;

  const isActivated = currentTech.telegramActivationStatus === 'ACTIVATED' && !currentTech.telegramLinkDisabled;
  const isPending = currentTech.telegramActivationStatus === 'PENDING' && !currentTech.telegramLinkDisabled;
  const isSuspended = currentTech.telegramLinkDisabled || currentTech.telegramActivationStatus === 'REVOKED';

  const activationLink = telegramBotService.getActivationLink(currentTech);
  const whatsAppUrl = telegramBotService.getWhatsAppShareUrl(currentTech);
  const smsUrl = telegramBotService.getSmsShareUrl(currentTech);

  const handleCopy = () => {
    navigator.clipboard.writeText(activationLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleReset = () => {
    if (confirm(`Êtes-vous sûr de vouloir réinitialiser le lien d'activation de ${currentTech.fullName} ? L'ancien lien deviendra immédiatement invalide.`)) {
      const updated = telegramBotService.resetLink(currentTech.id);
      if (updated) setCurrentTech(updated);
      setTestResult({ success: true, message: 'Nouveau lien d\'activation généré. L\'ancien est révoqué.' });
    }
  };

  const handleStop = () => {
    if (confirm(`Suspendre le lien Telegram pour ${currentTech.fullName} ? Il ne recevra plus d'interventions jusqu'à réactivation.`)) {
      const updated = telegramBotService.stopLink(currentTech.id);
      if (updated) setCurrentTech(updated);
      setTestResult({ success: false, message: 'Liaison Telegram suspendue.' });
    }
  };

  const handleResume = () => {
    const updated = telegramBotService.resumeLink(currentTech.id);
    if (updated) setCurrentTech(updated);
    setTestResult({ success: true, message: 'Liaison Telegram réactivée avec succès.' });
  };

  const handleSimulateClick = () => {
    const updated = telegramBotService.simulateActivation(currentTech.id);
    if (updated) setCurrentTech(updated);
    setTestResult({
      success: true,
      message: `[Simulation] Clic et commande /start réussis ! ${currentTech.fullName} est maintenant activé.`,
    });
  };

  const handleTestPing = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await telegramBotService.testPing(currentTech);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: `Erreur : ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg">
                <Send className="w-4 h-4" />
              </span>
              <h3 className="font-bold text-base tracking-tight">
                Liaison Telegram : {currentTech.fullName}
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Activation sans formulaire par lien direct & supervision en temps réel
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs">
          
          {/* Supervision Status Card */}
          <div className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
            isSuspended
              ? 'bg-rose-50/80 border-rose-200 text-rose-900'
              : isActivated
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/80 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-white shadow-xs shrink-0 mt-0.5">
                {isSuspended ? (
                  <PowerOff className="w-5 h-5 text-rose-600" />
                ) : isActivated ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Radio className="w-5 h-5 text-amber-600 animate-pulse" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">
                    {isSuspended
                      ? 'Lien Suspendu / Arrêté'
                      : isActivated
                      ? 'Compte Activé & Synchronisé'
                      : 'En Attente de Clic Technicien'}
                  </span>
                </div>
                <div className="text-[11px] leading-relaxed text-slate-600">
                  {isSuspended ? (
                    'Ce technicien ne recevra aucune notification Telegram tant que le lien reste suspendu.'
                  ) : isActivated ? (
                    <div>
                      <span>Connecté via Chat ID : <b>{currentTech.telegramChatId}</b></span>
                      {currentTech.telegramUsername && (
                        <span> ({currentTech.telegramUsername})</span>
                      )}
                      {currentTech.telegramActivatedAt && (
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Activé le {formatCasablancaDateTime(currentTech.telegramActivatedAt)}
                        </span>
                      )}
                    </div>
                  ) : (
                    'Le technicien doit cliquer sur le lien et appuyer sur "Démarrer" dans Telegram pour activer la synchronisation.'
                  )}
                </div>
              </div>
            </div>

            {/* Test connection button if activated */}
            {isActivated && (
              <button
                onClick={handleTestPing}
                disabled={isTesting}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shrink-0 flex items-center gap-1 shadow-xs transition-colors"
                title="Envoyer un message de test immédiat au technicien"
              >
                <Send className="w-3 h-3" />
                <span>{isTesting ? 'Test...' : 'Tester'}</span>
              </button>
            )}
          </div>

          {/* Test or Feedback Result */}
          {testResult && (
            <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-medium ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Activation Link & 1-Click Send Section */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Lien direct d'activation Telegram :
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={activationLink}
                className="w-full font-mono text-[11px] bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-800 select-all"
              />
              <button
                onClick={handleCopy}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 shrink-0 transition-colors border border-slate-200"
                title="Copier le lien d'activation"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copié !' : 'Copier'}</span>
              </button>
            </div>
          </div>

          {/* Action Buttons: 1-Click Dispatch */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Envoyer sur WhatsApp</span>
            </a>

            <a
              href={smsUrl}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Envoyer par SMS</span>
            </a>
          </div>

          {/* Supervisor Controls: Reset & Stop */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Contrôles du Superviseur :
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Reset link */}
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-semibold text-[11px] flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Génère un nouveau token et invalide le lien précédent"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Réinitialiser le lien</span>
              </button>

              {/* Stop / Resume */}
              {isSuspended ? (
                <button
                  type="button"
                  onClick={handleResume}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg font-semibold text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Réactiver le lien</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg font-semibold text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <PowerOff className="w-3.5 h-3.5 text-rose-600" />
                  <span>Arrêter / Suspendre le lien</span>
                </button>
              )}

              {/* Simulation test button */}
              {!isActivated && (
                <button
                  type="button"
                  onClick={handleSimulateClick}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300 rounded-lg font-semibold text-[11px] flex items-center gap-1.5 transition-colors ml-auto"
                  title="Simuler un clic du technicien pour tester le workflow sans smartphone"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Simuler l'activation (Test)</span>
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
