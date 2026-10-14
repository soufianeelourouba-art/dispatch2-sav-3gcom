import React, { useState } from 'react';
import { User } from '../../types';
import { store } from '../../services/storage';
import { 
  ShieldCheck, 
  Lock, 
  User as UserIcon, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Radio, 
  Building2,
  Sparkles,
  UserPlus,
  LogIn,
  Database,
  Globe
} from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSectorId, setRegSectorId] = useState('');
  const [regEmail, setRegEmail] = useState('');

  const allUsers = store.getAllUsers();
  const sectors = store.getSectors();

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim()) {
      setErrorMessage('Veuillez saisir votre identifiant.');
      return;
    }

    if (!password.trim()) {
      setErrorMessage('Veuillez saisir votre mot de passe.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const result = store.login(username, password);
      setIsLoading(false);

      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || 'Identifiant ou mot de passe incorrect.');
      }
    }, 200);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!regFullName.trim()) {
      setErrorMessage('Veuillez saisir votre nom et prénom.');
      return;
    }

    if (!regUsername.trim()) {
      setErrorMessage('Veuillez choisir un identifiant de connexion.');
      return;
    }

    const cleanUsername = regUsername.trim().toLowerCase();
    const existing = allUsers.find(u => u.username.toLowerCase() === cleanUsername);
    if (existing) {
      setErrorMessage(`L'identifiant "${cleanUsername}" est déjà utilisé. Veuillez en choisir un autre.`);
      return;
    }

    if (!regPassword.trim() || regPassword.trim().length < 4) {
      setErrorMessage('Le mot de passe doit comporter au moins 4 caractères.');
      return;
    }

    if (!regSectorId) {
      setErrorMessage('Veuillez sélectionner votre secteur de rattachement.');
      return;
    }

    setIsLoading(true);

    try {
      const newUser = store.addUser({
        name: regFullName.trim(),
        username: cleanUsername,
        password: regPassword.trim(),
        role: 'DISPATCHER',
        sectorId: regSectorId,
        email: regEmail.trim() || undefined,
      });

      setIsLoading(false);
      setSuccessMessage(`Compte créé avec succès pour ${newUser.name} ! Connexion automatique...`);

      setTimeout(() => {
        const loginRes = store.login(newUser.username, regPassword.trim());
        if (loginRes.success && loginRes.user) {
          onLoginSuccess(loginRes.user);
        }
      }, 700);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Erreur lors de la création du compte.');
    }
  };

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

          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-slate-800/80 border border-slate-700 rounded-full text-[11px] text-emerald-400 font-medium">
            <Database className="w-3.5 h-3.5" />
            <span>Base de données Firestore Connectée</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
        </div>

        {/* Auth Mode Tabs */}
        <div className="mt-6 flex bg-slate-800/90 p-1 rounded-2xl border border-slate-700 shadow-inner">
          <button
            type="button"
            onClick={() => { setMode('LOGIN'); setErrorMessage(null); setSuccessMessage(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'LOGIN'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Se Connecter</span>
          </button>
          <button
            type="button"
            onClick={() => { setMode('REGISTER'); setErrorMessage(null); setSuccessMessage(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'REGISTER'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Créer un Compte Orienteur</span>
          </button>
        </div>

        {/* Card */}
        <div className="mt-4 bg-white/95 backdrop-blur-md py-7 px-6 shadow-2xl rounded-3xl sm:px-10 border border-white/20">
          
          <div className="mb-6 pb-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                {mode === 'LOGIN' ? 'Authentification Sécurisée' : 'Nouveau Compte Orienteur'}
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {mode === 'LOGIN' ? 'Connexion à votre secteur' : 'Inscription & Clé d\'accès'}
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Multi-utilisateurs
            </span>
          </div>

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

          {/* Form: LOGIN */}
          {mode === 'LOGIN' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              
              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Identifiant utilisateur
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="ex: orienteur_casablanca ou manager_global"
                    className="block w-full pl-10 pr-3 py-2.5 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
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
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-2.5 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900 shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  <span>{isLoading ? 'Connexion en cours...' : 'Se connecter à l\'application'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* Form: REGISTER */}
          {mode === 'REGISTER' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nom et Prénom de l'orienteur *
                </label>
                <input
                  type="text"
                  required
                  value={regFullName}
                  onChange={e => setRegFullName(e.target.value)}
                  placeholder="ex: Youssef El Amrani"
                  className="block w-full px-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Identifiant de connexion souhaité *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={e => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                    placeholder="ex: orienteur_rabat"
                    className="block w-full pl-10 pr-3 py-2 text-xs font-mono font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Lettres minuscules, chiffres ou tirets.</p>
              </div>

              {/* Sector selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Secteur géographique sous votre responsabilité *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <select
                    required
                    value={regSectorId}
                    onChange={e => setRegSectorId(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  >
                    <option value="">-- Choisissez votre secteur --</option>
                    {sectors.map(sec => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name} ({sec.code})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-amber-700 mt-0.5">
                  Cloisonnement strict : vous ne traiterez que les tickets de ce secteur.
                </p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Mot de passe personnel *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="Au moins 4 caractères"
                    className="block w-full pl-10 pr-10 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Email (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email professionnel (optionnel)
                </label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="ex: contact@3gcom.ma"
                  className="block w-full px-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isLoading ? 'Création du compte...' : 'Créer mon compte et me connecter'}</span>
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Security and Cloud hosting notice */}
        <div className="text-center mt-6 text-xs text-slate-400 space-y-1">
          <p className="flex items-center justify-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>Accessible publiquement via URL cloud partagée</span>
          </p>
          <p className="text-[11px] text-slate-500">
            Cloisonnement strict par secteur · Traçabilité inaltérable Africa/Casablanca
          </p>
        </div>

      </div>

    </div>
  );
};
