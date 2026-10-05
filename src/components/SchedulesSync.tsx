import { useState, useMemo, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, getDocs, 
  doc, writeBatch
} from 'firebase/firestore';
import { Settings, RefreshCw, ChevronDown, CheckCircle2, AlertCircle, Database, Trash2, FileSpreadsheet, Send, ShieldCheck } from 'lucide-react';
import { HEALTH_UNITS } from '../lib/utils';
import { useAuditsData } from '../context/DataContext';
import { motion } from 'motion/react';
import GoogleSheetWebhookModal from './GoogleSheetWebhookModal';
import { getAllWebhookUrls, getPendingQueue, flushPendingQueue } from '../lib/googleSheetWebhook';
import { syncSingleTracer } from '../lib/autoSync';

const TRACER_CONFIGS = [
  { 
    id: 'tracer_01', 
    name: 'TRACER 01 - Beira Leito', 
    collection: 'audits_patient_id',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSC60psAKcfv3iaypiyAh5jGoNKQJE0VgsZyLnAiWqeJrJEMrTHqel-Y4UWw2XUmWKfn8fxrQDZDXhK/pub?gid=322028166&single=true&output=csv'
  },
  { 
    id: 'tracer_02', 
    name: 'TRACER 02 - Proc. Cirúrgicos', 
    collection: 'audits_safe_surgery',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQPHGA77UVgNeDPZtg_7YXqLKFJE3Fezfr2Oy2Xl02eXwLr0ZbdkqjxPdhJv0AXFI8DJWJQoMTRpgQw/pub?gid=836928129&single=true&output=csv'
  },
  { 
    id: 'tracer_03', 
    name: 'TRACER 03 - Proc. Medicação', 
    collection: 'audits_hand_hygiene',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8pDmvLv8C5Ikqj4-5O8XBOax4YUUliyh8IlyuHM8UugyGUN8URqSs7V-BH7BPwmFzFsrUZQvPGXBw/pub?gid=842761097&single=true&output=csv'
  }
];

