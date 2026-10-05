import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import { getDocs, collection, query, limit, doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  getCustomLocalAudits,
  getDeletedAuditIds, 
  getMergedPatientAudits, 
  getMergedSurgeryAudits, 
  getMergedHandAudits,
  deleteAuditFromLocal
} from '../lib/fallbackData';
import { HEALTH_UNITS } from '../lib/utils';
import { 
  UserCircle2, 
  ClipboardCheck, 
  ShieldCheck, 
  Save, 
  Building2, 
  ClipboardList, 
  CheckCircle2, 
  ArrowLeft,
  UserCheck,
  AlertCircle,
  Activity,
  History,
  Eye,
  X,
  Search,
  Trash2,
  Pencil,
  FileSpreadsheet,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PatientIdForm from './Forms/PatientIdForm';
import SafeSurgeryForm from './Forms/SafeSurgeryForm';
import HandHygieneForm from './Forms/HandHygieneForm';
import GoogleSheetWebhookModal from './GoogleSheetWebhookModal';
import { getAllWebhookUrls, getPendingQueue, deleteAuditFromGoogleSheet, sendAuditToGoogleSheet } from '../lib/googleSheetWebhook';

interface Props {
  user: User;
  isAdmin?: boolean;
  userUnit?: string | null;
}

interface AuditorProfile {
  name: string;
  professionalCategory: 'Médico' | 'Enfermeiro' | 'Técnico' | 'Outro';
  registrationNumber: string;
  defaultUnitId: string;
}

export default function ColetaDigital({ user, isAdmin = true, userUnit = null }: Props) {
  // State for Auditor Profile
  const [profile, setProfile] = useState<AuditorProfile>({
    name: user.displayName || '',
    professionalCategory: 'Enfermeiro',
    registrationNumber: '',
    defaultUnitId: (!isAdmin && userUnit) ? userUnit : ''
  });
  
  const [profileSaved, setProfileSaved] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [activeTracer, setActiveTracer] = useState<string | null>(null);
  const [editingAudit, setEditingAudit] = useState<any | null>(null);
  const [auditSuccess, setAuditSuccess] = useState(false);
  const [auditScopeTab, setAuditScopeTab] = useState<'my' | 'unit' | 'all'>(isAdmin ? 'all' : 'unit');
  const [recentAudits, setRecentAudits] = useState<{
    my: any[];
    unit: any[];
    all: any[];
  }>({ my: [], unit: [], all: [] });
  const [profileError, setProfileError] = useState('');
  const [deletingAudit, setDeletingAudit] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(() => getPendingQueue().length);
  const [auditSheetResult, setAuditSheetResult] = useState<any | null>(null);
  const [isSyncingRecord, setIsSyncingRecord] = useState(false);

  useEffect(() => {
    const updateQueue = () => {
      const qLen = getPendingQueue().length;
      setPendingQueueCount(qLen);
      if (qLen === 0 && auditSheetResult?.queued) {
        setAuditSheetResult({
          success: true,
          queued: false,
          message: 'Planilha destino sincronizada! Os registros pendentes foram enviados com sucesso.'
        });
      }
    };
    updateQueue();
    window.addEventListener('pending-queue-updated', updateQueue);
    window.addEventListener('webhook-urls-updated', updateQueue);
    return () => {
      window.removeEventListener('pending-queue-updated', updateQueue);
      window.removeEventListener('webhook-urls-updated', updateQueue);
    };
  }, [isWebhookModalOpen, activeTracer, auditSuccess, auditSheetResult]);

  const triggerToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Helper to extract Auditor Name from any audit structure
  const getAuditorName = (audit: any): string => {
    if (audit?.auditorName && typeof audit.auditorName === 'string' && audit.auditorName.trim() && audit.auditorName.trim() !== 'Auditor Sincronizado' && audit.auditorName.trim() !== '-') {
      return audit.auditorName.trim();
    }
    if (audit?.rawData) {
      const raw = audit.rawData;
      const name = raw['Nome Completo do Auditor:'] ||
                   raw['Nome Completo do Auditor'] ||
                   raw['06- Nome Completo do Auditor:'] || 
                   raw['06- Nome do Auditor:'] || 
                   raw['05- Nome Completo do Auditor:'] ||
                   raw['05- Nome do Auditor:'] ||
                   raw['04- Nome Completo do Auditor:'] ||
                   raw['Nome do Auditor:'] ||
                   raw['Auditor:'] ||
                   raw['Auditor'];
      if (name && typeof name === 'string' && name.trim() && name.trim() !== 'Auditor Sincronizado') return name.trim();
    }
    if (audit?.auditorId === user.uid) {
      return profile.name || user.displayName || user.email || 'Você';
    }
    return 'Auditor de Campo';
  };

  // Helper to check if an audit was authored by the current user
  const isAuthorCurrentUser = (audit: any): boolean => {
    if (!audit) return false;
    if (audit.auditorId === user.uid) return true;
    
    const auditAuditor = getAuditorName(audit).toLowerCase().trim();
    const myName = (profile.name || user.displayName || '').toLowerCase().trim();
    const myEmail = (user.email || '').toLowerCase().trim();

    if (myName && auditAuditor) {
      // Direct exact match
      if (auditAuditor === myName) return true;
      // Partial containment for full names
      if (myName.length > 4 && (auditAuditor.includes(myName) || myName.includes(auditAuditor))) {
        return true;
      }
    }
    if (myEmail && auditAuditor === myEmail) return true;

    return false;
  };

  // States for viewing audit detail and searching inside answers
  const [selectedAudit, setSelectedAudit] = useState<any | null>(null);
  const [auditSearchText, setAuditSearchText] = useState('');

  // Load existing profile from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`auditor_profile_${user.uid}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfile({
          name: parsed.name || user.displayName || '',
          professionalCategory: parsed.professionalCategory || 'Enfermeiro',
          registrationNumber: parsed.registrationNumber || '',
          defaultUnitId: (!isAdmin && userUnit) ? userUnit : (parsed.defaultUnitId || '')
        });
        setProfileSaved(true);
      } catch (e) {
        console.error('Error loading auditor profile:', e);
      }
    } else {
      if (!isAdmin && userUnit) {
        setProfile(p => ({ ...p, defaultUnitId: userUnit }));
      }
      // Prompt user to configure profile
      setIsEditingProfile(true);
    }
  }, [user, isAdmin, userUnit]);

  // Load recent audits collected by this auditor or their unit from local storage and firestore
  const loadRecentAudits = async () => {
    try {
      const deletedIds = getDeletedAuditIds();
      const effectiveUnit = !isAdmin && userUnit ? userUnit : profile.defaultUnitId;

      // 1. Get all local merged audits
      const pMerged = getMergedPatientAudits().map(a => ({ ...a, type: 'T01', tracerName: 'Beira Leito' }));
      const sMerged = getMergedSurgeryAudits().map(a => ({ ...a, type: 'T02', tracerName: 'Cirurgia Segura' }));
      const hMerged = getMergedHandAudits().map(a => ({ ...a, type: 'T03', tracerName: 'Proc. Medicação' }));
      const allLocal = [...pMerged, ...sMerged, ...hMerged]
        .filter(a => !deletedIds.includes(a.id))
        .map(a => ({
          ...a,
          timestampStr: a.timestampStr || (a.timestamp && typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate().toISOString() : new Date().toISOString())
        }));

      const organizeAndSet = (allCombined: any[]) => {
        const sorted = [...allCombined].sort((a, b) => {
          const tA = new Date(a.timestampStr || Date.now()).getTime();
          const tB = new Date(b.timestampStr || Date.now()).getTime();
          return tB - tA;
        });

        // Filter strictly by this user (My Audits)
        const my = sorted.filter(a => isAuthorCurrentUser(a));
        
        // Filter by unit (all colleagues from the same unit)
        const unit = effectiveUnit 
          ? sorted.filter(a => a.unitId === effectiveUnit || a.hospitalId === effectiveUnit || a.unidadeId === effectiveUnit)
          : (isAdmin ? sorted : []);

        // All audits (strictly restricted to unit for non-admins to prevent network leaks)
        const all = isAdmin ? sorted : unit;

        setRecentAudits({ my, unit, all });
      };

      // Set initial view with local data
      organizeAndSet(allLocal);

      // 2. Fetch the latest from Firestore asynchronously (non-blocking)
      try {
        const fetchCollection = async (collName: string, type: 'T01' | 'T02' | 'T03', tracerName: string) => {
          const q = query(collection(db, collName), limit(300));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(doc => {
            const data = doc.data();
            const dateStr = data.timestamp && typeof data.timestamp.toDate === 'function'
              ? data.timestamp.toDate().toISOString() 
              : (data.timestamp && data.timestamp.seconds ? new Date(data.timestamp.seconds * 1000).toISOString() : (data.timestampStr || new Date().toISOString()));
            return {
              id: doc.id,
              type,
              tracerName,
              ...data,
              timestampStr: dateStr
            };
          });
        };

        const [pAudits, sAudits, hAudits] = await Promise.all([
          fetchCollection('audits_patient_id', 'T01', 'Beira Leito'),
          fetchCollection('audits_safe_surgery', 'T02', 'Cirurgia Segura'),
          fetchCollection('audits_hand_hygiene', 'T03', 'Proc. Medicação')
        ]);

        const allFirestore = [...pAudits, ...sAudits, ...hAudits];
        
        // Merge with local deduplicated, prioritizing cloud/latest
        const mergedMap = new Map();
        allLocal.forEach(a => mergedMap.set(a.id, a));
        allFirestore.forEach(a => {
          if (!deletedIds.includes(a.id)) {
            mergedMap.set(a.id, a);
          }
        });

        organizeAndSet(Array.from(mergedMap.values()));
      } catch (firestoreErr: any) {
        console.warn('Coleta Digital carregou dados locais:', firestoreErr?.message || firestoreErr);
      }
    } catch (e) {
      console.error('Error loading recent audits:', e);
    }
  };

  const handleDeleteAudit = async (id: string, type: string, fullAuditData?: any) => {
    if (!id) return;
    try {
      // Find audit details safely before deletion for spreadsheet synchronization
      const allAuditsList = [
        ...(recentAudits?.all || []),
        ...(recentAudits?.my || []),
        ...(recentAudits?.unit || [])
      ];
      const existingAudit = fullAuditData || allAuditsList.find(a => a?.id === id);

      // Optimistic UI update immediately
      setRecentAudits(prev => ({
        my: (prev?.my || []).filter(a => a?.id !== id),
        unit: (prev?.unit || []).filter(a => a?.id !== id),
        all: (prev?.all || []).filter(a => a?.id !== id)
      }));

      // 1. Delete from local database / local storage
      try {
        deleteAuditFromLocal(id);
      } catch (localErr) {
        console.warn("Local storage delete warning:", localErr);
      }
      
      // 2. Delete from Firestore if it's not a temporary local ID
      if (id && !id.startsWith('local_')) {
        try {
          let colName = '';
          const normalizedType = (type || existingAudit?.type || '').toUpperCase();
          if (normalizedType === 'T01' || normalizedType.includes('01')) colName = 'audits_patient_id';
          else if (normalizedType === 'T02' || normalizedType.includes('02')) colName = 'audits_safe_surgery';
          else if (normalizedType === 'T03' || normalizedType.includes('03')) colName = 'audits_hand_hygiene';
          
          if (colName) {
            await deleteDoc(doc(db, colName, id));
          }
        } catch (firestoreErr) {
          console.warn("Could not delete from Firestore (offline?), marking local copy as deleted:", firestoreErr);
        }
      }

      // 3. Dispatch deletion to Destination Google Sheets Webhook
      try {
        const normalizedType = (type || existingAudit?.type || '').toUpperCase();
        const tracerId = (normalizedType === 'T01' || normalizedType.includes('01')) 
          ? 'tracer_01' 
          : (normalizedType === 'T02' || normalizedType.includes('02')) 
            ? 'tracer_02' 
            : 'tracer_03';

        await deleteAuditFromGoogleSheet({
          id,
          tracerId,
          type: normalizedType || type,
          patientName: existingAudit?.patientName || existingAudit?.rawData?.['Nome do Paciente'] || existingAudit?.rawData?.['Nome Completo do Paciente:'] || existingAudit?.rawData?.['q4_paciente'] || existingAudit?.rawData?.['q6_paciente'] || '',
          unitName: existingAudit?.unitName || existingAudit?.unitId || existingAudit?.rawData?.['Unidade de Saúde'] || existingAudit?.rawData?.['01- Unidade de Saúde:'] || '',
          timestamp: existingAudit?.timestampStr || existingAudit?.timestamp || existingAudit?.date || existingAudit?.rawData?.['Carimbo de data/hora'] || '',
          rawData: existingAudit?.rawData || {}
        });
      } catch (sheetErr) {
        console.warn('[ColetaDigital] Erro ao excluir na planilha destino:', sheetErr);
      }
      
      // 4. Close details if active
      if (selectedAudit && selectedAudit.id === id) {
        setSelectedAudit(null);
      }
      
      // 5. Reload lists and dispatch sync event
      try {
        await loadRecentAudits();
      } catch (loadErr) {
        console.warn("Error reloading audits after deletion:", loadErr);
      }
      
      // Dispatch event to update other dashboard components
      window.dispatchEvent(new Event('local-data-updated'));
      triggerToast("Coleta excluída com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao excluir coleta:", err);
      // Fallback guarantees local purge
      try {
        deleteAuditFromLocal(id);
        window.dispatchEvent(new Event('local-data-updated'));
        triggerToast("Coleta excluída com sucesso!", "success");
      } catch (e2) {
        triggerToast("Não foi possível excluir a coleta.", "error");
      }
    }
  };

  useEffect(() => {
    loadRecentAudits();
    const handleUpdate = () => loadRecentAudits();
    window.addEventListener('local-data-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('local-data-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [user, activeTracer, auditSuccess]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) {
      setProfileError('O nome completo do auditor é obrigatório.');
      return;
    }
    if (!profile.defaultUnitId) {
      setProfileError('Selecione uma unidade de saúde de atuação padrão.');
      return;
    }

    setProfileError('');
    try {
      // Save locally
      localStorage.setItem(`auditor_profile_${user.uid}`, JSON.stringify(profile));
      
      // Save in Firestore if online (fails silently if offline to protect user flow)
      const isQuotaExceededAtm = localStorage.getItem('firestore_quota_exceeded') === 'true';
      if (!isQuotaExceededAtm) {
        await setDoc(doc(db, 'auditors', user.uid), {
          ...profile,
          email: user.email,
          updatedAt: serverTimestamp()
        });
      }
      
      setProfileSaved(true);
      setIsEditingProfile(false);
    } catch (err) {
      console.error('Failed to sync auditor profile to cloud (saving locally instead):', err);
      setProfileSaved(true);
      setIsEditingProfile(false);
    }
  };

  const handleAuditComplete = (sheetResult?: any) => {
    setAuditSuccess(true);
    setAuditSheetResult(sheetResult || null);
    setEditingAudit(null);
    loadRecentAudits();
  };

  const getUnitName = (id: string) => {
    const unit = HEALTH_UNITS.find(u => u.id === id);
    return unit ? unit.name : id;
  };

  const getAuditDataDetails = (audit: any) => {
    if (!audit) return [];
    let rawData = audit.rawData;
    if (!rawData && audit.sourceRowHash) {
      try {
        rawData = JSON.parse(audit.sourceRowHash);
      } catch (e) {
        console.error('Error parsing sourceRowHash:', e);
      }
    }
    if (!rawData) return [];
    return Object.entries(rawData).map(([k, v]) => ({
      question: k,
      answer: String(v)
    }));
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8" id="coleta-digital-root">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black uppercase text-slate-900 tracking-tight flex items-center gap-3">
            <ClipboardCheck className="w-8 h-8 text-blue-600" />
            INICIAR TRACER
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm font-medium">
            Transforme as auditorias de campo em registros digitais estruturados com sincronização em tempo real na planilha Google Sheets e Firestore.
          </p>
        </div>

        <button
          onClick={() => setIsWebhookModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          Planilha Destino {pendingQueueCount > 0 && `(${pendingQueueCount} pendentes)`}
        </button>
      </div>

      {/* Profile Notice & Form */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" id="auditor-profile-card">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <UserCircle2 className="w-5 h-5 text-slate-600" />
            <h2 className="font-bold text-xs uppercase text-slate-700 tracking-wider">Perfil do Auditor de Campo</h2>
          </div>
          {profileSaved && !isEditingProfile && (
            <button 
              onClick={() => setIsEditingProfile(true)}
              className="text-[10px] font-extrabold uppercase text-blue-600 hover:text-blue-700 tracking-wider hover:underline"
            >
              Alterar Cadastro
            </button>
          )}
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {isEditingProfile ? (
              <motion.form 
                key="profile-form"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleSaveProfile} 
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block">Nome Completo do Auditor *</label>
                    <input 
                      type="text"
                      className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-800"
                      value={profile.name}
                      onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                      placeholder="Ex: Dra. Maria Silva"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block">Categoria Profissional</label>
                    <select 
                      className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-800"
                      value={profile.professionalCategory}
                      onChange={e => setProfile(p => ({ ...p, professionalCategory: e.target.value as any }))}
                    >
                      <option value="Enfermeiro">Enfermeiro(a)</option>
                      <option value="Médico">Médico(a)</option>
                      <option value="Técnico">Técnico(a) de Enfermagem</option>
                      <option value="Outro">Outro Profissional de Saúde</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block">Nº de Registro Profissional (COREN/CRM - Opcional)</label>
                    <input 
                      type="text"
                      className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-800"
                      value={profile.registrationNumber}
                      onChange={e => setProfile(p => ({ ...p, registrationNumber: e.target.value }))}
                      placeholder="Ex: COREN-PE 123456"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest block">
                      Sua Unidade Padrão * {!isAdmin && userUnit && <span className="text-blue-600 font-black">(Vinculada)</span>}
                    </label>
                    <select 
                      disabled={!isAdmin && !!userUnit}
                      className={`w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md outline-none transition-all text-slate-800 ${!isAdmin && userUnit ? 'bg-slate-100 cursor-not-allowed opacity-90 text-blue-900 font-black' : 'focus:ring-2 focus:ring-blue-500'}`}
                      value={(!isAdmin && userUnit) ? userUnit : profile.defaultUnitId}
                      onChange={e => setProfile(p => ({ ...p, defaultUnitId: e.target.value }))}
                    >
                      <option value="">Selecione sua unidade operacional padrão...</option>
                      {HEALTH_UNITS.filter(u => isAdmin || !userUnit || u.id === userUnit).map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {profileError && (
                  <p className="text-red-500 text-xs font-bold uppercase flex items-center gap-1.5 pt-1">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {profileError}
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  {profileSaved && (
                    <button 
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-700 tracking-wider"
                    >
                      Cancelar
                    </button>
                  )}
                  <button 
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-md text-xs font-extrabold uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Confirmar Perfil Auditor
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.div 
                key="profile-display"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 bg-blue-50/50 border border-blue-100 rounded-md"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-black shrink-0 shadow-inner">
                    {profile.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                      {profile.name}
                      <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.5 font-bold uppercase rounded-md flex items-center gap-1">
                        <UserCheck className="w-3 h-3" />
                        AUDITOR ATIVO
                      </span>
                    </h3>
                    <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">
                      {profile.professionalCategory} {profile.registrationNumber && `| ${profile.registrationNumber}`}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      Unidade de Atuação: <span className="text-slate-600">{getUnitName(profile.defaultUnitId)}</span>
                    </p>
                  </div>
                </div>
                
                <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-md font-bold text-center self-stretch sm:self-center">
                  Pronto para Coleta! Unidade pré-carregada automaticamente nos formulários.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Flow: Form vs Selection */}
      <div className="space-y-6">
        <AnimatePresence mode="wait">
          {activeTracer ? (
            <motion.div 
              key="active-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
              id="coleta-form-container"
            >
              {/* Back Bar */}
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <button 
                  onClick={() => {
                    setActiveTracer(null);
                    setAuditSuccess(false);
                    setEditingAudit(null);
                  }}
                  className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-800 tracking-wider"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar para Instrumentos
                </button>
                <div className="flex items-center gap-2">
                  {editingAudit && (
                    <button
                      type="button"
                      onClick={() => setDeletingAudit(editingAudit)}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                      title="Excluir esta coleta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Coleta</span>
                    </button>
                  )}
                  <div className="text-[10px] font-black bg-slate-100 text-slate-600 px-2.5 py-1 rounded uppercase tracking-widest">
                    {editingAudit ? 'Editando Coleta' : 'Nova Coleta'} - {activeTracer === 'tracer_01' ? 'T01' : activeTracer === 'tracer_02' ? 'T02' : 'T03'}
                  </div>
                </div>
              </div>

              {auditSuccess ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center space-y-6 shadow-sm">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-extrabold text-emerald-900 uppercase tracking-tight">Coleta Executada com Sucesso!</h3>
                    <p className="text-slate-600 text-xs font-medium max-w-lg mx-auto leading-relaxed">
                      A auditoria foi registrada com sucesso e sincronizada no banco de dados.
                    </p>
                  </div>

                  {/* Detalhe Explicativo do Envio para o Google Sheets */}
                  {auditSheetResult ? (
                    auditSheetResult.success ? (
                      <div className="max-w-lg mx-auto p-4 bg-white border border-emerald-300 rounded-xl shadow-xs text-xs font-semibold text-emerald-900 flex items-start gap-3 text-left">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-emerald-800">Planilha Google Sheets Destino</p>
                          <p className="text-[11px] text-slate-600 font-normal mt-0.5">{auditSheetResult.message}</p>
                        </div>
                      </div>
                    ) : auditSheetResult.queued ? (
                      <div className="max-w-lg mx-auto p-4 bg-amber-50/90 border border-amber-300 rounded-xl shadow-xs text-xs text-amber-900 flex items-start gap-3 text-left">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-bold text-amber-900">Atenção com a Planilha Destino</p>
                          <p className="text-[11px] text-amber-800 font-normal leading-relaxed">{auditSheetResult.message}</p>
                          <button
                            onClick={() => setIsWebhookModalOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-950 underline mt-1"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Configurar URL do Webhook da Planilha Agora
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-lg mx-auto p-4 bg-red-50 border border-red-200 rounded-xl shadow-xs text-xs text-red-900 flex items-start gap-3 text-left">
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-bold text-red-900">Aviso sobre o envio para a Planilha</p>
                          <p className="text-[11px] text-red-800 font-normal leading-relaxed">{auditSheetResult.message}</p>
                          <button
                            onClick={() => setIsWebhookModalOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-red-800 hover:text-red-950 underline mt-1"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Abrir Configurações da Planilha
                          </button>
                        </div>
                      </div>
                    )
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <button 
                      onClick={() => setAuditSuccess(false)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                      Nova Coleta Deste Tracer
                    </button>
                    <button 
                      onClick={() => {
                        setActiveTracer(null);
                        setAuditSuccess(false);
                      }}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                      Ir para Instrumentos
                    </button>
                    <button
                      onClick={() => setIsWebhookModalOpen(true)}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Ver Planilhas Destino
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900 text-white rounded-t-lg flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wider">
                        {activeTracer === 'tracer_01' && 'TRACER 01 - Beira Leito (ID Paciente)'}
                        {activeTracer === 'tracer_02' && 'TRACER 02 - Processos de Cirurgia Maternidade'}
                        {activeTracer === 'tracer_03' && 'TRACER 03 - Processos Seguros de Medicação'}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        Coletando informações como auditor: {profile.name}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white rounded-b-lg border border-slate-200 border-t-0 p-1">
                    {activeTracer === 'tracer_01' && (
                      <PatientIdForm 
                        user={user} 
                        onComplete={handleAuditComplete} 
                        editingAudit={editingAudit} 
                        isAdmin={isAdmin}
                        userUnit={userUnit}
                        onDelete={(audit) => setDeletingAudit(audit)}
                      />
                    )}
                    {activeTracer === 'tracer_02' && (
                      <SafeSurgeryForm 
                        user={user} 
                        onComplete={handleAuditComplete} 
                        editingAudit={editingAudit} 
                        isAdmin={isAdmin}
                        userUnit={userUnit}
                        onDelete={(audit) => setDeletingAudit(audit)}
                      />
                    )}
                    {activeTracer === 'tracer_03' && (
                      <HandHygieneForm 
                        user={user} 
                        onComplete={handleAuditComplete} 
                        editingAudit={editingAudit} 
                        isAdmin={isAdmin}
                        userUnit={userUnit}
                        onDelete={(audit) => setDeletingAudit(audit)}
                      />
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="tracer-selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* TRACER 01 CARD */}
                <div className="flex flex-col justify-between bg-white rounded-lg border-t-4 border-t-rose-500 border-x border-b border-slate-200 p-5 shadow-sm hover:shadow-md transition-all space-y-4">
                  <div className="space-y-2">
                    <span className="bg-rose-50 text-rose-800 text-[9px] px-2 py-0.5 font-bold uppercase rounded-md tracking-wider">
                      Tracer 01
                    </span>
                    <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight">Beira Leito (ID Paciente)</h3>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                      Identificação segura de beira de leito, pulseiras brancas e legibilidade dos dados do prontuário do paciente.
                    </p>
                    <div className="text-[10px] text-slate-500 font-semibold bg-rose-50/40 p-2 rounded border border-rose-100/50">
                      Instrumento digital adaptado a partir do formulário de coleta estruturada Recife.
                    </div>
                  </div>
                  <button 
                    disabled={!profileSaved}
                    onClick={() => setActiveTracer('tracer_01')}
                    className={`w-full text-center py-2.5 rounded-md text-xs font-black uppercase tracking-wider transition-all ${
                      profileSaved 
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md hover:shadow-lg' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Iniciar Tracer
                  </button>
                </div>

                {/* TRACER 02 CARD */}
                <div className="flex flex-col justify-between bg-white rounded-lg border-t-4 border-t-emerald-500 border-x border-b border-slate-200 p-5 shadow-sm hover:shadow-md transition-all space-y-4">
                  <div className="space-y-2">
                    <span className="bg-emerald-50 text-emerald-800 text-[9px] px-2 py-0.5 font-bold uppercase rounded-md tracking-wider">
                      Tracer 02
                    </span>
                    <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight">Cirurgia Segura</h3>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                      Acompanhamento de processos cirúrgicos seguro: listas de Sign In, Time Out e Sign Out essenciais na sala operatória.
                    </p>
                    <div className="text-[10px] text-slate-500 font-semibold bg-emerald-50/40 p-2 rounded border border-emerald-100/50">
                      Ideal para blocos cirúrgicos e salas de indução anestésica em maternidades.
                    </div>
                  </div>
                  <button 
                    disabled={!profileSaved}
                    onClick={() => setActiveTracer('tracer_02')}
                    className={`w-full text-center py-2.5 rounded-md text-xs font-black uppercase tracking-wider transition-all ${
                      profileSaved 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Iniciar Tracer
                  </button>
                </div>

                {/* TRACER 03 CARD */}
                <div className="flex flex-col justify-between bg-white rounded-lg border-t-4 border-t-indigo-500 border-x border-b border-slate-200 p-5 shadow-sm hover:shadow-md transition-all space-y-4">
                  <div className="space-y-2">
                    <span className="bg-indigo-50 text-indigo-800 text-[9px] px-2 py-0.5 font-bold uppercase rounded-md tracking-wider">
                      Tracer 03
                    </span>
                    <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight">Processos de Medicação</h3>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                      Prescrição segura, dupla checagem, preparo e administração de medicamentos com alta conformidade.
                    </p>
                    <div className="text-[10px] text-slate-500 font-semibold bg-indigo-50/40 p-2 rounded border border-indigo-100/50">
                      Formulário estruturado para avaliação completa dos processos seguros de medicação.
                    </div>
                  </div>
                  <button 
                    disabled={!profileSaved}
                    onClick={() => setActiveTracer('tracer_03')}
                    className={`w-full text-center py-2.5 rounded-md text-xs font-black uppercase tracking-wider transition-all ${
                      profileSaved 
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Iniciar Tracer
                  </button>
                </div>

              </div>

              {!profileSaved && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-black text-xs text-amber-900 uppercase tracking-wider">Atenção Auditor!</h4>
                    <p className="text-[11px] text-slate-600 font-medium">
                      Por favor, preencha os dados do seu <strong>Perfil do Auditor</strong> acima e clique em <strong>Confirmar Perfil</strong> para liberar os botões de auditoria individual de cada tracer. Isso garante a rastreabilidade segura dos seus dados de tracer coletados.
                    </p>
                  </div>
                </div>
              )}

              {/* Recent Audits list with Scope Tabs */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden" id="minhas-coletas-historico">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4.5 h-4.5 text-slate-500" />
                    <h3 className="font-bold text-xs uppercase text-slate-700 tracking-wider">Histórico de Coletas</h3>
                  </div>

                  {/* Scope Tabs: Minhas Coletas vs Coletas da Unidade */}
                  <div className="flex items-center bg-slate-200/70 p-1 rounded-lg gap-1 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setAuditScopeTab('my')}
                      className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                        auditScopeTab === 'my'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <UserCircle2 className="w-3.5 h-3.5" />
                      Minhas Coletas ({recentAudits.my.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuditScopeTab('unit')}
                      className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                        auditScopeTab === 'unit'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      Coletas da Unidade ({recentAudits.unit.length})
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setAuditScopeTab('all')}
                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          auditScopeTab === 'all'
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Todas as Coletas da Rede ({recentAudits.all.length})
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="p-2">
                  {(() => {
                    const currentList = auditScopeTab === 'my' 
                      ? recentAudits.my 
                      : auditScopeTab === 'unit' 
                        ? recentAudits.unit 
                        : (isAdmin ? recentAudits.all : recentAudits.unit);

                    if (currentList.length === 0) {
                      if (auditScopeTab === 'my') {
                        return (
                          <div className="text-center py-10 px-4 space-y-3 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 m-2">
                            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-inner">
                              <ClipboardList className="w-6 h-6" />
                            </div>
                            <div className="space-y-1 max-w-md mx-auto">
                              <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                                Nenhuma Coleta Registrada com Seu Usuário
                              </h4>
                              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                Você está no filtro de <strong>Minhas Coletas</strong>. As auditorias salvas por outros profissionais da sua unidade estão na aba <strong>Coletas da Unidade</strong>.
                              </p>
                              <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setAuditScopeTab('unit')}
                                  className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-md transition-all shadow-2xs"
                                >
                                  Ver Coletas da Unidade ({recentAudits.unit.length})
                                </button>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => setAuditScopeTab('all')}
                                    className="px-3.5 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider rounded-md transition-all shadow-2xs"
                                  >
                                    Ver Todas as Coletas ({recentAudits.all.length})
                                  </button>
                                )}
                                {profileSaved && (
                                  <button
                                    type="button"
                                    onClick={() => setActiveTracer('tracer_01')}
                                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-wider rounded-md shadow-xs transition-all"
                                  >
                                    Fazer Nova Coleta
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="text-center py-8 text-slate-400 space-y-2">
                          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
                          <p className="text-[11px] font-bold uppercase tracking-wider">Nenhum registro encontrado nesta categoria</p>
                          <p className="text-[10px] font-semibold text-slate-400 tracking-tight">Os novos registros aparecerão aqui em tempo real.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="divide-y divide-slate-100 bg-white">
                        {currentList.slice(0, 15).map((item: any, idx: number) => {
                          const dateStr = item.timestampStr 
                            ? new Date(item.timestampStr).toLocaleDateString('pt-BR') 
                            : 'Recente';
                          const timeStr = item.timestampStr 
                            ? new Date(item.timestampStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
                            : '';
                          const auditorName = getAuditorName(item);
                          const isMine = isAuthorCurrentUser(item);
                          const sectorName = item.rawData?.['05- Setor Auditado:'] || 
                                             item.rawData?.['04- Setor Auditado:'] || 
                                             item.rawData?.['Setor Auditado'] || 
                                             '';

                          return (
                            <div 
                              key={item.id || idx} 
                              onClick={() => setSelectedAudit(item)}
                              className="flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-all cursor-pointer group rounded-lg"
                              title="Clique para ver a auditoria detalhada"
                            >
                              <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-wider ${
                                    item.type === 'T01' ? 'bg-rose-100 text-rose-800 border border-rose-200/50' :
                                    item.type === 'T02' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/50' :
                                    'bg-indigo-100 text-indigo-800 border border-indigo-200/50'
                                  }`}>
                                    {item.type || 'Audit'}
                                  </span>
                                  <h4 className="font-extrabold text-xs text-slate-900 uppercase truncate">
                                    {item.tracerName || (item.type === 'T01' ? 'Beira Leito' : item.type === 'T02' ? 'Cirurgia' : 'Hig. Mãos')}
                                  </h4>

                                  {/* Auditor Badge */}
                                  {isMine ? (
                                    <span className="text-[8px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 border border-emerald-200">
                                      <UserCheck className="w-2.5 h-2.5" />
                                      Você ({profile.name || auditorName})
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 border border-slate-200">
                                      <UserCircle2 className="w-2.5 h-2.5 text-slate-400" />
                                      {auditorName}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                  <span className="flex items-center gap-1">
                                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                    {getUnitName(item.unitId)}
                                  </span>
                                  {sectorName && (
                                    <span className="text-slate-400 font-semibold lowercase first-letter:uppercase">
                                      • {sectorName}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 shrink-0 md:gap-4">
                                <div className="text-right space-y-0.5 hidden sm:block">
                                  <span className="text-[10px] text-slate-400 font-bold block">{dateStr} {timeStr}</span>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-tight">
                                    ✓ SALVO
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                                  {(isAdmin || isMine) && (
                                    <button 
                                      onClick={() => {
                                        setEditingAudit(item);
                                        if (item.type === 'T01') setActiveTracer('tracer_01');
                                        else if (item.type === 'T02') setActiveTracer('tracer_02');
                                        else if (item.type === 'T03') setActiveTracer('tracer_03');
                                      }}
                                      className="p-1 px-2.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-md transition-all text-[9.5px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 cursor-pointer shadow-xs border border-indigo-100"
                                      title="Editar Coleta"
                                    >
                                      <Pencil className="w-3.5 h-3.5 shrink-0" />
                                      <span className="hidden xs:inline">Editar</span>
                                    </button>
                                  )}
                                  
                                  {(isAdmin || isMine) && (
                                    <button 
                                      onClick={() => setDeletingAudit(item)}
                                      className="p-1 px-2.5 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white rounded-md transition-all text-[9.5px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 cursor-pointer shadow-xs border border-rose-100"
                                      title="Excluir Coleta"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                      <span className="hidden xs:inline">Excluir</span>
                                    </button>
                                  )}

                                  <div 
                                    onClick={() => setSelectedAudit(item)}
                                    className="p-1 px-2.5 bg-slate-100 hover:bg-blue-600 text-slate-600 hover:text-white rounded-md transition-all text-[9.5px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 cursor-pointer shadow-xs border border-slate-200"
                                  >
                                    <Eye className="w-3.5 h-3.5 shrink-0" />
                                    <span className="hidden xs:inline">Ver</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedAudit && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] cursor-default"
            onClick={() => { setSelectedAudit(null); setAuditSearchText(''); }}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl text-white shadow-xs shrink-0 ${
                    selectedAudit.type === 'T01' ? 'bg-rose-500' :
                    selectedAudit.type === 'T02' ? 'bg-emerald-500' :
                    'bg-indigo-500'
                  }`}>
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                        selectedAudit.type === 'T01' ? 'bg-rose-100 text-rose-800' :
                        selectedAudit.type === 'T02' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-indigo-100 text-indigo-800'
                      }`}>
                        {selectedAudit.type || 'Audit'}
                      </span>
                      <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-tight">
                        {selectedAudit.tracerName || 'Auditoria Realizada'}
                      </h3>
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">
                      {getUnitName(selectedAudit.unitId)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedAudit(null); setAuditSearchText(''); }}
                  className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Questions */}
              <div className="p-4 bg-white border-b border-slate-100 shrink-0 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Buscar por perguntas ou termos da resposta..."
                    value={auditSearchText}
                    onChange={(e) => setAuditSearchText(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
                {auditSearchText && (
                  <button 
                    onClick={() => setAuditSearchText('')}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-250 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Details List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40">
                {/* Meta details card */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-4 shadow-2xs space-y-3">
                  <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    Metadados da Auditoria
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[11px]">
                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wide block">Data e Hora</span>
                      <span className="font-extrabold text-slate-700">
                        {selectedAudit.timestampStr 
                          ? `${new Date(selectedAudit.timestampStr).toLocaleDateString('pt-BR')} às ${new Date(selectedAudit.timestampStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                          : 'Não disponível'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wide block">Identificação</span>
                      <span className="font-mono text-slate-500 uppercase tracking-tighter text-[10px]">
                        {selectedAudit.id}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                    Campos Coletados
                  </h4>
                  <div className="space-y-2.5">
                    {(() => {
                      const qaList = getAuditDataDetails(selectedAudit);
                      const filtered = qaList.filter(item => 
                        item.question.toLowerCase().includes(auditSearchText.toLowerCase()) || 
                        item.answer.toLowerCase().includes(auditSearchText.toLowerCase())
                      );

                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-8 bg-white border border-slate-200/50 rounded-xl">
                            <p className="text-slate-400 text-xs font-bold uppercase">Nenhum campo correspondente</p>
                          </div>
                        );
                      }

                      return filtered.map((qaItem, index) => {
                        const isJustification = qaItem.question.toLowerCase().includes('justifique') || qaItem.question.toLowerCase().includes('se não');
                        const ansLower = qaItem.answer.toLowerCase();
                        const isSim = ansLower === 'sim';
                        const isNao = ansLower === 'não';
                        const isOutrosVazios = !qaItem.answer.trim() || qaItem.answer === '-';

                        return (
                          <div 
                            key={index} 
                            className={`p-4 bg-white border border-slate-200/60 rounded-xl shadow-3xs space-y-2 transition-all flex flex-col justify-between ${
                              isJustification ? 'border-l-4 border-l-amber-500 bg-amber-50/20' : ''
                            }`}
                          >
                            <div className="space-y-1">
                              <span className="text-slate-400 font-bold uppercase text-[8px] tracking-widest block">
                                {isJustification ? 'Justificativa / Comentário' : `Pergunta ${index + 1}`}
                              </span>
                              <p className="text-[11.5px] font-bold text-slate-800 leading-relaxed">
                                {qaItem.question}
                              </p>
                            </div>
                            <div className="pt-1 select-all">
                              {isSim && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">
                                  ✓ Sim (Conforme)
                                </span>
                              )}
                              {isNao && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wide">
                                  ✗ Não (Não Conforme)
                                </span>
                              )}
                              {!isSim && !isNao && (
                                <span className={`inline-block text-xs font-extrabold ${
                                  isOutrosVazios ? 'text-slate-400 italic font-medium' : 'text-slate-700'
                                }`}>
                                  {isOutrosVazios ? 'Não especificado' : qaItem.answer}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              {/* Close Button & Actions */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-2 justify-between items-center shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!selectedAudit) return;
                      setIsSyncingRecord(true);
                      try {
                        const tracerId = selectedAudit.type === 'T01' ? 'tracer_01' : selectedAudit.type === 'T02' ? 'tracer_02' : 'tracer_03';
                        const res = await sendAuditToGoogleSheet({
                          id: selectedAudit.id,
                          tracerId,
                          type: selectedAudit.type,
                          rawData: selectedAudit.rawData || {},
                          patientName: selectedAudit.patientName,
                          unitName: selectedAudit.unitName || selectedAudit.unitId,
                          auditorName: selectedAudit.auditorName,
                          medicalRecordNumber: selectedAudit.medicalRecordNumber,
                          tracerDate: selectedAudit.tracerDate,
                          tracerTime: selectedAudit.tracerTime,
                          sector: selectedAudit.sector
                        });
                        if (res.success) {
                          setToastMessage({ text: 'Coleta gravada com sucesso na Planilha Destino (Google Sheets)!', type: 'success' });
                        } else if (res.queued) {
                          setToastMessage({ text: 'Coleta salva na fila de pendências para sincronização com a planilha.', type: 'success' });
                        } else {
                          setToastMessage({ text: res.message || 'Aviso ao enviar à planilha.', type: 'error' });
                        }
                      } catch (err: any) {
                        setToastMessage({ text: 'Erro ao gravar na planilha: ' + (err?.message || err), type: 'error' });
                      } finally {
                        setIsSyncingRecord(false);
                      }
                    }}
                    disabled={isSyncingRecord}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                    title="Gravar ou reenviar esta coleta para a planilha Google Sheets"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    {isSyncingRecord ? 'Gravando...' : 'Gravar na Planilha'}
                  </button>

                  <button
                    onClick={() => {
                      const item = selectedAudit;
                      setSelectedAudit(null);
                      setAuditSearchText('');
                      setEditingAudit(item);
                      if (item.type === 'T01') setActiveTracer('tracer_01');
                      else if (item.type === 'T02') setActiveTracer('tracer_02');
                      else if (item.type === 'T03') setActiveTracer('tracer_03');
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5 shrink-0" />
                    Editar
                  </button>
                  
                  <button
                    onClick={() => {
                      setDeletingAudit(selectedAudit);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    Excluir
                  </button>
                </div>

                <button
                  onClick={() => { setSelectedAudit(null); setAuditSearchText(''); }}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingAudit && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 cursor-default animate-fade-in"
            onClick={() => setDeletingAudit(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden text-left"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 text-red-600">
                  <div className="p-2 bg-red-50 rounded-xl">
                    <Trash2 className="w-6 h-6 shrink-0" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-900">
                      Confirmar Exclusão
                    </h3>
                    <p className="text-[9px] font-black text-red-600 mt-0.5 uppercase tracking-wider">
                      Ação Irreversível
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-slate-600 text-xs leading-relaxed">
                  <p>
                    Deseja realmente excluir este registro de auditoria? Ele será removido permanentemente de todas as visões do sistema.
                  </p>
                  <div className="p-3 bg-slate-50 rounded-lg font-mono text-[10px] text-slate-500 border border-slate-200 flex flex-col gap-1">
                    <div><strong>ID:</strong> {deletingAudit.id}</div>
                    <div><strong>Tipo:</strong> {deletingAudit.type === 'T01' ? 'Beira Leito (Tracer T01)' : deletingAudit.type === 'T02' ? 'Cirúrgico (Tracer T02)' : 'Proc. Medicação (Tracer T03)'}</div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 justify-end">
                  <button
                    onClick={() => setDeletingAudit(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      handleDeleteAudit(deletingAudit.id, deletingAudit.type, deletingAudit);
                      setDeletingAudit(null);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer shadow-sm shadow-red-200"
                  >
                    Confirmar Exclusão
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 z-50 border text-xs font-semibold ${
              toastMessage.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
            {toastMessage.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Google Sheets Webhook Destination Modal */}
      <GoogleSheetWebhookModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
      />
    </div>
  );
}
