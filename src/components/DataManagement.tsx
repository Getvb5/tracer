import { useState, useMemo, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { Database, RefreshCw, CloudDownload, Activity, Building2, CheckCircle2, Trash2, FileSpreadsheet, Settings, Users, Mail, ShieldCheck, Search, Copy, Check } from 'lucide-react';
import { HEALTH_UNITS, AUTHORIZED_AUDITORS_BY_UNIT, MULTI_UNIT_AUDITOR_EMAILS } from '../lib/utils';
import { useAuditsData } from '../context/DataContext';
import GoogleSheetWebhookModal from './GoogleSheetWebhookModal';
import { getAllWebhookUrls, getPendingQueue } from '../lib/googleSheetWebhook';
import { syncSingleTracer } from '../lib/autoSync';

const TRACER_CONFIGS = [
  { 
    id: 'tracer_01', 
    name: 'TRACER 01 - Beira Leito', 
    collection: 'audits_patient_id',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSC60psAKcfv3iaypiyAh5jGoNKQJE0VgsZyLnAiWqeJrJEMrTHqel-Y4UWw2XUmWKfn8fxrQDZDXhK/pub?gid=322028166&single=true&output=csv',
    color: 'border-red-500'
  },
  { 
    id: 'tracer_02', 
    name: 'TRACER 02 - Proc. Cirúrgicos', 
    collection: 'audits_safe_surgery',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQPHGA77UVgNeDPZtg_7YXqLKFJE3Fezfr2Oy2Xl02eXwLr0ZbdkqjxPdhJv0AXFI8DJWJQoMTRpgQw/pub?gid=836928129&single=true&output=csv',
    color: 'border-amber-500'
  },
  { 
    id: 'tracer_03', 
    name: 'TRACER 03 - Proc. Medicação', 
    collection: 'audits_hand_hygiene',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8pDmvLv8C5Ikqj4-5O8XBOax4YUUliyh8IlyuHM8UugyGUN8URqSs7V-BH7BPwmFzFsrUZQvPGXBw/pub?gid=842761097&single=true&output=csv',
    color: 'border-indigo-600'
  }
];

export default function DataManagement() {
  const { patientAudits, surgeryAudits, handAudits, refreshAudits } = useAuditsData();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({
    tracer_01: localStorage.getItem('url_sync_tracer_01') || TRACER_CONFIGS[0].defaultUrl,
    tracer_02: localStorage.getItem('url_sync_tracer_02') || TRACER_CONFIGS[1].defaultUrl,
    tracer_03: localStorage.getItem('url_sync_tracer_03') || TRACER_CONFIGS[2].defaultUrl
  });
  const [lastSyncs, setLastSyncs] = useState<Record<string, string | null>>({
    tracer_01: localStorage.getItem('last_sync_tracer_01'),
    tracer_02: localStorage.getItem('last_sync_tracer_02'),
    tracer_03: localStorage.getItem('last_sync_tracer_03'),
  });
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'success' | 'error'}[]>([]);
  const [auditorSearch, setAuditorSearch] = useState('');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // Zero-cost in-memory counts calculated straight from the data layer
  const counts = useMemo(() => ({
    tracer_01: patientAudits.length,
    tracer_02: surgeryAudits.length,
    tracer_03: handAudits.length
  }), [patientAudits.length, surgeryAudits.length, handAudits.length]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ msg, type }, ...prev].slice(0, 8));
  };

  const handleClear = async (tracerId: string) => {
    const config = TRACER_CONFIGS.find(c => c.id === tracerId);
    if (!config) return;
    
    setSyncingId(tracerId);
    setConfirmingId(null);
    addLog(`Limpando base de ${config.name}...`, 'info');
    
    try {
      const collRef = collection(db, config.collection);
      let totalDeleted = 0;
      const snapshot = await getDocs(collRef);
      
      if (snapshot.empty) {
        addLog(`Base de ${config.name} já está vazia.`, 'success');
      } else {
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        totalDeleted = snapshot.size;
        addLog(`Sucesso: ${totalDeleted} registros removidos de ${config.name}.`, 'success');
      }
      refreshAudits();
    } catch (e: any) {
      console.error("Erro na limpeza:", e);
      addLog(`Erro ao limpar: ${e.message}`, 'error');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSync = async (tracerId: string) => {
    const config = TRACER_CONFIGS.find(c => c.id === tracerId);
    if (!config) return;
    const url = urls[tracerId];

    if (!url) {
      addLog(`URL não fornecida para ${config.name}`, 'error');
      return;
    }

    setSyncingId(tracerId);
    addLog(`Iniciando sincronização: ${config.name}...`, 'info');

    try {
      const res = await syncSingleTracer(tracerId, url, 'mai./2026');
      if (res.success) {
        if (res.imported > 0) {
          addLog(`${config.name}: Sincronismo concluído!`, 'success');
          addLog(`→ ${res.imported} novos registros sincronizados e persistidos em cache.`, 'info');
        } else {
          addLog(`${config.name}: Sincronismo concluído. Nenhum novo registro detectado.`, 'success');
        }
        if (res.skipped > 0) {
          addLog(`→ ${res.skipped} linhas ignoradas (duplicadas ou sem unidade de saúde válida).`, 'info');
        }
        if (res.errors > 0) {
          addLog(`→ Houve ${res.errors} erros de gravação em banco.`, 'error');
        }
        const nowStr = new Date().toLocaleString();
        setLastSyncs(prev => ({ ...prev, [tracerId]: nowStr }));
        localStorage.setItem(`last_sync_${tracerId}`, nowStr);
        
        // Dispatch custom event to notify all components to refresh their view data immediately
        window.dispatchEvent(new Event('local-data-updated'));
      } else {
        addLog(`Erro ao sincronizar ${config.name}: ${res.error || 'Erro desconhecido'}`, 'error');
      }
    } catch (err: any) {
      addLog(`Falha de conexão (${tracerId}): ${err.message}`, 'error');
    } finally {
      setSyncingId(null);
      refreshAudits();
    }
  };

  const checkYes = (val: string) => {
    if (!val) return false;
    const lower = val.toString().toLowerCase().trim();
    return lower === 'sim' || lower === 's' || lower === 'yes' || lower === 'conforme' || lower === 'true';
  };

  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState(getAllWebhookUrls());
  const [pendingQueueCount, setPendingQueueCount] = useState(0);

  useEffect(() => {
    setWebhookConfig(getAllWebhookUrls());
    setPendingQueueCount(getPendingQueue().length);
  }, [isWebhookModalOpen]);

  return (
    <div className="space-y-6">
      {/* Destination Google Sheets Webhook Header Banner */}
      <div className="bg-gradient-to-br from-emerald-900 to-teal-950 border border-emerald-800 rounded-2xl p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <FileSpreadsheet className="w-4 h-4" />
            Planilhas Google Sheets de Destino
          </div>
          <h2 className="text-lg font-bold text-white">Gravação Automática das Coletas</h2>
          <p className="text-xs text-emerald-100/80">
            Cada coleta concluída nos formulários é transmitida em tempo real para a sua planilha Google Sheets.
          </p>
        </div>

        <button
          onClick={() => setIsWebhookModalOpen(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 shrink-0"
        >
          <Settings className="w-4 h-4" />
          Configurar Destino / Webhooks
        </button>
      </div>

      <header className="mb-2">
        <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">Central de Sincronização de Tracers (Origem CSV)</h1>
        <p className="text-slate-500 text-xs mt-1">Conecte os links oficiais das planilhas para monitoramento automático das equipes.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TRACER_CONFIGS.map(config => (
          <div key={config.id} className={`theme-card border-l-4 ${config.color} flex flex-col`}>
             <div className="flex items-center gap-3 mb-4">
               <div className="p-2 bg-slate-50 text-slate-400 rounded">
                 <Database className="w-4 h-4" />
               </div>
               <h3 className="font-black text-[10px] uppercase tracking-tight text-slate-900">{config.name}</h3>
             </div>

             <div className="space-y-3 flex-1 mb-4">
               <label className="text-[9px] font-bold uppercase text-slate-400 tracking-widest leading-none">Link da Planilha (CSV)</label>
               <input 
                 type="text" 
                 value={urls[config.id]}
                 onChange={(e) => {
                    const val = e.target.value;
                    setUrls(prev => ({ ...prev, [config.id]: val }));
                    localStorage.setItem(`url_sync_${config.id}`, val);
                  }}
                 placeholder="Cole o link CSV aqui..."
                 className="w-full p-2 bg-slate-50 border border-slate-100 rounded text-[10px] focus:ring-1 focus:ring-blue-500 outline-none"
               />
               <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
                 <div className="flex flex-col">
                   <span>Última Sinc:</span>
                   <span className="font-mono">{lastSyncs[config.id] || '---'}</span>
                 </div>
                 <div className="flex flex-col items-end">
                   <span>Na Base:</span>
                   <span className="font-mono text-slate-900">{counts[config.id]} registros</span>
                 </div>
               </div>
             </div>

             <div className="flex gap-2">
               <button 
                 onClick={() => handleSync(config.id)}
                 disabled={syncingId !== null}
                 className={`flex-1 py-2.5 rounded font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                   syncingId === config.id 
                     ? 'bg-blue-600 text-white animate-pulse' 
                     : syncingId !== null 
                       ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                       : 'bg-slate-900 text-white hover:bg-slate-800'
                 }`}
               >
                 {syncingId === config.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
                 {syncingId === config.id ? 'Sincronizando' : 'Sincronizar'}
               </button>
               
               {confirmingId === config.id ? (
                 <div className="flex gap-1">
                   <button 
                     onClick={() => handleClear(config.id)}
                     className="px-2 py-2.5 bg-red-600 text-white rounded font-black text-[8px] uppercase tracking-tight hover:bg-red-700 transition-all"
                   >
                     CONFIRMAR
                   </button>
                   <button 
                     onClick={() => setConfirmingId(null)}
                     className="px-2 py-2.5 bg-slate-200 text-slate-600 rounded font-black text-[8px] uppercase tracking-tight hover:bg-slate-300 transition-all"
                   >
                     X
                   </button>
                 </div>
               ) : (
                 <button 
                   onClick={() => setConfirmingId(config.id)}
                   disabled={syncingId !== null}
                   className="p-2.5 bg-red-50 text-red-600 rounded border border-red-100 hover:bg-red-100 transition-colors"
                   title="Limpar todos os dados deste tracer"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               )}
             </div>
          </div>
        ))}
      </div>

      <div className="theme-card">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
           <Activity className="w-4 h-4 text-blue-500" />
           Log Operacional de Sincronismo
        </h3>
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2">
          {logs.length === 0 && <p className="text-[11px] text-slate-400 italic py-4 text-center">Nenhuma atividade recente.</p>}
          {logs.map((log, i) => (
            <div key={i} className={`p-2 rounded text-[10px] font-bold uppercase border ${
              log.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
              log.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 
              'bg-slate-50 text-slate-500 border-slate-100'
            }`}>
              <span className="opacity-40 mr-2">[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span>
              {log.msg}
            </div>
          ))}
        </div>
      </div>

      <div className="theme-card">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
           <Building2 className="w-4 h-4 text-blue-500" />
           Mapeamento de Unidades (Rede Recife)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {HEALTH_UNITS.map(u => (
            <div key={u.id} className="p-2 border border-slate-100 rounded text-[9px] font-black uppercase text-slate-500 flex items-center justify-between">
              <span className="truncate pr-2">{u.name}</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Authorized Auditors by Unit Section */}
      <div className="theme-card space-y-4 text-left">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-200">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-xs md:text-sm font-black text-slate-900 uppercase tracking-tight">
                E-mails Autorizados para Acesso (Perfil AUDITOR)
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Relação oficial de e-mails habilitados para login e vinculados automaticamente às unidades da rede SESAU
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por e-mail ou unidade..."
              value={auditorSearch}
              onChange={(e) => setAuditorSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 w-full sm:w-60 font-medium"
            />
          </div>
        </div>

        {/* Units Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {AUTHORIZED_AUDITORS_BY_UNIT.filter(entry => {
            if (!auditorSearch.trim()) return true;
            const q = auditorSearch.toLowerCase();
            return entry.unitName.toLowerCase().includes(q) || entry.emails.some(e => e.toLowerCase().includes(q));
          }).map(entry => (
            <div key={entry.unitId} className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tight line-clamp-1" title={entry.unitName}>
                    {entry.unitName}
                  </h4>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {entry.emails.map(email => {
                    const isMulti = MULTI_UNIT_AUDITOR_EMAILS.includes(email.toLowerCase());
                    return (
                      <div 
                        key={email}
                        className="flex items-center justify-between gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/70 shadow-2xs group hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="text-[10px] font-mono font-bold text-slate-700 truncate" title={email}>
                            {email}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isMulti && (
                            <span className="text-[8px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter" title="Autorizado para todas as unidades">
                              Todas Unidades
                            </span>
                          )}
                          <button
                            onClick={() => handleCopyEmail(email)}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="Copiar e-mail"
                          >
                            {copiedEmail === email ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                <span>{entry.emails.length} e-mail{entry.emails.length > 1 ? 's' : ''} ativo{entry.emails.length > 1 ? 's' : ''}</span>
                <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Autorizado
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Google Sheets Webhook Destination Modal */}
      <GoogleSheetWebhookModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
      />
    </div>
  );
}
