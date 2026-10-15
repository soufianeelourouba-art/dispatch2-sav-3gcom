import React, { useState } from 'react';
import { store } from '../../services/storage';
import {
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Radio,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';

interface LoginViewProps {
  // Shown when the account exists in Firebase Auth but has no profile (role/sectors) yet.
  noProfile?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({ noProfile = false }) => {
  const [mode, setMode] = useState<'LOGIN' | 'RESET'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const switchMode = (next: 'LOGIN' | 'RESET') => {
    setMode(next);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage('Veuillez saisir votre adresse e-mail.');
      return;
    }
    if (!password) {
      setErrorMessage('Veuillez saisir votre mot de passe.');
      return;
    }

    setIsLoading(true);
    const result = await store.login(email, password);
    setIsLoading(false);
    // On success, App re-renders from the auth state; nothing else to do here.
    if (!result.success) {
      setErrorMessage(result.error || 'E-mail ou mot de passe incorrect.');
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email.trim()) {
      setErrorMessage('Veuillez saisir votre adresse e-mail.');
      return;
    }
    setIsLoading(true);
    await store.sendPasswordReset(email);
    setIsLoading(false);
    // Same message whether or not the account exists, to avoid revealing registered e-mails.
    setSuccessMessage('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d\'être envoyé.');
  };

  const inputClass =
    'block w-full pl-10 pr-3 py-2.5 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all';

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">

      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">

        {/* Brand header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-600 shadow-xl text-emerald-400 mb-4">
            <Radio className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            3GCOM Dispatch SAV
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Plateforme de Pilotage & Traçabilité Fibre Optique Maroc Telecom
          </p>
        </div>

        {/* Card */}
        <div className="mt-6 bg-white/95 backdrop-blur-md py-7 px-6 shadow-2xl rounded-3xl sm:px-10 border border-white/20">

          <div className="mb-6 pb-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                {mode === 'LOGIN' ? 'Authentification sécurisée' : 'Mot de passe oublié'}
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {mode === 'LOGIN' ? 'Connexion à votre espace' : 'Réinitialiser le mot de passe'}
              </h3>
            </div>
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>

          {noProfile && (
            <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-2xl text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Votre compte n'est rattaché à aucun profil. Contactez votre manager pour obtenir un accès.</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-5 bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl text-xs flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 bg-emerald-50 border border-emerald-300 text-emerald-800 p-3.5 rounded-2xl text-xs flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={mode === 'LOGIN' ? handleLoginSubmit : handleResetSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Adresse e-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="prenom.nom@3gcom.ma"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Password */}
            {mode === 'LOGIN' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Mot de passe
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900 shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
              >
                {mode === 'LOGIN' ? (
                  <>
                    <span>{isLoading ? 'Connexion en cours...' : 'Se connecter'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>{isLoading ? 'Envoi...' : 'Recevoir le lien de réinitialisation'}</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => switchMode(mode === 'LOGIN' ? 'RESET' : 'LOGIN')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
              >
                {mode === 'LOGIN' ? 'Mot de passe oublié ?' : 'Retour à la connexion'}
              </button>
            </div>
          </form>

        </div>

        <div className="text-center mt-6 text-[11px] text-slate-500">
          Accès réservé · Comptes créés par la Direction SAV · Fuseau Africa/Casablanca
        </div>

      </div>

    </div>
  );
};