export default function SchedulesSync() {
  const { patientAudits, surgeryAudits, handAudits, refreshAudits } = useAuditsData();
  const [urls, setUrls] = useState<Record<string, string>>({
    tracer_01: localStorage.getItem('url_sync_tracer_01') || TRACER_CONFIGS[0].defaultUrl,
    tracer_02: localStorage.getItem('url_sync_tracer_02') || TRACER_CONFIGS[1].defaultUrl,
    tracer_03: localStorage.getItem('url_sync_tracer_03') || TRACER_CONFIGS[2].defaultUrl
  });
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [lastSyncs, setLastSyncs] = useState<Record<string, string | null>>({
    tracer_01: localStorage.getItem('last_sync_tracer_01'),
    tracer_02: localStorage.getItem('last_sync_tracer_02'),
    tracer_03: localStorage.getItem('last_sync_tracer_03'),
  });
  
  // Zero-cost in-memory counts calculated directly from local data layer
  const counts = useMemo(() => ({
    tracer_01: patientAudits.length,
    tracer_02: surgeryAudits.length,
    tracer_03: handAudits.length
  }), [patientAudits.length, surgeryAudits.length, handAudits.length]);
  const [competencia, setCompetencia] = useState('mai./2026');
  const [selectedUnit, setSelectedUnit] = useState('Todas');
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'success' | 'error'}[]>([]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ msg, type }, ...prev].slice(0, 5));
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
      
      // Get all docs to delete
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

    // Forçar releitura completa limpando o hash de controle local anterior
    localStorage.removeItem(`last_hash_${tracerId}`);

    try {
      const res = await syncSingleTracer(tracerId, url, competencia);
      if (res.success) {
        if (res.imported > 0) {
          addLog(`${config.name}: Sincronismo concluído!`, 'success');
          addLog(`→ ${res.imported} novos registros salvos em cache.`, 'info');
        } else {
          addLog(`${config.name}: Sincronismo concluído. Nenhum novo registro foi inserido.`, 'success');
        }
        if (res.skipped > 0) {
          addLog(`→ ${res.skipped} linhas ignoradas (duplicadas ou sem unidade de saúde válida).`, 'info');
        }
        if (res.errors > 0) {
          addLog(`→ Houve ${res.errors} erros de gravação em banco.`, 'error');
        }
        const now = new Date().toLocaleString('pt-BR');
        setLastSyncs(prev => ({ ...prev, [tracerId]: now }));
        localStorage.setItem(`last_sync_${tracerId}`, now);
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
      {/* Destination Google Sheets Webhook Card */}
      <div className="bg-gradient-to-br from-emerald-900 to-teal-950 border border-emerald-800/80 rounded-2xl p-6 sm:p-8 text-white shadow-xl shadow-emerald-950/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 border border-emerald-400/30 rounded-full text-emerald-300 text-xs font-bold tracking-wide">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              DESTINO DAS COLETAS EM TEMPO REAL
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Gravação Direta na Planilha Google Sheets
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/80 leading-relaxed">
              Configure os Webhooks do Google Apps Script para que cada coleta lançada nos Tracers seja registrada instantaneamente como uma nova linha na sua planilha destino.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-1.5 text-xs bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10">
                <span className={`w-2 h-2 rounded-full ${webhookConfig.tracer_01 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-slate-300 font-bold">Tracer 01:</span>
                <span className={webhookConfig.tracer_01 ? 'text-emerald-300 font-medium' : 'text-slate-400 font-medium'}>
                  {webhookConfig.tracer_01 ? 'Conectado' : 'Não configurado'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10">
                <span className={`w-2 h-2 rounded-full ${webhookConfig.tracer_02 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-slate-300 font-bold">Tracer 02:</span>
                <span className={webhookConfig.tracer_02 ? 'text-emerald-300 font-medium' : 'text-slate-400 font-medium'}>
                  {webhookConfig.tracer_02 ? 'Conectado' : 'Não configurado'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10">
                <span className={`w-2 h-2 rounded-full ${webhookConfig.tracer_03 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-slate-300 font-bold">Tracer 03:</span>
                <span className={webhookConfig.tracer_03 ? 'text-emerald-300 font-medium' : 'text-slate-400 font-medium'}>
                  {webhookConfig.tracer_03 ? 'Conectado' : 'Não configurado'}
                </span>
              </div>

              {pendingQueueCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs bg-amber-500/20 text-amber-300 border border-amber-400/30 px-3 py-1.5 rounded-lg font-bold">
                  {pendingQueueCount} coletas pendentes de envio
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <button
              onClick={() => setIsWebhookModalOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
            >
              <Settings className="w-4 h-4" />
              Configurar Planilhas Destino
            </button>
          </div>
        </div>
      </div>

      {/* Header Info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-slate-700" />
          <h2 className="text-xl font-bold text-slate-900 tracking-tight text-center sm:text-left">PAINEL STATUS TRACER'S</h2>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {TRACER_CONFIGS.map(config => (
            <div key={config.id} className="space-y-3 p-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                URL do CSV - {config.name} (Arquivo → Publicar na Web → CSV)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                   <Database className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                   <input 
                    type="text" 
                    value={urls[config.id]}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUrls(prev => ({ ...prev, [config.id]: val }));
                      localStorage.setItem(`url_sync_${config.id}`, val);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-inner"
                    placeholder="Insira a URL da planilha Google..."
                  />
                </div>
                <button 
                  onClick={() => handleSync(config.id)}
                  disabled={syncingId !== null}
                  className="bg-[#004b82] text-white px-8 py-3.5 rounded-xl font-black text-[12px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#003a66] transition-all disabled:opacity-50 active:scale-95 shadow-md shadow-blue-900/10 shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingId === config.id ? 'animate-spin' : ''}`} />
                  {syncingId === config.id ? 'Sincronizando' : 'Sincronizar'}
                </button>

                {confirmingId === config.id ? (
                  <div className="flex gap-2 animate-in fade-in zoom-in duration-200">
                    <button 
                      onClick={() => handleClear(config.id)}
                      className="bg-red-600 text-white px-4 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-tight hover:bg-red-700 transition-all active:scale-95 whitespace-nowrap shadow-md shadow-red-200"
                    >
                      CONFIRMAR EXCLUSÃO
                    </button>
                    <button 
                      onClick={() => setConfirmingId(null)}
                      className="bg-slate-200 text-slate-600 px-4 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-tight hover:bg-slate-300 transition-all active:scale-95"
                    >
                      CANCELAR
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setConfirmingId(config.id)}
                    disabled={syncingId !== null}
                    className="bg-red-50 text-red-600 px-4 py-3.5 rounded-xl font-black text-[12px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-red-100 transition-all disabled:opacity-50 active:scale-95 shrink-0 border border-red-200"
                    title="Limpar base de dados deste Tracer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-bold px-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${lastSyncs[config.id] ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-slate-300'}`} />
                  Última sincronização: {lastSyncs[config.id] || 'Nunca sincronizado'}
                </div>
                <div className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                   {counts[config.id]} registros na base
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters Area */}
      <div className="flex flex-wrap gap-8 items-center bg-white/70 backdrop-blur-sm p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-[13px] font-black text-slate-800 uppercase tracking-tight">Competência:</span>
          <div className="relative">
            <select 
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-5 py-3 text-sm font-bold appearance-none min-w-[160px] pr-12 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
            >
              <option>mai./2026</option>
              <option>abr./2026</option>
              <option>mar./2026</option>
            </select>
            <ChevronDown className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[13px] font-black text-slate-800 uppercase tracking-tight">Unidade:</span>
          <div className="relative">
            <select 
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-5 py-3 text-sm font-bold appearance-none min-w-[260px] pr-12 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer"
            >
              <option>Todas</option>
              {HEALTH_UNITS.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
            <ChevronDown className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Sync Logs Table (Mini) */}
      {logs.length > 0 && (
        <div className="animate-in fade-in slide-in-from-top-2 space-y-1.5 px-6">
          {logs.map((log, i) => (
            <div key={i} className={`flex items-center gap-2.5 text-[11px] font-black uppercase tracking-wider ${
              log.type === 'success' ? 'text-emerald-600' : 
              log.type === 'error' ? 'text-red-600' : 
              'text-slate-500'
            }`}>
              {log.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
               log.type === 'error' ? <AlertCircle className="w-4 h-4" /> : null}
              {log.msg}
            </div>
          ))}
        </div>
      )}
      {/* Google Sheets Webhook Destination Modal */}
      <GoogleSheetWebhookModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
      />
    </div>
  );
}
