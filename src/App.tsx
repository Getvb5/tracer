import React, { useState, useEffect, useMemo } from 'react';
import { auth, signInWithGoogle, signInWithGoogleRedirect, logout, db } from './lib/firebase';
import { onAuthStateChanged, User, getRedirectResult } from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDocs, 
  collection, 
  query, 
  limit as fLimit, 
  enableNetwork, 
  disableNetwork 
} from 'firebase/firestore';
import { runAllSyncs } from './lib/autoSync';
import { 
  LayoutDashboard, ClipboardList, LogOut, ShieldCheck, 
  HeartPulse, Activity, UserCircle, Database, 
  FileStack, Building2, CalendarDays, Bell, HelpCircle, 
  User as UserIcon, ChevronDown, Menu, X, SlidersHorizontal,
  FolderLock, RefreshCw, UserCheck, ClipboardCheck, Layers,
  Users, Filter, ChevronRight, CheckCircle2, Sparkles, BookOpen,
  AlertCircle, ExternalLink, Loader2, FileSpreadsheet, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Dashboard from './components/Dashboard';
import DataManagement from './components/DataManagement';
import AuditExplorer, { MONTH_NAMES } from './components/AuditExplorer';
import SchedulesSync from './components/SchedulesSync';
import ColetaDigital from './components/ColetaDigital';
import AuditorUnitModal from './components/AuditorUnitModal';
import { GoogleDocsGuideModal } from './components/GoogleDocsGuideModal';
import GoogleSheetWebhookModal from './components/GoogleSheetWebhookModal';
import { getPendingQueue } from './lib/googleSheetWebhook';
import { 
  ADMIN_EMAILS, 
  USER_UNIT_MAPPING, 
  HEALTH_UNITS, 
  AUTHORIZED_AUDITOR_EMAILS, 
  MULTI_UNIT_AUDITOR_EMAILS 
} from './lib/utils';
import loginBg from './assets/images/recife_login_bg_1780339628886.png';

type View = 'dashboard' | 'schedules' | 'data_mgmt' | 'explorer' | 'coleta' | 'indicators' | 'auditors';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [autoSyncState, setAutoSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(() => getPendingQueue().length);

  useEffect(() => {
    const updateQueue = () => {
      setPendingQueueCount(getPendingQueue().length);
    };
    window.addEventListener('webhook-urls-updated', updateQueue);
    window.addEventListener('pending-queue-updated', updateQueue);
    return () => {
      window.removeEventListener('webhook-urls-updated', updateQueue);
      window.removeEventListener('pending-queue-updated', updateQueue);
    };
  }, []);

  const handleGoogleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("[Login] Erro ao autenticar:", err);
      let errorMsg = 'Não foi possível autenticar com o Google. Por favor, tente novamente.';
      if (err?.code === 'auth/unauthorized-domain') {
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
        errorMsg = `O domínio "${currentDomain}" não está autorizado no Firebase Authentication. Para liberar o login, adicione "${currentDomain}" na lista de Domínios Autorizados no console do Firebase (Authentication > Settings > Authorized domains).`;
      } else if (err?.code === 'auth/popup-blocked') {
        errorMsg = 'O navegador bloqueou a janela pop-up de login do Google. Por favor, permita pop-ups para este site ou abra o painel diretamente em uma nova aba.';
      } else if (err?.code === 'auth/popup-closed-by-user') {
        errorMsg = 'A janela de autenticação do Google foi fechada antes de concluir o login. Se você estiver dentro de um visualizador incorporado (iframe) ou se o navegador bloqueou a janela, você pode tentar novamente, abrir o sistema em uma nova aba ou clicar em "Entrar por Redirecionamento".';
      } else if (err?.code === 'auth/cancelled-popup-request') {
        errorMsg = 'Solicitação em andamento cancelada. Clique novamente para entrar.';
      } else if (err?.code === 'auth/network-request-failed') {
        errorMsg = 'Falha de conexão com os servidores do Google. Verifique sua conexão com a internet.';
      } else if (err?.message) {
        errorMsg = err.message;
      }
      setLoginError(errorMsg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLoginRedirect = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await signInWithGoogleRedirect();
    } catch (err: any) {
      console.error("[Login Redirect] Erro ao redirecionar:", err);
      let errorMsg = 'Não foi possível autenticar via redirecionamento. Por favor, tente novamente.';
      if (err?.code === 'auth/unauthorized-domain') {
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
        errorMsg = `O domínio "${currentDomain}" não está autorizado no Firebase Authentication.`;
      } else if (err?.message) {
        errorMsg = err.message;
      }
      setLoginError(errorMsg);
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    // Ensure online network connectivity is maintained
    try {
      localStorage.removeItem('firestore_quota_exceeded');
    } catch (_) {}
  }, []);

  const [checkingConnection, setCheckingConnection] = useState(false);
  const [reconnectError, setReconnectError] = useState('');

  const handleTryReconnect = async () => {
    setCheckingConnection(true);
    setReconnectError('');
    try {
      // Enable network temporarily to test connection
      await enableNetwork(db);
      
      // Minimal test query to see if Firestore is reading/working or still blocked by Quota
      await getDocs(query(collection(db, 'audits_hand_hygiene'), fLimit(1)));
      
      // If successful, reset and reload
      localStorage.removeItem('firestore_quota_exceeded');
      setIsQuotaExceeded(false);
      window.location.reload();
    } catch (err: any) {
      try {
        await disableNetwork(db);
      } catch (_) {}

      if (err?.message && (err.message.includes('Quota') || err.message.includes('resource-exhausted') || err.message.includes('quota') || err.message.includes('limit') || err.message === 'quota-exceeded')) {
        console.warn("[App] Limite diário de cota do Firestore continua ativo.");
        setReconnectError('O limite de cota gratuito diário do Firestore ainda está em vigor. O sistema continua operando com 100% das funcionalidades em modo local.');
      } else {
        console.warn("[App] Reconexão encontrou status offline:", err?.message || err);
        localStorage.removeItem('firestore_quota_exceeded');
        setIsQuotaExceeded(false);
        window.location.reload();
      }
    } finally {
      setCheckingConnection(false);
    }
  };

  // Unified global filters
  const [selectedProfile, setSelectedProfile] = useState<'ADMINISTRADOR' | 'AUDITOR'>(() => {
    const saved = localStorage.getItem('selected_profile_role');
    return (saved === 'AUDITOR' || saved === 'ADMINISTRADOR') ? saved : 'ADMINISTRADOR';
  });

  const handleToggleProfile = (newProfile: 'ADMINISTRADOR' | 'AUDITOR') => {
    setSelectedProfile(newProfile);
    localStorage.setItem('selected_profile_role', newProfile);
    if (newProfile === 'ADMINISTRADOR' && view === 'coleta') {
      setView('dashboard');
    }
  };

  const [globalMonth, setGlobalMonth] = useState<string>('');
  const [globalQuarter, setGlobalQuarter] = useState<string>('');
  const [globalDay, setGlobalDay] = useState<string>('');
  const [globalUnit, setGlobalUnit] = useState<string>('');
  const [globalType, setGlobalType] = useState<string>('');
  const [globalTracer, setGlobalTracer] = useState<string>('');
  const [explorerFilter, setExplorerFilter] = useState<string>('');

  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [lastMonthPrompted, setLastMonthPrompted] = useState<string>('');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Open day selector pop-up whenever globalMonth changes to a non-empty value
  useEffect(() => {
    if (globalMonth !== '' && globalMonth !== lastMonthPrompted) {
      setIsDayModalOpen(true);
      setLastMonthPrompted(globalMonth);
    } else if (globalMonth === '') {
      setGlobalDay('');
      setLastMonthPrompted('');
    }
  }, [globalMonth, lastMonthPrompted]);

  // Support opening day filter selector from anywhere with standard dispatch
  useEffect(() => {
    const handleOpenDayModal = () => {
      if (globalMonth !== '') {
        setIsDayModalOpen(true);
      }
    };
    window.addEventListener('open-day-selector-modal', handleOpenDayModal);
    return () => {
      window.removeEventListener('open-day-selector-modal', handleOpenDayModal);
    };
  }, [globalMonth]);

  // UI state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isAuditorModalManualOpen, setIsAuditorModalManualOpen] = useState(false);

  const [dynamicAuditorUnit, setDynamicAuditorUnit] = useState<string | null>(() => {
    return localStorage.getItem('auditor_selected_unit') || null;
  });

  const { currentProfile, isAdmin, userUnit, isAuthorized, isMultiUnitAuditor } = useMemo(() => {
    if (!user || !user.email) return { currentProfile: 'AUDITOR' as const, isAdmin: false, userUnit: null, isAuthorized: false, isMultiUnitAuditor: false };
    
    const userEmail = user.email.trim().toLowerCase();
    const adminList = ADMIN_EMAILS.map(e => e.trim().toLowerCase());
    const isBaseAdmin = adminList.some(email => email === userEmail) || userEmail === 'getvb98@gmail.com';
    const isAuditorListed = AUTHORIZED_AUDITOR_EMAILS.some(email => email === userEmail);
    const isMultiUnit = MULTI_UNIT_AUDITOR_EMAILS.some(email => email === userEmail);
    
    const hasLocalProfile = !!localStorage.getItem(`auditor_profile_${user.uid}`);
    const authorized = isBaseAdmin || isAuditorListed || hasLocalProfile;
    
    const mappedUnit = Object.entries(USER_UNIT_MAPPING).find(
      ([email]) => email.trim().toLowerCase() === userEmail
    )?.[1] || null;

    let savedUnit: string | null = null;
    try {
      const p = localStorage.getItem(`auditor_profile_${user.uid}`);
      if (p) {
        const parsed = JSON.parse(p);
        if (parsed.defaultUnitId) savedUnit = parsed.defaultUnitId;
      }
    } catch (_) {}

    const effectiveUserUnit = mappedUnit || dynamicAuditorUnit || savedUnit || null;
    
    let profile: 'ADMINISTRADOR' | 'AUDITOR' = 'AUDITOR';
    if (isBaseAdmin) {
      if (userEmail === 'getvb98@gmail.com') {
        profile = selectedProfile;
      } else {
        profile = 'ADMINISTRADOR';
      }
    }
    
    return { 
      currentProfile: profile,
      isAdmin: profile === 'ADMINISTRADOR', 
      userUnit: effectiveUserUnit,
      isAuthorized: authorized,
      isMultiUnitAuditor: isMultiUnit
    };
  }, [user, selectedProfile, dynamicAuditorUnit]);

  const handleSaveAuditorUnit = async (unitId: string, auditorName: string) => {
    if (!user) return;
    setDynamicAuditorUnit(unitId);
    localStorage.setItem('auditor_selected_unit', unitId);
    
    const existingProfileStr = localStorage.getItem(`auditor_profile_${user.uid}`);
    let pObj = {
      name: auditorName,
      professionalCategory: 'Enfermeiro',
      registrationNumber: '',
      defaultUnitId: unitId
    };
    if (existingProfileStr) {
      try {
        pObj = { ...JSON.parse(existingProfileStr), name: auditorName, defaultUnitId: unitId };
      } catch (_) {}
    }
    localStorage.setItem(`auditor_profile_${user.uid}`, JSON.stringify(pObj));
    setIsAuditorModalManualOpen(false);

    try {
      const isQuotaExceededAtm = localStorage.getItem('firestore_quota_exceeded') === 'true';
      if (!isQuotaExceededAtm) {
        await setDoc(doc(db, 'auditors', user.uid), {
          ...pObj,
          email: user.email,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('Could not save auditor unit to Firestore:', e);
    }
  };

  const forceSync = async () => {
    if (autoSyncState === 'syncing') return;
    
    setAutoSyncState('syncing');
    console.log("[AutoSync] Forced manual refresh started...");

    const timeoutGuard = setTimeout(() => {
      setAutoSyncState(prev => prev === 'syncing' ? 'success' : prev);
      setTimeout(() => setAutoSyncState('idle'), 3000);
    }, 10000); // 10s maximum fallback guard
    
    try {
      // Reset local hash values to force sheet parsing
      localStorage.removeItem('last_hash_tracer_01');
      localStorage.removeItem('last_hash_tracer_02');
      localStorage.removeItem('last_hash_tracer_03');
      localStorage.removeItem('last_autosync_global');
      
      const results = await runAllSyncs('mai./2026');
      console.log("[AutoSync] Force sync results:", results);
      
      // Dispatch custom event to notify all components to re-read their data
      window.dispatchEvent(new Event('local-data-updated'));
      
      clearTimeout(timeoutGuard);
      setAutoSyncState('success');
      setTimeout(() => setAutoSyncState('idle'), 3500);
    } catch (err) {
      console.error("[AutoSync] Forced manual refresh failed:", err);
      clearTimeout(timeoutGuard);
      setAutoSyncState('error');
      setTimeout(() => setAutoSyncState('idle'), 3500);
    }
  };

  useEffect(() => {
    getRedirectResult(auth).then((cred) => {
      if (cred?.user) {
        setUser(cred.user);
        setLoading(false);
      }
    }).catch((err) => {
      console.warn("[Auth] Redirect result check:", err);
    });

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let lastSyncTime = 0;

    const runBackgroundSync = async (isManual = false) => {
      const now = Date.now();
      
      if (!isManual) {
        // Check local variable guard (60 seconds throttle for automatic background sync)
        if (now - lastSyncTime < 60 * 1000) {
          return;
        }
        
        const lastGlobal = localStorage.getItem('last_autosync_global');
        if (lastGlobal) {
          const lastTime = parseInt(lastGlobal, 10);
          if (now - lastTime < 60 * 1000) {
            return;
          }
        }
      }

      lastSyncTime = now;
      localStorage.setItem('last_autosync_global', now.toString());

      try {
        if (!isMounted) return;
        if (isManual) {
          setAutoSyncState('syncing');
        }
        await runAllSyncs('mai./2026');
        
        // Notify components of updated local values
        window.dispatchEvent(new Event('local-data-updated'));

        if (isMounted && isManual) {
          setAutoSyncState('success');
          setTimeout(() => {
            if (isMounted) setAutoSyncState('idle');
          }, 4000);
        }
      } catch (err) {
        console.error("[AutoSync] Background sync failed:", err);
        if (isMounted && isManual) {
          setAutoSyncState('error');
          setTimeout(() => {
            if (isMounted) setAutoSyncState('idle');
          }, 4000);
        }
      }
    };

    const timer = setTimeout(() => {
      runBackgroundSync(false);
    }, 2000);

    const interval = setInterval(() => {
      runBackgroundSync(false);
    }, 3 * 60 * 1000); // 3 minutes interval

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runBackgroundSync(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  // Enforce strict auditor confinement to their assigned unit & protect admin routes
  useEffect(() => {
    if (!isAdmin && userUnit) {
      setGlobalUnit(userUnit);
      if (view === 'schedules' || view === 'data_mgmt') {
        setView('dashboard');
      }
    }
  }, [isAdmin, userUnit, view]);

  // Information Architecture Metadata & Breadcrumbs
  const viewMetadata: Record<View, { section: string; title: string; subtitle: string }> = {
    dashboard: {
      section: 'Monitoramento & Análise',
      title: 'Visão Geral',
      subtitle: 'Painel executivo com metas assistenciais, aderência e indicadores consolidados'
    },
    indicators: {
      section: 'Monitoramento & Análise',
      title: 'Conformidade por Item',
      subtitle: 'Análise aprofundada dos itens auditados e conformidades por Tracer (T01, T02, T03)'
    },
    auditors: {
      section: 'Monitoramento & Análise',
      title: 'Participação de Auditores',
      subtitle: 'Volume de auditorias por profissional, distribuição e engajamento em campo'
    },
    explorer: {
      section: 'Registros & Auditorias',
      title: 'Explorador de Auditorias',
      subtitle: explorerFilter ? `Filtro ativo: ${explorerFilter}` : 'Consulta de registros brutos, filtros avançados e busca textual'
    },
    coleta: {
      section: 'Operação em Campo',
      title: 'Iniciar Tracer',
      subtitle: 'Instrumento digital para realização e envio de auditorias clínicas em tempo real'
    },
    schedules: {
      section: 'Gestão do Sistema',
      title: 'Sincronização & Fontes',
      subtitle: 'Status de conexão das planilhas Google Sheets e carga de dados em tempo real'
    },
    data_mgmt: {
      section: 'Gestão do Sistema',
      title: 'Gestão de Cadastros',
      subtitle: 'Manutenção de dados de apoio e auditorias'
    }
  };

  const currentViewMeta = viewMetadata[view] || viewMetadata.dashboard;

  const handleClearAllFilters = () => {
    setGlobalMonth('');
    setGlobalQuarter('');
    setGlobalDay('');
    setGlobalUnit(!isAdmin && userUnit ? userUnit : '');
    setGlobalType('');
    setGlobalTracer('');
    setExplorerFilter('');
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (globalMonth !== '') count++;
    if (globalQuarter !== '') count++;
    if (globalDay !== '') count++;
    if (isAdmin && globalUnit !== '') count++;
    if (globalTracer !== '') count++;
    if (explorerFilter !== '') count++;
    return count;
  }, [globalMonth, globalQuarter, globalDay, globalUnit, globalTracer, explorerFilter, isAdmin]);

  const isFilterActive = activeFiltersCount > 0;

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-50">
        <Activity className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div 
        className="min-h-screen w-full relative flex flex-col items-center justify-center p-4 overflow-hidden bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${loginBg})` }}
      >
        {/* Immersive background image overlay for absolute positioning and visual crispness */}
        <img 
          src={loginBg} 
          alt="Recife Prefeitura Wave Background" 
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none z-0 opacity-100"
        />

        {/* Floating Glassmorphism Login Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', duration: 0.55 }}
          className="max-w-md w-full bg-white/95 backdrop-blur-md p-8 rounded-3xl shadow-2xl shadow-blue-950/40 border border-white/25 relative z-10 flex flex-col items-center"
        >
          {/* Official Recife Cuida Mais / SESAU presentation logo block */}
          <div className="w-full flex flex-col items-center mb-6 select-none">
            
            {/* Main Logo and Branding Row */}
            <div className="flex items-center gap-3.5 justify-center">
              
              {/* High-fidelity Vector Representation of the Recife Cuida Mais emblem */}
              <svg className="w-14 h-14 filter drop-shadow-sm shrink-0" viewBox="0 0 100 100" fill="none">
                <defs>
                  {/* Linear Gradient for Cross (Green/Yellow-Green) */}
                  <linearGradient id="crossGrad" x1="10" y1="50" x2="60" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#4ADE80" /> {/* vibrant light green */}
                    <stop offset="50%" stopColor="#A3E635" /> {/* yellow green */}
                    <stop offset="100%" stopColor="#EAB308" /> {/* amber yellow */}
                  </linearGradient>
                  
                  {/* Linear Gradient for Heart (Yellow/Orange/Red) */}
                  <linearGradient id="heartGrad" x1="40" y1="70" x2="90" y2="30" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#EAB308" />
                    <stop offset="50%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#EA580C" />
                  </linearGradient>
                </defs>

                {/* Styled medical cross interlocking with heart */}
                <path 
                  d="M 32 15 
                     C 32 10, 42 10, 42 15 
                     L 42 30 
                     L 57 30 
                     C 62 30, 62 40, 57 40 
                     L 42 40 
                     L 42 55 
                     C 42 60, 32 60, 32 55 
                     L 32 40 
                     L 17 40 
                     C 12 40, 12 30, 17 30 
                     L 32 30 
                     Z" 
                  fill="url(#crossGrad)" 
                />

                {/* Outer stylized looping heart wave in gradient */}
                <path 
                  d="M 40 35 
                     C 48 18, 65 12, 75 25 
                     C 85 12, 98 18, 95 38 
                     C 90 58, 68 75, 52 88 
                     C 36 75, 28 62, 30 48" 
                  stroke="url(#heartGrad)" 
                  strokeWidth="6" 
                  strokeLinecap="round"
                  strokeLinejoin="round" 
                  fill="none"
                />

                {/* Linking ribbon curve details */}
                <path 
                  d="M 52 88 C 36 75, 28 62, 30 48" 
                  stroke="#4ADE80" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                  fill="none" 
                />
              </svg>

              {/* Side Text Typography styling for the branding */}
              <div className="flex flex-col text-left leading-none font-sans">
                <span className="text-[17px] font-black tracking-tight text-slate-800 uppercase leading-none">RECIFE</span>
                <span className="text-[15px] font-black tracking-tighter text-[#EA580C] uppercase leading-none mt-0.5">CUIDA</span>
                <span className="text-[14px] font-extrabold tracking-tight text-emerald-600 italic lowercase leading-none ml-1">mais</span>
              </div>
            </div>

            {/* Partner badges row (SUS | Secretaria de Saúde | Recife Prefeitura) */}
            <div className="w-full border-t border-slate-200/70 pt-3 mt-4 flex items-center justify-between px-2 gap-2 text-slate-600">
              
              {/* SUS */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="w-4 h-4 bg-[#1E3A8A] rounded-full flex items-center justify-center p-0.5 shrink-0 shadow-sm">
                  <span className="text-[7px] text-white font-extrabold leading-none">SUS</span>
                </div>
                <span className="text-[9px] font-black tracking-wider text-slate-700">SUS</span>
              </div>

              <div className="h-4 w-px bg-slate-300" />

              {/* Secretaria de Saúde */}
              <div className="text-left leading-none shrink-0">
                <p className="text-[6px] font-bold text-slate-500 uppercase tracking-tighter">Secretaria de</p>
                <p className="text-[9px] font-black text-slate-700 tracking-wider uppercase">Saúde</p>
              </div>

              <div className="h-4 w-px bg-slate-300" />

              {/* Recife Prefeitura Crest Header */}
              <div className="flex items-center gap-1.5 shrink-0">
                <svg className="w-3.5 h-3.5 text-[#1E3A8A] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L3 7v9c0 5.5 4.5 10 9 10s9-4.5 9-10V7l-9-5z" />
                  <path d="M12 6v12M8 10h8" />
                </svg>
                <div className="flex flex-col text-left leading-none">
                  <span className="text-[9px] font-black text-slate-700 tracking-tight leading-none uppercase">RECIFE</span>
                  <span className="text-[5.5px] font-black text-slate-500 tracking-widest leading-none uppercase mt-0.5">PREFEITURA</span>
                </div>
              </div>

            </div>
          </div>
          
          <div className="text-center space-y-1 mb-8">
            <h1 className="text-xs font-black text-slate-400 uppercase tracking-widest">Painel Municipal</h1>
            <p className="text-2xl font-black text-slate-800 tracking-tight">Monitoramento Tracer</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Qualidade e Segurança Assistencial</p>
            
            <div className="flex items-center justify-center gap-2 pt-3">
              <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider">Secretaria de Saúde</span>
              <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider">Recife</span>
            </div>
          </div>

          {loginError && (
            <div className="w-full mb-6 p-4 bg-red-50/95 border border-red-200 rounded-2xl flex flex-col gap-3 text-left shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-red-900 leading-tight">
                    {loginError}
                  </p>
                </div>
              </div>

              {/* Action buttons to resolve popup issues */}
              <div className="flex flex-col gap-2 pt-2 border-t border-red-200/60">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    Tentar Novamente (Pop-up)
                  </button>

                  <button
                    type="button"
                    onClick={handleGoogleLoginRedirect}
                    disabled={isLoggingIn}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    Entrar por Redirecionamento
                  </button>
                </div>

                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-red-800 hover:text-red-950 flex items-center gap-1.5 underline cursor-pointer mt-1"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-red-600" />
                  Abrir sistema diretamente em nova aba do navegador
                </a>
              </div>
            </div>
          )}

          <div className="w-full space-y-3">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed text-white py-4 px-4 rounded-2xl font-extrabold uppercase tracking-wider text-[10px] transition-all duration-200 shadow-lg shadow-slate-900/10 border border-slate-950 cursor-pointer"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  Autenticando...
                </>
              ) : (
                <>
                  <UserCircle className="w-5 h-5 text-blue-400" />
                  Acessar com Google
                </>
              )}
            </button>

            {/* Alternative redirect flow when popups are troublesome */}
            <button
              type="button"
              onClick={handleGoogleLoginRedirect}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
            >
              <span>Problemas com a janela pop-up?</span>
              <span className="text-blue-600 underline font-extrabold">Entrar por redirecionamento</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 1.5 Access Gate: Only authorized auditors and administrators can proceed
  if (user && !isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-5 border border-slate-200 text-left">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200 shadow-2xs">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-1 text-center">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Acesso Restrito</span>
            <h2 className="text-lg font-black uppercase text-slate-900 tracking-tight">E-mail Não Autorizado</h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-center">
            A conta <strong className="text-slate-900 font-mono">{user.email}</strong> não consta na lista de auditores ou administradores autorizados do <strong>Monitora Tracer</strong>.
          </p>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1.5">
            <p className="font-bold text-slate-800 uppercase text-[10px]">Unidades Atendidas na Rede Recife:</p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Hospital Helena Moura, Maria Cravo Gama, Barros Lima, Arnaldo Marques, Bandeira Filho, Amaury Coutinho e Agamenon Magalhães.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => logout()}
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
            >
              Trocar de Conta / Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans selection:bg-blue-100 selection:text-blue-900">
      
      {/* 1. LEFT SIDEBAR - Desktop (Grouped by Information Architecture) */}
      <aside className="w-64 bg-[#0a0b9e] text-white shrink-0 hidden lg:flex flex-col border-r border-white/10 relative z-20">
        
        {/* Brand Header */}
        <div className="p-5 border-b border-white/10 flex flex-col gap-4">
          {/* Official Recife Cuida Mais / SESAU presentation logo block */}
          <div className="w-full flex flex-col items-center select-none">
            
            {/* Main Logo and Branding Row */}
            <div className="flex items-center gap-3 justify-center">
              
              {/* High-fidelity Vector Representation of the Recife Cuida Mais emblem */}
              <svg className="w-12 h-12 filter drop-shadow-sm shrink-0" viewBox="0 0 100 100" fill="none">
                <defs>
                  {/* Linear Gradient for Cross (Green/Yellow-Green) */}
                  <linearGradient id="sidebarCrossGrad" x1="10" y1="50" x2="60" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#4ADE80" />
                    <stop offset="50%" stopColor="#A3E635" />
                    <stop offset="100%" stopColor="#EAB308" />
                  </linearGradient>
                  
                  {/* Linear Gradient for Heart (Yellow/Orange/Red) */}
                  <linearGradient id="sidebarHeartGrad" x1="40" y1="70" x2="90" y2="30" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#EAB308" />
                    <stop offset="50%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#EA580C" />
                  </linearGradient>
                </defs>

                {/* Styled medical cross interlocking with heart */}
                <path 
                  d="M 32 15 
                     C 32 10, 42 10, 42 15 
                     L 42 30 
                     L 57 30 
                     C 62 30, 62 40, 57 40 
                     L 42 40 
                     L 42 55 
                     C 42 60, 32 60, 32 55 
                     L 32 40 
                     L 17 40 
                     C 12 40, 12 30, 17 30 
                     L 32 30 
                     Z" 
                  fill="url(#sidebarCrossGrad)" 
                />

                {/* Outer stylized looping heart wave in gradient */}
                <path 
                  d="M 40 35 
                     C 48 18, 65 12, 75 25 
                     C 85 12, 98 18, 95 38 
                     C 90 58, 68 75, 52 88 
                     C 36 75, 28 62, 30 48" 
                  stroke="url(#sidebarHeartGrad)" 
                  strokeWidth="6" 
                  strokeLinecap="round"
                  strokeLinejoin="round" 
                  fill="none"
                />

                {/* Linking ribbon curve details */}
                <path 
                  d="M 52 88 C 36 75, 28 62, 30 48" 
                  stroke="#4ADE80" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                  fill="none" 
                />
              </svg>

              {/* Side Text Typography styling for the branding */}
              <div className="flex flex-col text-left leading-none font-sans">
                <span className="text-[15px] font-black tracking-tight text-white uppercase leading-none">RECIFE</span>
                <span className="text-[13px] font-black tracking-tighter text-amber-300 uppercase leading-none mt-0.5">CUIDA</span>
                <span className="text-[12px] font-extrabold tracking-tight text-emerald-400 italic lowercase leading-none ml-1">mais</span>
              </div>
            </div>

            {/* Partner badges row (SUS | Secretaria de Saúde | Recife Prefeitura) */}
            <div className="w-full border-t border-white/10 pt-3 mt-3 flex items-center justify-between px-1 gap-1.5 text-blue-200">
              
              {/* SUS */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="w-3.5 h-3.5 bg-white text-[#0a0b9e] rounded-full flex items-center justify-center p-0.5 shrink-0 shadow-sm">
                  <span className="text-[6px] font-extrabold leading-none">SUS</span>
                </div>
                <span className="text-[8px] font-black tracking-wider text-white">SUS</span>
              </div>

              <div className="h-3.5 w-px bg-white/10" />

              {/* Secretaria de Saúde */}
              <div className="text-left leading-none shrink-0">
                <p className="text-[5.5px] font-bold text-blue-200/70 uppercase tracking-tighter">Secretaria de</p>
                <p className="text-[8px] font-black text-white tracking-wider uppercase">Saúde</p>
              </div>

              <div className="h-3.5 w-px bg-white/10" />

              {/* Recife Prefeitura Crest Header */}
              <div className="flex items-center gap-1 shrink-0">
                <svg className="w-3 h-3 text-blue-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L3 7v9c0 5.5 4.5 10 9 10s9-4.5 9-10V7l-9-5z" />
                  <path d="M12 6v12M8 10h8" />
                </svg>
                <div className="flex flex-col text-left leading-none">
                  <span className="text-[8px] font-black text-white tracking-tight leading-none uppercase">RECIFE</span>
                  <span className="text-[5px] font-black text-blue-200/70 tracking-widest leading-none uppercase mt-0.5">PREFEITURA</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Sidebar Nav Items Structured in Semantic Categories */}
        <nav className="flex-grow px-3 py-4 space-y-4 overflow-y-auto scrollbar-hide text-left">
          
          {/* Categoria 1: Operações em Campo (Disponível apenas para perfil AUDITOR) */}
          {!isAdmin && (
            <div className="space-y-1">
              <div className="px-3 pb-1 text-[8px] font-black tracking-widest text-emerald-300 uppercase select-none flex items-center gap-1.5">
                <ClipboardCheck className="w-3 h-3 text-emerald-300" />
                <span>Operações em Campo</span>
              </div>
              <SidebarButton 
                active={view === 'coleta'} 
                onClick={() => { setView('coleta'); setExplorerFilter(''); }}
                icon={<ClipboardCheck className="w-4 h-4" />}
                label="INICIAR TRACER"
                isAction
              />
              <SidebarButton 
                active={false} 
                onClick={() => setIsWebhookModalOpen(true)}
                icon={<FileSpreadsheet className="w-4 h-4 text-emerald-300" />}
                label="Planilha Destino"
                badge={pendingQueueCount > 0 ? `${pendingQueueCount}` : undefined}
              />
            </div>
          )}

          {/* Categoria 2: Monitoramento & Análise */}
          <div className="space-y-1 pt-1 border-t border-white/5">
            <div className="px-3 pb-1 text-[8px] font-black tracking-widest text-blue-200/60 uppercase select-none flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-blue-300" />
              <span>Monitoramento</span>
            </div>
            <SidebarButton 
              active={view === 'dashboard'} 
              onClick={() => { setView('dashboard'); setExplorerFilter(''); }}
              icon={<LayoutDashboard className="w-4 h-4" />}
              label="Visão Geral"
            />
            <SidebarButton 
              active={view === 'indicators'} 
              onClick={() => { setView('indicators'); setExplorerFilter(''); }}
              icon={<Layers className="w-4 h-4" />}
              label="Conformidade por Item"
            />
            <SidebarButton 
              active={view === 'auditors'} 
              onClick={() => { setView('auditors'); setExplorerFilter(''); }}
              icon={<Users className="w-4 h-4" />}
              label="Participação de Auditores"
            />
          </div>

          {/* Categoria 3: Registros & Auditorias */}
          <div className="space-y-1 pt-1 border-t border-white/5">
            <div className="px-3 pb-1 text-[8px] font-black tracking-widest text-blue-200/60 uppercase select-none flex items-center gap-1.5">
              <ClipboardList className="w-3 h-3 text-blue-300" />
              <span>Registros</span>
            </div>
            <SidebarButton 
              active={view === 'explorer'} 
              onClick={() => { setView('explorer'); setExplorerFilter(''); }}
              icon={<ClipboardList className="w-4 h-4" />}
              label="Explorador de Auditorias"
            />
          </div>

          {/* Categoria 4: Gestão do Sistema */}
          <div className="space-y-1 pt-1 border-t border-white/5">
            <div className="px-3 pb-1 text-[8px] font-black tracking-widest text-blue-200/60 uppercase select-none flex items-center gap-1.5">
              <Database className="w-3 h-3 text-blue-300" />
              <span>{isAdmin ? 'Gestão do Sistema' : 'Suporte & Ajuda'}</span>
            </div>
            {isAdmin && (
              <SidebarButton 
                active={view === 'schedules'} 
                onClick={() => { setView('schedules'); setExplorerFilter(''); }}
                icon={<RefreshCw className="w-4 h-4" />}
                label="Sincronização & Fontes"
              />
            )}
            <SidebarButton 
              active={false} 
              onClick={() => setIsGuideModalOpen(true)}
              icon={<BookOpen className="w-4 h-4 text-blue-300" />}
              label="Manual do Sistema"
            />
            <SidebarButton 
              active={false} 
              onClick={() => setIsWebhookModalOpen(true)}
              icon={<FileSpreadsheet className="w-4 h-4 text-emerald-300" />}
              label="Planilha Destino (Sheets)"
              badge={pendingQueueCount > 0 ? `${pendingQueueCount}` : undefined}
            />
            {isAdmin && (
              <SidebarButton 
                active={view === 'data_mgmt'} 
                onClick={() => { setView('data_mgmt'); setExplorerFilter(''); }}
                icon={<FolderLock className="w-4 h-4" />}
                label="Gestão de Cadastros"
              />
            )}
          </div>

        </nav>

        {/* Clear Filters Action */}
        <div className="p-4 border-t border-white/10 space-y-2">
          {isFilterActive && (
            <button 
              onClick={handleClearAllFilters}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm shadow-amber-500/10"
            >
              <X className="w-3.5 h-3.5" />
              Limpar {activeFiltersCount} filtro{activeFiltersCount > 1 ? 's' : ''}
            </button>
          )}

          <div className="py-1 text-center text-[8px] font-bold text-white/40 uppercase tracking-widest select-none">
            Painel Tracer • Arquitetura v2.1
          </div>
        </div>
      </aside>

      {/* 2. MOBILE SIDEBAR DRAWER */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black z-30 lg:hidden"
            />
            {/* Drawer */}
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed top-0 bottom-0 left-0 w-64 bg-[#0a0b9e] text-white z-40 lg:hidden flex flex-col border-r border-white/10"
            >
              <div className="p-5 border-b border-white/10 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 select-none">
                    <svg className="w-10 h-10 filter drop-shadow-sm shrink-0" viewBox="0 0 100 100" fill="none">
                      <rect x="32" y="15" width="10" height="30" rx="3" fill="#A3E635" />
                      <rect x="17" y="30" width="30" height="10" rx="3" fill="#A3E635" />
                      <path d="M 40 35 C 48 18, 65 12, 75 25 C 85 12, 98 18, 95 38 C 90 58, 68 75, 52 88 C 36 75, 28 62, 30 48" stroke="#F97316" strokeWidth="5" fill="none" />
                    </svg>
                    <div className="flex flex-col text-left leading-none font-sans">
                      <span className="text-[13px] font-black tracking-tight text-white uppercase">RECIFE</span>
                      <span className="text-[12px] font-black tracking-tight text-amber-300 uppercase mt-0.5">CUIDA</span>
                      <span className="text-[11px] font-bold text-emerald-400 italic lowercase ml-0.5">mais</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setMobileSidebarOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-white/15"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>

                {/* Sub-logos in mobile */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 opacity-90 text-[8px] font-black tracking-wider text-blue-200">
                  <span className="bg-white/10 text-white px-1.5 py-0.5 rounded">SUS</span>
                  <span className="opacity-70 leading-none">Secr. de Saúde</span>
                  <span className="border border-white/20 px-1 py-0.5 rounded leading-none text-white/90">RECIFE</span>
                </div>
              </div>

              {/* Navigation in Mobile Drawer */}
              <nav className="flex-grow px-3 py-4 space-y-4 overflow-y-auto">
                {!isAdmin && (
                  <div className="space-y-1">
                    <div className="px-3 pb-1 text-[8px] font-black tracking-widest text-emerald-300 uppercase select-none flex items-center gap-1.5">
                      <ClipboardCheck className="w-3 h-3 text-emerald-300" />
                      <span>Operações em Campo</span>
                    </div>
                    <SidebarButton 
                      active={view === 'coleta'} 
                      onClick={() => { setView('coleta'); setExplorerFilter(''); setMobileSidebarOpen(false); }}
                      icon={<ClipboardCheck className="w-4 h-4" />}
                      label="INICIAR TRACER"
                      isAction
                    />
                    <SidebarButton 
                      active={false} 
                      onClick={() => { setIsWebhookModalOpen(true); setMobileSidebarOpen(false); }}
                      icon={<FileSpreadsheet className="w-4 h-4 text-emerald-300" />}
                      label="Planilha Destino"
                      badge={pendingQueueCount > 0 ? `${pendingQueueCount}` : undefined}
                    />
                  </div>
                )}

                <div className="space-y-1 pt-1 border-t border-white/5">
                  <div className="px-3 pb-1 text-[8px] font-black tracking-widest text-blue-200/60 uppercase select-none">
                    Monitoramento
                  </div>
                  <SidebarButton 
                    active={view === 'dashboard'} 
                    onClick={() => { setView('dashboard'); setExplorerFilter(''); setMobileSidebarOpen(false); }}
                    icon={<LayoutDashboard className="w-4 h-4" />}
                    label="Visão Geral"
                  />
                  <SidebarButton 
                    active={view === 'indicators'} 
                    onClick={() => { setView('indicators'); setExplorerFilter(''); setMobileSidebarOpen(false); }}
                    icon={<Layers className="w-4 h-4" />}
                    label="Conformidade por Item"
                  />
                  <SidebarButton 
                    active={view === 'auditors'} 
                    onClick={() => { setView('auditors'); setExplorerFilter(''); setMobileSidebarOpen(false); }}
                    icon={<Users className="w-4 h-4" />}
                    label="Participação de Auditores"
                  />
                </div>

                <div className="space-y-1 pt-1 border-t border-white/5">
                  <div className="px-3 pb-1 text-[8px] font-black tracking-widest text-blue-200/60 uppercase select-none">
                    Registros
                  </div>
                  <SidebarButton 
                    active={view === 'explorer'} 
                    onClick={() => { setView('explorer'); setExplorerFilter(''); setMobileSidebarOpen(false); }}
                    icon={<ClipboardList className="w-4 h-4" />}
                    label="Explorador de Auditorias"
                  />
                </div>

                <div className="space-y-1 pt-1 border-t border-white/5">
                  <div className="px-3 pb-1 text-[8px] font-black tracking-widest text-blue-200/60 uppercase select-none">
                    {isAdmin ? 'Gestão' : 'Suporte'}
                  </div>
                  {isAdmin && (
                    <SidebarButton 
                      active={view === 'schedules'} 
                      onClick={() => { setView('schedules'); setExplorerFilter(''); setMobileSidebarOpen(false); }}
                      icon={<RefreshCw className="w-4 h-4" />}
                      label="Sincronização & Fontes"
                    />
                  )}
                  <SidebarButton 
                    active={false} 
                    onClick={() => { setIsGuideModalOpen(true); setMobileSidebarOpen(false); }}
                    icon={<BookOpen className="w-4 h-4 text-blue-300" />}
                    label="Manual do Sistema"
                  />
                  {isAdmin && (
                    <SidebarButton 
                      active={view === 'data_mgmt'} 
                      onClick={() => { setView('data_mgmt'); setExplorerFilter(''); setMobileSidebarOpen(false); }}
                      icon={<FolderLock className="w-4 h-4" />}
                      label="Gestão de Cadastros"
                    />
                  )}
                </div>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 3. RIGHT CONTENT AREA */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        
        {/* Main Top Header Bar (Hierarchical Navigation + Grouped Filters) */}
        <header className="min-h-[76px] py-2 px-4 md:px-8 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between shrink-0 relative z-30 gap-3">
          
          {/* Breadcrumb & Section Hierarchy */}
          <div className="flex items-center gap-3">
            {/* Hamburger Button for Mobile */}
            <button 
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 -ml-2 rounded-xl text-slate-500 hover:bg-slate-100 flex lg:hidden cursor-pointer"
              aria-label="Abrir menu lateral"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Header Title & Subtitle */}
            <div className="text-left">
              <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight leading-tight">{currentViewMeta.title}</h1>
              <p className="text-[10px] text-slate-400 font-bold hidden sm:block leading-none mt-0.5">{currentViewMeta.subtitle}</p>
            </div>
          </div>

          {/* Header Right Area: Three Buttons on top, Filters underneath below the three buttons */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            
            {/* Top Row: The Three Action Buttons (Guia Docs, Sincronizar, User Profile/Administrador) */}
            <div className="flex items-center gap-2 md:gap-2.5">
              
              {/* Mobile Filter Toggle Button */}
              <button 
                onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
                className={`xl:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                  isFilterActive 
                    ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filtros</span>
                {isFilterActive && (
                  <span className="bg-slate-950 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px]">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Botão 1: Manual do Sistema */}
              <button 
                onClick={() => setIsGuideModalOpen(true)}
                className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl px-3 py-1.5 cursor-pointer transition-all active:scale-95 shadow-2xs select-none"
                title="Abrir Manual do Sistema e Exportar para o Google Docs"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[9px] font-black uppercase tracking-wider hidden sm:inline-block">Manual do Sistema</span>
              </button>

              {/* Botão 2: Sincronizar em Tempo Real */}
              <button 
                onClick={forceSync}
                disabled={autoSyncState === 'syncing'}
                className="flex items-center gap-1.5 bg-[#ef5d00] hover:bg-[#d65300] text-white disabled:opacity-50 border border-[#b24500] rounded-xl px-3 py-1.5 cursor-pointer transition-all active:scale-95 shadow-sm select-none"
                title="Forçar atualização e sincronizar planilhas em tempo real"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${autoSyncState === 'syncing' ? 'animate-spin' : ''}`} />
                <span className="text-[9px] font-black uppercase tracking-wider hidden sm:inline-block">Sincronizar</span>
              </button>

              {/* Botão 3: Perfil do Usuário / Administrador */}
              <div className="relative">
                <button 
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 p-1 px-2.5 rounded-xl bg-white hover:bg-slate-50 transition-all border border-slate-200/80 shadow-2xs hover:border-slate-300 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 shadow-inner">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-blue-500" />
                    )}
                  </div>
                  <div className="text-left hidden md:block">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] font-extrabold text-slate-800 leading-none">
                        Olá, {user.displayName?.split(' ')[0] || (user.email?.toLowerCase().includes('getvb98') ? 'Getúlio' : 'Gestor')}
                      </p>
                      <span className="text-[9px] font-bold text-slate-400">
                        {user.displayName || (user.email?.toLowerCase().includes('getvb98') ? 'Getúlio V Batista' : '')}
                      </span>
                    </div>
                    <div className="mt-0.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                        currentProfile === 'ADMINISTRADOR' 
                          ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {currentProfile === 'ADMINISTRADOR' ? 'Administrador' : 'Auditor'}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {userDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px] cursor-default" 
                        onClick={() => setUserDropdownOpen(false)} 
                      />
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.96, y: 4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 4 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl shadow-slate-900/25 border border-slate-200/90 p-2 z-50 space-y-1.5 ring-1 ring-black/5"
                      >
                        <div className="px-3 py-2.5 border-b border-slate-100 text-left bg-slate-50/60 rounded-t-lg">
                          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                            Olá, {user.displayName?.split(' ')[0] || (user.email?.toLowerCase().includes('getvb98') ? 'Getúlio' : 'Gestor')}
                          </p>
                          <p className="text-[11px] font-black text-slate-900 leading-tight mt-0.5">
                            {user.displayName || (user.email?.toLowerCase().includes('getvb98') ? 'Getúlio V Batista' : 'Usuário')}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                              currentProfile === 'ADMINISTRADOR' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-emerald-600 text-white'
                            }`}>
                              {currentProfile === 'ADMINISTRADOR' ? 'Administrador' : 'Auditor'}
                            </span>
                            <p className="text-[8px] font-semibold text-slate-400 font-mono tracking-tighter truncate max-w-[120px]">{user.email}</p>
                          </div>
                        </div>

                      {user.email?.toLowerCase().trim() === 'getvb98@gmail.com' && (
                        <div className="px-3 py-2 border-b border-slate-100 space-y-1.5">
                          <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Alternar Perfil</p>
                          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button
                              onClick={() => handleToggleProfile('ADMINISTRADOR')}
                              className={`flex-1 text-[8px] font-black uppercase tracking-wider py-1 rounded-md transition-all cursor-pointer ${
                                currentProfile === 'ADMINISTRADOR' 
                                ? 'bg-white text-slate-900 shadow-xs' 
                                : 'text-slate-500 hover:text-slate-850'
                              }`}
                            >
                              Admin
                            </button>
                            <button
                              onClick={() => handleToggleProfile('AUDITOR')}
                              className={`flex-1 text-[8px] font-black uppercase tracking-wider py-1 rounded-md transition-all cursor-pointer ${
                                currentProfile === 'AUDITOR' 
                                ? 'bg-white text-slate-900 shadow-xs' 
                                : 'text-slate-500 hover:text-slate-850'
                              }`}
                            >
                              Auditor
                            </button>
                          </div>
                        </div>
                      )}

                      {currentProfile === 'AUDITOR' && (
                        <>
                          <button 
                            onClick={() => {
                              setUserDropdownOpen(false);
                              setView('coleta');
                            }}
                            className="w-full px-3 py-2 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-[10px] font-extrabold uppercase tracking-wide rounded-lg text-left flex items-center gap-2 cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4 text-slate-400" />
                            Perfil & INICIAR TRACER
                          </button>
                          <button 
                            onClick={() => {
                              setUserDropdownOpen(false);
                              setIsWebhookModalOpen(true);
                            }}
                            className="w-full px-3 py-2 hover:bg-emerald-50 text-emerald-800 hover:text-emerald-950 text-[10px] font-extrabold uppercase tracking-wide rounded-lg text-left flex items-center justify-between cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                              Planilha Destino (Google Sheets)
                            </span>
                            {pendingQueueCount > 0 && (
                              <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded-full text-[8px] font-black">
                                {pendingQueueCount}
                              </span>
                            )}
                          </button>
                          <button 
                            onClick={() => {
                              setUserDropdownOpen(false);
                              setIsAuditorModalManualOpen(true);
                            }}
                            className="w-full px-3 py-2 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-[10px] font-extrabold uppercase tracking-wide rounded-lg text-left flex items-center gap-2 cursor-pointer"
                          >
                            <Building2 className="w-4 h-4 text-slate-400" />
                            Vincular / Alterar Unidade
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => {
                          setUserDropdownOpen(false);
                          setView('explorer');
                        }}
                        className="w-full px-3 py-2 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-[10px] font-extrabold uppercase tracking-wide rounded-lg text-left flex items-center gap-2 cursor-pointer"
                      >
                        <ClipboardList className="w-4 h-4 text-slate-400" />
                        Minhas Auditorias
                      </button>
                      <button 
                        onClick={() => {
                          setUserDropdownOpen(false);
                          setIsGuideModalOpen(true);
                        }}
                        className="w-full px-3 py-2 hover:bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase tracking-wide rounded-lg text-left flex items-center gap-2 cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4 text-blue-600" />
                        Manual do Sistema
                      </button>
                      <button 
                        onClick={() => {
                          setUserDropdownOpen(false);
                          logout();
                        }}
                        className="w-full px-3 py-2 hover:bg-red-50 text-red-600 font-extrabold uppercase tracking-wide text-[10px] rounded-lg text-left flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        Sair do Painel
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* Bottom Row: Os Filtros ficam ABAIXO dos três botões */}
          <div className="hidden xl:flex items-center gap-2.5 bg-slate-50/80 p-1.5 rounded-2xl border border-slate-200/60 shadow-xs">
            
            {/* Group A: Temporal (Mês, Trimestre, Dia) */}
            <div className="flex items-center gap-1.5 bg-white rounded-xl px-2.5 py-1.5 border border-slate-200/80 shadow-2xs">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              
              {/* Mês */}
              <select 
                value={globalMonth}
                onChange={(e) => {
                  setGlobalMonth(e.target.value);
                  if (e.target.value !== '') {
                    setGlobalQuarter('');
                  }
                }}
                className="bg-transparent text-[10px] font-black uppercase text-slate-700 outline-none cursor-pointer pr-1"
                aria-label="Filtro de Mês"
              >
                <option value="">Mês</option>
                {MONTH_NAMES.map((m, idx) => (
                  <option key={idx} value={String(idx)}>{m}</option>
                ))}
              </select>

              <span className="text-slate-200">|</span>

              {/* Trimestre */}
              <select 
                value={globalQuarter}
                onChange={(e) => {
                  setGlobalQuarter(e.target.value);
                  if (e.target.value !== '') {
                    setGlobalMonth('');
                    setGlobalDay('');
                  }
                }}
                className="bg-transparent text-[10px] font-black uppercase text-slate-700 outline-none cursor-pointer pr-1"
                aria-label="Filtro de Trimestre"
              >
                <option value="">Trimestre</option>
                <option value="1">1º Trim.</option>
                <option value="2">2º Trim.</option>
                <option value="3">3º Trim.</option>
                <option value="4">4º Trim.</option>
              </select>

              {/* Dia (se mês ativo) */}
              {globalMonth !== '' && (
                <button 
                  onClick={() => setIsDayModalOpen(true)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer ${
                    globalDay !== '' 
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                  title="Filtrar por dia do mês"
                >
                  <SlidersHorizontal className="w-2.5 h-2.5" />
                  <span>{globalDay !== '' ? `Dia ${globalDay}` : 'Dia'}</span>
                  {globalDay !== '' && (
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        setGlobalDay('');
                      }}
                      className="hover:text-red-500 ml-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Group B: Contextual (Unidade, Tracer) */}
            <div className="flex items-center gap-1.5 bg-white rounded-xl px-2.5 py-1.5 border border-slate-200/80 shadow-2xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              
              {/* Unidade de Saúde */}
              <select 
                value={isAdmin || isMultiUnitAuditor ? globalUnit : (userUnit || '')}
                onChange={(e) => (isAdmin || isMultiUnitAuditor) && setGlobalUnit(e.target.value)}
                disabled={!isAdmin && !isMultiUnitAuditor && !!userUnit}
                className={`bg-transparent text-[10px] font-black uppercase outline-none pr-1 max-w-[140px] truncate ${
                  !isAdmin && !isMultiUnitAuditor ? 'cursor-not-allowed opacity-95 text-blue-900 font-extrabold' : 'cursor-pointer text-slate-700'
                }`}
                aria-label="Filtro de Unidade de Saúde"
                title={!isAdmin && !isMultiUnitAuditor ? 'Sua unidade vinculada de auditoria' : 'Filtro de unidade de saúde'}
              >
                {(isAdmin || isMultiUnitAuditor) && <option value="">Todas Unidades</option>}
                {HEALTH_UNITS.filter(u => isAdmin || isMultiUnitAuditor || !userUnit || u.id === userUnit).map(u => (
                  <option key={u.id} value={u.id}>{u.name.replace('Hospital de Pediatria ', '').replace('Policlínica e Maternidade ', '')}</option>
                ))}
              </select>

              <span className="text-slate-200">|</span>

              {/* Tracer */}
              <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select 
                value={globalTracer}
                onChange={(e) => setGlobalTracer(e.target.value)}
                className="bg-transparent text-[10px] font-black uppercase text-slate-700 outline-none cursor-pointer pr-1 max-w-[110px]"
                aria-label="Filtro de Tracer"
              >
                <option value="">Todos Tracers</option>
                <option value="T01">T01 - Beira Leito</option>
                <option value="T02">T02 - Proc. Cirúrgicos</option>
                <option value="T03">T03 - Proc. Medicação</option>
              </select>
              {globalTracer !== '' && (
                <button
                  onClick={() => setGlobalTracer('')}
                  className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="Limpar tracer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Active Filters Badge & Quick Reset */}
            {isFilterActive && (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-2.5 py-1 text-[9px] font-black uppercase">
                <span>{activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}</span>
                <button 
                  onClick={handleClearAllFilters} 
                  className="p-0.5 hover:bg-amber-200 rounded text-amber-700 cursor-pointer"
                  title="Limpar todos os filtros"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

          </div>

        </div>
      </header>

        {/* Collapsible Mobile Filter Bar */}
        <AnimatePresence>
          {isMobileFilterOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="xl:hidden bg-slate-100 border-b border-slate-200 px-4 py-3 space-y-3 overflow-hidden text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">Filtros Globais</span>
                {isFilterActive && (
                  <button 
                    onClick={handleClearAllFilters}
                    className="text-[9px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded cursor-pointer"
                  >
                    Limpar todos
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-slate-200">
                  <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                  <select 
                    value={globalMonth}
                    onChange={(e) => {
                      setGlobalMonth(e.target.value);
                      if (e.target.value !== '') setGlobalQuarter('');
                    }}
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full"
                  >
                    <option value="">Mês: Todos</option>
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={idx} value={String(idx)}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-slate-200">
                  <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                  <select 
                    value={globalQuarter}
                    onChange={(e) => {
                      setGlobalQuarter(e.target.value);
                      if (e.target.value !== '') {
                        setGlobalMonth('');
                        setGlobalDay('');
                      }
                    }}
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full"
                  >
                    <option value="">Trimestre: Todos</option>
                    <option value="1">1º Trimestre</option>
                    <option value="2">2º Trimestre</option>
                    <option value="3">3º Trimestre</option>
                    <option value="4">4º Trimestre</option>
                  </select>
                </div>

                <div className={`flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-slate-200 ${!isAdmin && !isMultiUnitAuditor ? 'bg-slate-50' : ''}`}>
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <select 
                    value={isAdmin || isMultiUnitAuditor ? globalUnit : (userUnit || '')}
                    onChange={(e) => (isAdmin || isMultiUnitAuditor) && setGlobalUnit(e.target.value)}
                    disabled={!isAdmin && !isMultiUnitAuditor && !!userUnit}
                    className={`bg-transparent text-xs font-bold outline-none w-full ${
                      !isAdmin && !isMultiUnitAuditor ? 'cursor-not-allowed opacity-95 text-blue-900 font-black' : 'text-slate-700'
                    }`}
                  >
                    {(isAdmin || isMultiUnitAuditor) && <option value="">Unidade: Todas</option>}
                    {HEALTH_UNITS.filter(u => isAdmin || isMultiUnitAuditor || !userUnit || u.id === userUnit).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-slate-200">
                  <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                  <select 
                    value={globalTracer}
                    onChange={(e) => setGlobalTracer(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full"
                  >
                    <option value="">Tracer: Todos</option>
                    <option value="T01">T01 - Beira Leito</option>
                    <option value="T02">T02 - Proc. Cirúrgicos</option>
                    <option value="T03">T03 - Proc. Medicação</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 4. MAIN CONTENT CONTAINER (Saves standard margins & max width) */}
        <main className="flex-grow p-4 md:p-8 max-w-7xl w-full mx-auto space-y-8">
          
          {isQuotaExceeded && (
            <div className="bg-amber-50/95 border border-amber-300 rounded-2xl p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-5 shadow-sm">
              <div className="flex items-start md:items-center gap-3.5 flex-grow">
                <div className="p-2.5 bg-amber-100/80 rounded-xl border border-amber-200 shrink-0 text-amber-700">
                  <Database className="w-5 h-5" />
                </div>
                <div className="space-y-1.5 text-left flex-grow">
                  <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">Modo de Exibição Local de Contingência Ativo</h4>
                  <p className="text-[11px] text-amber-700/90 font-bold leading-normal">
                    O banco de dados em nuvem do Google Cloud (Firestore) atingiu o limite de cota de gravação gratuita diária do projeto. Para manter todas as telas e painéis totalmente operacionais com gráficos completos, o sistema ativou o sincronizador de contingência comercial com hidratação de banco de dados em cache local para as unidades de saúde de Recife.
                  </p>
                  {reconnectError && (
                    <p className="text-[10px] text-red-600 font-extrabold uppercase bg-red-50 border border-red-200 px-2 py-1 rounded inline-block">
                      {reconnectError}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-amber-200">
                <button
                  onClick={handleTryReconnect}
                  disabled={checkingConnection}
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-white hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-50 text-amber-800 border border-amber-300 rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingConnection ? 'animate-spin' : ''}`} />
                  {checkingConnection ? 'Verificando...' : 'Testar Conexão'}
                </button>
                <span className="text-[9px] bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-amber-200 select-none">
                  Limites de Cota Excedidos
                </span>
              </div>
            </div>
          )}

          {/* Quick Alert Info (if auditor is logged in) */}
          {!isAdmin && userUnit && (
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3.5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-xs text-blue-900 font-bold uppercase tracking-tight text-left">
                  Perfil Auditor: Acesso restrito à unidade vinculada: <span className="underline font-black">{HEALTH_UNITS.find(u => u.id === userUnit)?.name || userUnit}</span>
                </p>
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg border border-blue-200 select-none">
                Unidade Fixa
              </span>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={`${view}-${explorerFilter}-${globalMonth}-${globalQuarter}-${globalDay}-${globalUnit}-${globalType}-${globalTracer}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="min-h-[500px]"
            >
              {view === 'dashboard' && (
                <Dashboard 
                  onExplore={() => setView('explorer')} 
                  userUnit={userUnit} 
                  isAdmin={isAdmin}
                  globalMonth={globalMonth}
                  globalQuarter={globalQuarter}
                  globalDay={globalDay}
                  globalUnit={globalUnit}
                  globalType={globalType}
                  globalTracer={globalTracer}
                  onSetMonth={setGlobalMonth}
                  onSetQuarter={setGlobalQuarter}
                  onSetDay={setGlobalDay}
                  onSetUnit={setGlobalUnit}
                  onSetType={setGlobalType}
                  onSetTracer={setGlobalTracer}
                  subFilter={explorerFilter}
                  onSubViewChange={(sub) => {
                    if (sub === 'overview') setView('dashboard');
                    else if (sub === 'items_compliance') setView('indicators');
                    else if (sub === 'auditors_share') setView('auditors');
                  }}
                />
              )}
              {view === 'indicators' && (
                <Dashboard 
                  onExplore={() => setView('explorer')} 
                  userUnit={userUnit} 
                  isAdmin={isAdmin}
                  globalMonth={globalMonth}
                  globalQuarter={globalQuarter}
                  globalDay={globalDay}
                  globalUnit={globalUnit}
                  globalType={globalType}
                  globalTracer={globalTracer}
                  onSetMonth={setGlobalMonth}
                  onSetQuarter={setGlobalQuarter}
                  onSetDay={setGlobalDay}
                  onSetUnit={setGlobalUnit}
                  onSetType={setGlobalType}
                  onSetTracer={setGlobalTracer}
                  subFilter="items"
                  onSubViewChange={(sub) => {
                    if (sub === 'overview') setView('dashboard');
                    else if (sub === 'items_compliance') setView('indicators');
                    else if (sub === 'auditors_share') setView('auditors');
                  }}
                />
              )}
              {view === 'auditors' && (
                <Dashboard 
                  onExplore={() => setView('explorer')} 
                  userUnit={userUnit} 
                  isAdmin={isAdmin}
                  globalMonth={globalMonth}
                  globalQuarter={globalQuarter}
                  globalDay={globalDay}
                  globalUnit={globalUnit}
                  globalType={globalType}
                  globalTracer={globalTracer}
                  onSetMonth={setGlobalMonth}
                  onSetQuarter={setGlobalQuarter}
                  onSetDay={setGlobalDay}
                  onSetUnit={setGlobalUnit}
                  onSetType={setGlobalType}
                  onSetTracer={setGlobalTracer}
                  subFilter="auditors"
                  onSubViewChange={(sub) => {
                    if (sub === 'overview') setView('dashboard');
                    else if (sub === 'items_compliance') setView('indicators');
                    else if (sub === 'auditors_share') setView('auditors');
                  }}
                />
              )}
              {view === 'schedules' && <SchedulesSync />}
              {view === 'data_mgmt' && <DataManagement />}
              {view === 'coleta' && (
                <ColetaDigital user={user} isAdmin={isAdmin} userUnit={userUnit} />
              )}
              {view === 'explorer' && (
                <AuditExplorer 
                  userUnit={userUnit} 
                  isAdmin={isAdmin} 
                  globalMonth={globalMonth}
                  globalQuarter={globalQuarter}
                  globalDay={globalDay}
                  globalUnit={globalUnit}
                  globalType={globalType}
                  globalTracer={globalTracer}
                  onSetMonth={setGlobalMonth}
                  onSetQuarter={setGlobalQuarter}
                  onSetDay={setGlobalDay}
                  onSetUnit={setGlobalUnit}
                  onSetType={setGlobalType}
                  onSetTracer={setGlobalTracer}
                  sidebarFilter={explorerFilter}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* 5. BRAND FOOTER (Styled exactly like mockup bottom bar) */}
        <footer className="h-14 border-t border-slate-200/80 bg-white/75 backdrop-blur-sm px-6 md:px-8 mt-12 flex items-center justify-between text-[9px] uppercase font-bold text-slate-400 select-none">
          <div className="flex items-center gap-4">
            {autoSyncState === 'syncing' ? (
              <span className="text-amber-600 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin text-amber-500 shrink-0" />
                Sincronizando planilhas automaticamente...
              </span>
            ) : autoSyncState === 'success' ? (
              <span className="text-emerald-600 flex items-center gap-1.5 animate-pulse bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                Planilhas sincronizadas automaticamente
              </span>
            ) : autoSyncState === 'error' ? (
              <span className="text-red-500 flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-full border border-red-100">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                Falha no sincronismo automático
              </span>
            ) : (
              <span className="text-indigo-600 flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                Sincronismo automático ativo
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-blue-500">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Os indicadores podem sofrer alterações conforme atualização dos sistemas.</span>
          </div>
          <div className="font-mono text-slate-400">
            VER. 1.0.0
          </div>
        </footer>

      </div>

      <AnimatePresence>
        {isDayModalOpen && globalMonth !== '' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] cursor-default"
            onClick={() => setIsDayModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3 text-indigo-600">
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <CalendarDays className="w-5 h-5 shrink-0 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-xs uppercase tracking-wider text-slate-900 leading-none">
                      Filtrar por Dia?
                    </h3>
                    <p className="text-[9px] font-bold text-indigo-600 mt-1 uppercase tracking-wider leading-none">
                      Mês: {MONTH_NAMES[parseInt(globalMonth)]}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-slate-600 text-[11px] leading-relaxed">
                  <p>
                    Escolha um dia específico abaixo para detalhar ainda mais os seus indicadores ou continue para ver o mês completo:
                  </p>

                  {/* 31-day selector grid */}
                  <div className="grid grid-cols-7 gap-1 pt-1.5">
                    {Array.from({ length: 31 }, (_, i) => {
                      const dayNum = i + 1;
                      const isSelected = String(dayNum) === globalDay;
                      return (
                        <button
                          key={dayNum}
                          onClick={() => {
                            setGlobalDay(String(dayNum));
                            setIsDayModalOpen(false);
                          }}
                          className={`
                            h-7 text-[10px] font-black rounded-md transition-all flex items-center justify-center cursor-pointer select-none border border-slate-200/40
                            ${isSelected 
                              ? 'bg-[#0a0b9e] text-white border-[#0a0b9e] shadow-xs shadow-[#0a0b9e]/20' 
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                            }
                          `}
                        >
                          {dayNum}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-1 justify-end">
                  <button
                    onClick={() => {
                      setGlobalDay('');
                      setIsDayModalOpen(false);
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                  >
                    Ver Mês Inteiro
                  </button>
                  <button
                    onClick={() => setIsDayModalOpen(false)}
                    className="px-3.5 py-2 bg-[#0a0b9e] hover:bg-[#080980] text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-xs shadow-blue-200"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auditor Unit Selection Modal (mandatory for auditors without a unit or opened manually) */}
      <AuditorUnitModal
        isOpen={(!isAdmin && !userUnit && !!user) || isAuditorModalManualOpen}
        userEmail={user?.email || ''}
        userName={user?.displayName || ''}
        onSave={handleSaveAuditorUnit}
      />

      {/* Google Docs Guide Modal */}
      <GoogleDocsGuideModal 
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />

      {/* Google Sheets Destination Webhook Modal (Accessible to Auditors & Admins) */}
      <GoogleSheetWebhookModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
      />

    </div>
  );
}

interface SidebarButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  isAction?: boolean;
}

function SidebarButton({ active, onClick, icon, label, badge, isAction }: SidebarButtonProps) {
  if (isAction) {
    return (
      <button
        onClick={onClick}
        className={`
          w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 group text-left cursor-pointer
          ${active
            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-950/20 ring-2 ring-white/30'
            : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 hover:border-emerald-400/50'
          }
        `}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`shrink-0 ${active ? 'text-white' : 'text-emerald-300'}`}>
            {icon}
          </span>
          <span className="font-black tracking-wide truncate">{label}</span>
        </div>
        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${active ? 'bg-white text-emerald-800' : 'bg-emerald-400/20 text-emerald-200'}`}>
          COLETA
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 group text-left cursor-pointer
        ${active 
          ? 'bg-white text-slate-900 shadow-md shadow-[#0a0b9e]/30' 
          : 'text-blue-100/90 hover:text-white hover:bg-white/10'
        }
      `}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`shrink-0 transition-colors duration-200 ${active ? 'text-blue-600' : 'text-blue-200 group-hover:text-white'}`}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      {badge && (
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 ${active ? 'bg-blue-100 text-blue-700' : 'bg-white/15 text-white/80'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
