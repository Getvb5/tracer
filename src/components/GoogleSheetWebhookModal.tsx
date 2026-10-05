import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, Copy, Check, ExternalLink, ArrowRight, 
  Send, RefreshCw, AlertCircle, CheckCircle2, ShieldCheck, X,
  AlertTriangle, Sparkles, HelpCircle, Loader2, Cloud
} from 'lucide-react';
import { 
  getAllWebhookUrls, setAllWebhookUrls, setWebhookUrl, getAppsScriptCode, 
  getPendingQueue, flushPendingQueue, sendAuditToGoogleSheet,
  validateWebhookUrl, SheetWebhookConfig, testWebhookConnection,
  fetchWebhookUrlsFromCloud
} from '../lib/googleSheetWebhook';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function GoogleSheetWebhookModal({ isOpen, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [webhookUrls, setWebhookUrls] = useState<SheetWebhookConfig>({
    tracer_01: '',
    tracer_02: '',
    tracer_03: ''
  });
  const [singleGlobalUrl, setSingleGlobalUrl] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [testingTracer, setTestingTracer] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ msg: string; success: boolean; sheetName?: string; rowNumber?: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = getAllWebhookUrls();
      setWebhookUrls(current);
      setSingleGlobalUrl(current.tracer_01 || current.tracer_02 || current.tracer_03 || '');
      setPendingCount(getPendingQueue().length);
      setTestResult(null);
      setSaveSuccess(false);
      setSaveStatusMessage('');

      setIsLoadingCloud(true);
      fetchWebhookUrlsFromCloud()
        .then((cloudUrls) => {
          setWebhookUrls(cloudUrls);
          if (cloudUrls.tracer_01 || cloudUrls.tracer_02 || cloudUrls.tracer_03) {
            setSingleGlobalUrl(cloudUrls.tracer_01 || cloudUrls.tracer_02 || cloudUrls.tracer_03 || '');
          }
        })
        .finally(() => {
          setIsLoadingCloud(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getAppsScriptCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleApplySingleUrl = () => {
    if (!singleGlobalUrl.trim()) return;
    const clean = singleGlobalUrl.trim();
    setWebhookUrls({
      tracer_01: clean,
      tracer_02: clean,
      tracer_03: clean
    });
  };

  const handleApplyToAll = (sourceUrl: string) => {
    if (!sourceUrl.trim()) return;
    const clean = sourceUrl.trim();
    setSingleGlobalUrl(clean);
    setWebhookUrls({
      tracer_01: clean,
      tracer_02: clean,
      tracer_03: clean
    });
  };

  const handleSaveUrls = async () => {
    setIsSaving(true);
    try {
      const res = await setAllWebhookUrls(webhookUrls);
      setSaveSuccess(true);
      setSaveStatusMessage(res.message);
      setPendingCount(getPendingQueue().length);
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (e: any) {
      setTestResult({
        success: false,
        msg: 'Erro ao salvar URLs: ' + (e?.message || e)
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async (tracerId: 'tracer_01' | 'tracer_02' | 'tracer_03', tracerName: string) => {
    setTestingTracer(tracerId);
    setTestResult(null);
    try {
      const targetUrl = (webhookUrls[tracerId] || webhookUrls.tracer_01 || webhookUrls.tracer_02 || webhookUrls.tracer_03 || '').trim();
      const val = validateWebhookUrl(targetUrl);
      if (!val.valid) {
        setTestResult({
          success: false,
          msg: val.error || 'A URL informada não é válida para envio.'
        });
        return;
      }

      // Save URLs immediately to ensure state is active
      await setAllWebhookUrls(webhookUrls);

      // Execute safe, timed test (max 8 seconds)
      const result = await testWebhookConnection(tracerId, targetUrl);
      setTestResult({
        success: result.success,
        msg: result.message
      });
      setPendingCount(getPendingQueue().length);
    } catch (e: any) {
      setTestResult({
        success: false,
        msg: `Erro no teste: ${e.message || 'Falha de conexão. Verifique se o Apps Script foi implantado com acesso para Qualquer Pessoa.'}`
      });
    } finally {
      setTestingTracer(null);
    }
  };

  const handleFlush = async () => {
    setFlushing(true);
    try {
      const res = await flushPendingQueue();
      setPendingCount(getPendingQueue().length);
      setTestResult({
        success: res.sent > 0,
        msg: `Fila processada: ${res.sent} enviadas, ${res.errors} pendentes.`
      });
    } catch (e: any) {
      setTestResult({
        success: false,
        msg: `Falha ao processar fila: ${e.message}`
      });
    } finally {
      setFlushing(false);
    }
  };

  const renderUrlValidation = (url: string) => {
    if (!url.trim()) {
      return (
        <span className="text-[10px] text-slate-400 font-medium">
          Nenhuma URL específica (se vazio, usará a URL de outro Tracer configurado)
        </span>
      );
    }
    const val = validateWebhookUrl(url);
    if (!val.valid) {
      return (
        <span className="text-[10px] text-red-600 font-bold flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {val.error}
        </span>
      );
    }
    if (val.warning) {
      return (
        <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {val.warning}
        </span>
      );
    }
    return (
      <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
        <Check className="w-3 h-3 shrink-0" />
        URL Válida do Web App (/exec)
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Configuração da Planilha Destino (Google Sheets)</h2>
                <span className="text-[10px] bg-white/20 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Cloud className={`w-3 h-3 ${isLoadingCloud ? 'animate-pulse' : ''}`} />
                  {isLoadingCloud ? 'Buscando da Nuvem...' : 'Sincronizado na Nuvem'}
                </span>
              </div>
              <p className="text-xs text-emerald-100 font-medium">
                Gravação automática em tempo real e sincronização completa para todos os auditores
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Critical Setup Alert */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Atenção Obrigatória para Funcionar (Acesso no Apps Script)
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Ao criar ou atualizar a implantação no <strong>Google Apps Script</strong>, o campo <strong>"Quem tem acesso" (Who has access)</strong> <span className="underline font-bold">DEVE ser selecionado como "Qualquer pessoa" (Anyone)</span>. Se deixar como <em>"Apenas eu"</em>, o Google bloqueia o envio dos dados vindos do app web!
            </p>
          </div>

          {/* Instructions Step-by-Step */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Passo a Passo Rápido (1 Minuto):
            </h3>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed font-medium">
              <li>Abra sua planilha no Google Sheets onde deseja registrar os dados.</li>
              <li>No menu superior da planilha, clique em: <strong>Extensões → Apps Script</strong>.</li>
              <li>Apague o código de exemplo e <strong>cole o código abaixo</strong>.</li>
              <li>Clique no botão azul <strong>Implantar → Nova Implantação</strong> (ou Gerenciar Implantações).</li>
              <li>Selecione o tipo de engrenagem <strong>App da Web</strong>.</li>
              <li>Defina <em>"Executar como: Eu"</em> e <strong>"Quem tem acesso: Qualquer pessoa"</strong> (Anyone).</li>
              <li>Clique em <strong>Implantar</strong>, copie a <strong>URL do App da Web</strong> (termina com <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">/exec</code>) e cole abaixo.</li>
            </ol>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <button
                onClick={handleCopyCode}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
              >
                {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Código Copiado para a Área de Transferência!' : 'Copiar Código do Google Apps Script'}
              </button>
              <span className="text-[11px] text-slate-400 text-center sm:text-right">Identifica automaticamente as abas de cada Tracer</span>
            </div>
          </div>

          {/* Quick Single URL Setup */}
          <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-black uppercase text-emerald-900 tracking-wider">
                  Configuração Rápida (URL Única para Todos os Tracers)
                </span>
              </div>
              <span className="text-[10px] text-emerald-800 font-bold bg-emerald-200/80 px-2 py-0.5 rounded">
                Recomendado
              </span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed font-normal">
              Se você implantou o Apps Script em uma única planilha com abas (ex: <em>Tracer 01</em>, <em>Tracer 02</em>, <em>Tracer 03</em>), cole a URL aqui e clique em <strong>Aplicar a Todos os Tracers</strong>:
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={singleGlobalUrl}
                onChange={(e) => setSingleGlobalUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800"
              />
              <button
                type="button"
                onClick={handleApplySingleUrl}
                disabled={!singleGlobalUrl.trim()}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs shrink-0 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Aplicar aos 3 Tracers
              </button>
            </div>
          </div>

          {/* Webhook URLs per Tracer */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                URLs do Web App (Google Apps Script):
              </h3>
              {(webhookUrls.tracer_01 || webhookUrls.tracer_02 || webhookUrls.tracer_03) && (
                <button
                  type="button"
                  onClick={() => handleApplyToAll(webhookUrls.tracer_01 || webhookUrls.tracer_02 || webhookUrls.tracer_03)}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  Usar a mesma URL nos 3 Tracers
                </button>
              )}
            </div>

            {/* Tracer 01 */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-red-600 flex items-center gap-1.5 uppercase">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span>
                  Tracer 01 - Beira Leito (Destino)
                </label>
                <button
                  type="button"
                  onClick={() => handleTest('tracer_01', 'Tracer 01')}
                  disabled={testingTracer !== null}
                  className="text-[11px] font-bold text-slate-600 hover:text-emerald-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  {testingTracer === 'tracer_01' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                      <span className="text-emerald-700">Testando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>Testar Envio</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={webhookUrls.tracer_01}
                onChange={(e) => setWebhookUrls(prev => ({ ...prev, tracer_01: e.target.value }))}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <div className="pt-0.5">{renderUrlValidation(webhookUrls.tracer_01)}</div>
            </div>

            {/* Tracer 02 */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-600 flex items-center gap-1.5 uppercase">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Tracer 02 - Proc. Cirúrgicos (Destino)
                </label>
                <button
                  type="button"
                  onClick={() => handleTest('tracer_02', 'Tracer 02')}
                  disabled={testingTracer !== null}
                  className="text-[11px] font-bold text-slate-600 hover:text-emerald-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  {testingTracer === 'tracer_02' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                      <span className="text-emerald-700">Testando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>Testar Envio</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={webhookUrls.tracer_02}
                onChange={(e) => setWebhookUrls(prev => ({ ...prev, tracer_02: e.target.value }))}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <div className="pt-0.5">{renderUrlValidation(webhookUrls.tracer_02)}</div>
            </div>

            {/* Tracer 03 */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-indigo-600 flex items-center gap-1.5 uppercase">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  Tracer 03 - Proc. Medicação (Destino)
                </label>
                <button
                  type="button"
                  onClick={() => handleTest('tracer_03', 'Tracer 03')}
                  disabled={testingTracer !== null}
                  className="text-[11px] font-bold text-slate-600 hover:text-emerald-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  {testingTracer === 'tracer_03' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                      <span className="text-emerald-700">Testando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>Testar Envio</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={webhookUrls.tracer_03}
                onChange={(e) => setWebhookUrls(prev => ({ ...prev, tracer_03: e.target.value }))}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <div className="pt-0.5">{renderUrlValidation(webhookUrls.tracer_03)}</div>
            </div>
          </div>

          {/* Test & Queue feedback */}
          {testResult && (
            <div className={`p-4 rounded-xl flex items-start gap-2.5 text-xs font-semibold ${
              testResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
              <div className="space-y-1">
                <div>{testResult.msg}</div>
                {!testResult.success && (
                  <p className="text-[11px] text-red-600 font-normal leading-relaxed">
                    Dica: Se o erro for de conexão ou CORS, acesse o Apps Script &gt; Implantar &gt; Gerenciar Implantações e certifique-se de que "Quem tem acesso" está como "Qualquer pessoa".
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Pending offline queue */}
          {pendingCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-800 block">Fila de Envios Pendentes</span>
                <span className="text-[11px] text-amber-600">
                  Existem {pendingCount} coletas guardadas aguardando envio para a planilha destino.
                </span>
              </div>
              <button
                onClick={handleFlush}
                disabled={flushing}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${flushing ? 'animate-spin' : ''}`} />
                {flushing ? 'Enviando...' : 'Reenviar Agora'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" /> {saveStatusMessage || 'Configurações salvas e sincronizadas na nuvem!'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Fechar
            </button>
            <button
              onClick={handleSaveUrls}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-all shadow-sm active:scale-95 flex items-center gap-2 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isSaving ? 'Salvando...' : 'Salvar URLs de Destino'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
