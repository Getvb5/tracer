import React, { useState } from 'react';
import { 
  FileText, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X, 
  Copy, 
  ShieldCheck, 
  UserCheck, 
  BookOpen, 
  Share2,
  Sparkles,
  Filter,
  Download,
  Database,
  LayoutDashboard,
  Layers,
  ClipboardList,
  Calendar,
  FileSpreadsheet,
  Building2,
  RefreshCw,
  Search
} from 'lucide-react';
import { createGuideGoogleDoc, GoogleDocResult } from '../lib/googleDocsService';

interface GoogleDocsGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleDocsGuideModal: React.FC<GoogleDocsGuideModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [createdDoc, setCreatedDoc] = useState<GoogleDocResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'access' | 'filters' | 'export' | 'features'>('overview');

  if (!isOpen) return null;

  const handleGenerateDoc = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await createGuideGoogleDoc();
      setCreatedDoc(result);
      // Auto open in new tab
      if (typeof window !== 'undefined') {
        window.open(result.documentUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      console.error('[GoogleDocs] Erro ao gerar doc:', err);
      setError(err?.message || 'Falha ao criar o documento no Google Docs. Verifique as permissões de sua conta Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdDoc) return;
    navigator.clipboard.writeText(createdDoc.documentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-left">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase tracking-tight text-white">
                  Manual do Sistema
                </h2>
                <span className="bg-blue-400/20 text-blue-200 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border border-blue-300/30">
                  Google Docs
                </span>
              </div>
              <p className="text-xs text-blue-200/80 mt-0.5">
                Guia operacional dos perfis Administrador e Auditor pronto para leitura e exportação
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Banner for Google Docs */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-black text-slate-900 uppercase">
                Exportar para seu Google Docs
              </div>
              <div className="text-[11px] text-slate-600 font-medium">
                Cria um novo documento oficial diretamente no seu Google Drive com formatação editável.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {createdDoc ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <a
                  href={createdDoc.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir no Google Docs</span>
                </a>
                <button
                  onClick={handleCopyLink}
                  className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer"
                  title="Copiar Link"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateDoc}
                disabled={loading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md hover:shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gerando Documento...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Criar e Editar no Google Docs</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong>Atenção:</strong> {error}
            </div>
          </div>
        )}

        {/* Success notification */}
        {createdDoc && !error && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Documento criado com sucesso! Ele foi aberto em uma nova aba do seu navegador.</span>
            </div>
            <a 
              href={createdDoc.documentUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-emerald-700 hover:text-emerald-900 font-bold underline text-[11px] shrink-0"
            >
              Acessar agora
            </a>
          </div>
        )}

        {/* Tab Filters for Interactive Preview */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-150 flex flex-wrap items-center gap-1.5 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
              activeTab === 'overview' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>1. Visão Geral & Perfis</span>
          </button>
          <button
            onClick={() => setActiveTab('access')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
              activeTab === 'access' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>2. Como Acessar</span>
          </button>
          <button
            onClick={() => setActiveTab('filters')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
              activeTab === 'filters' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>3. Como Filtrar</span>
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
              activeTab === 'export' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>4. Como Extrair Dados</span>
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
              activeTab === 'features' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>5. Todas Funcionalidades</span>
          </button>
        </div>

        {/* Preview Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-grow text-slate-800 text-xs leading-relaxed max-h-[62vh]">
          
          {/* ABA 1: VISÃO GERAL & MATRIZ DE PERFIS */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-blue-900 font-black text-xs uppercase tracking-wide">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <h3>Visão Geral do Sistema & Metas Internacionais de Segurança do Paciente</h3>
                </div>
                <p className="text-slate-700">
                  O <strong>Sistema de Monitoramento Tracer</strong> da Secretaria de Saúde do Recife (SESAU) é a plataforma integrada de monitoramento da qualidade assistencial nas unidades hospitalares, maternidades e policlínicas do município. Ele consolida auditorias clínicas à beira do leito para conformidade com as metas da Organização Mundial da Saúde (OMS) e da ANVISA.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-black text-xs uppercase">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>Perfil Auditor (Operação & Campo)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Destinado a enfermeiros, médicos e profissionais da qualidade que atuam diretamente nos setores de internação e centros cirúrgicos. Focado na coleta ágil de dados (via smartphone, tablet ou computador), modo offline e acompanhamento das metas locais de sua unidade.
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 pt-1 font-medium">
                    <li>Iniciar Tracers com validação de regras em tempo real</li>
                    <li>Operação com salvamento automático offline</li>
                    <li>Visualizar indicadores e coletas da sua própria unidade</li>
                    <li>Sincronização em nuvem e disparo imediato para Google Sheets</li>
                  </ul>
                </div>

                <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-900 font-black text-xs uppercase">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>Perfil Administrador (Governança & Gestão)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Destinado ao Núcleo de Segurança do Paciente (NSP), coordenações municipais e gestores de qualidade. Permite visão corporativa de todas as unidades, diagnósticos estatísticos por pergunta/item e gestão total dos dados.
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 pt-1 font-medium">
                    <li>Visão panorâmica e comparativa de todas as 8 unidades da rede</li>
                    <li>Filtros avançados (Trimestre, Mês, Dia, Unidade, Setor e Tracer)</li>
                    <li>Exportação executiva de relatórios em CSV com UTF-8 BOM</li>
                    <li>Edição e exclusão segura de auditorias com confirmação</li>
                    <li>Gestão de sincronizações com planilhas e cadastro da equipe</li>
                  </ul>
                </div>
              </div>

              {/* Matriz de Permissões */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="px-4 py-2.5 bg-slate-900 text-white font-black text-xs uppercase tracking-wider flex items-center justify-between">
                  <span>Matriz Comparativa de Funcionalidades por Perfil</span>
                  <span className="text-[10px] text-slate-300 font-normal">Controle de Acesso Baseado em Função (RBAC)</span>
                </div>
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase font-black">
                      <th className="py-2.5 px-3">Funcionalidade / Módulo</th>
                      <th className="py-2.5 px-3 text-center">Perfil Auditor</th>
                      <th className="py-2.5 px-3 text-center">Perfil Administrador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Iniciar Tracer (Coleta Digital T01, T02, T03)</td>
                      <td className="py-2 px-3 text-center text-emerald-700 font-bold">Sim (Criar / Editar Próprias)</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">Sim (Total + Exclusão)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Visão Geral (Dashboard Executivo)</td>
                      <td className="py-2 px-3 text-center text-slate-600">Restrito à sua Unidade</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">Todas as Unidades + Ranking</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Conformidade por Item (Gráficos Empilhados)</td>
                      <td className="py-2 px-3 text-center text-slate-600">Sua Unidade</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">Global + Exportação CSV</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Participação de Auditores</td>
                      <td className="py-2 px-3 text-center text-slate-600">Sua Unidade</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">Rede Municipal Completa</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Explorador de Auditorias (Tabela & Fichas)</td>
                      <td className="py-2 px-3 text-center text-slate-600">Consulta da Unidade</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">Consulta, Edição, Exclusão & CSV</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Sincronização & Fontes de Dados</td>
                      <td className="py-2 px-3 text-center text-slate-400">Restrito</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">Acesso Total (Forçar Sync)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Gestão de Cadastros (Auditores & Unidades)</td>
                      <td className="py-2 px-3 text-center text-slate-400">Restrito</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">Total</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Planilhas Destino (Webhooks Google Sheets)</td>
                      <td className="py-2 px-3 text-center text-emerald-700 font-bold">Envio & Fila Offline</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">Configuração & Gestão de Fila</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ABA 2: COMO ACESSAR */}
          {activeTab === 'access' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-blue-900 font-black text-xs uppercase">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <h3>Como Acessar o Sistema (Passo a Passo)</h3>
                </div>
                <p className="text-slate-700 text-xs">
                  O acesso ao sistema é realizado exclusivamente via <strong>Conta Google Institucional ou Pessoal Autorizada</strong>, eliminando senhas fracas e garantindo auditoria de acessos.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">1</div>
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-xs">Acessar o Endereço Web</h4>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      Abra o navegador (Google Chrome, Microsoft Edge ou Safari) no celular, tablet ou computador e acesse a URL do sistema.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">2</div>
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-xs">Autenticação com o Google</h4>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      Na tela inicial, clique no botão azul <strong>"Acessar com Google"</strong>. Selecione ou digite seu e-mail cadastrado.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">3</div>
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-xs">Identificação da Unidade de Saúde (Para Auditores)</h4>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      Se for o seu primeiro acesso como Auditor, uma janela automática solicitará que você confirme seu <strong>Nome Completo</strong> e a sua <strong>Unidade de Saúde Padrão</strong> (ex: Hospital da Mulher do Recife, Policlínica Barros Lima, etc.). Essa configuração agiliza suas futuras auditorias.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">4</div>
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-xs">Alterar Unidade ou Perfil a Qualquer Momento</h4>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      No canto superior direito da tela, clique sobre o card do seu usuário para abrir o menu rápido. Lá você pode clicar em <strong>"Trocar Unidade"</strong> ou fazer <strong>Logout</strong> de forma segura. Administradores podem alternar a visualização para testar a experiência de um auditor em campo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: COMO FILTRAR DADOS */}
          {activeTab === 'filters' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase">
                  <Filter className="w-4 h-4 text-amber-600" />
                  <h3>Como Filtrar Dados no Sistema (Guia dos Filtros Globais)</h3>
                </div>
                <p className="text-slate-700 text-xs">
                  O sistema possui uma <strong>Barra Global de Filtros Sincronizada</strong> no topo de todas as telas. Quando você aplica um filtro, ele reflete simultaneamente em todos os gráficos, cards de metas, diagnósticos e tabelas analíticas.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-900 font-bold uppercase text-[11px]">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>Filtro por Trimestre (Consolidado)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Permite selecionar <strong>1º Tri (Jan-Mar)</strong>, <strong>2º Tri (Abr-Jun)</strong>, <strong>3º Tri (Jul-Set)</strong> ou <strong>4º Tri (Out-Dez)</strong> para analisar ciclos de melhoria contínua da qualidade e fechamentos trimestrais.
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-900 font-bold uppercase text-[11px]">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <span>Filtro por Mês & Disparador de Dia</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Selecione o mês específico (ex: Maio/2026). Ao selecionar um mês, o sistema automaticamente abre o <strong>Seletor Modal de Dias</strong>, permitindo investigar coletas de um plantão ou data específica.
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-900 font-bold uppercase text-[11px]">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span>Filtro por Unidade de Saúde</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Filtre qualquer uma das unidades hospitalares e policlínicas municipais (Hospital da Mulher, Barros Lima, Arnaldo Marques, Agamenon Magalhães, Policlínica do Pina, etc.). Para auditores, a unidade padrão já vem pré-selecionada.
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-900 font-bold uppercase text-[11px]">
                    <Layers className="w-4 h-4 text-amber-600" />
                    <span>Filtro por Tracer (Meta de Segurança)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Isole os dados para analisar exclusivamente:
                    <br />• <strong>T01:</strong> Identificação do Paciente à Beira do Leito
                    <br />• <strong>T02:</strong> Lista de Verificação de Cirurgia Segura
                    <br />• <strong>T03:</strong> Processos de Medicação e Higiene de Mãos
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-900 font-bold uppercase text-[11px]">
                    <Search className="w-4 h-4 text-slate-600" />
                    <span>Busca Textual Dinâmica no Explorador</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    No Explorador de Auditorias e na tela de Conformidade por Item, digite qualquer termo (nome do paciente, número do leito, nome do auditor ou pergunta específica) para filtrar em tempo real na listagem.
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-800 font-bold uppercase text-[11px]">
                    <X className="w-4 h-4 text-rose-600" />
                    <span>Botão Limpar Todos os Filtros</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Sempre que houver qualquer filtro ativo, um botão destacado <strong>"Limpar Filtros"</strong> aparece no rodapé do menu lateral ou na barra superior, permitindo retornar à visão geral completa com 1 único clique.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: COMO EXTRAIR DADOS */}
          {activeTab === 'export' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-black text-xs uppercase">
                  <Download className="w-4 h-4 text-emerald-600" />
                  <h3>Como Extrair e Exportar Dados do Sistema</h3>
                </div>
                <p className="text-slate-700 text-xs">
                  O sistema oferece múltiplos formatos de extração e exportação de dados para reuniões do Núcleo de Segurança do Paciente (NSP), relatórios de auditoria, defesas em comissões hospitalares e alimentação de sistemas de BI.
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-900 font-black uppercase text-xs">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>1. Exportação Geral em Planilha (Excel / CSV com UTF-8 BOM)</span>
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">Explorador de Auditorias</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    No menu <strong>"Explorador de Auditorias"</strong>, clique no botão <strong>"Exportar Planilha (CSV)"</strong> no canto superior direito.
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                    <li><strong>Compatibilidade imediata:</strong> O arquivo utiliza codificação UTF-8 com caractere BOM (\uFEFF), abrindo no Microsoft Excel, LibreOffice Calc e Google Planilhas sem caracteres corrompidos em acentos gráficos (ç, ã, é).</li>
                    <li><strong>Respeito aos filtros:</strong> Se você filtrou uma unidade, período ou Tracer, o CSV exportará exatamente o conjunto de dados filtrado. Se nenhum filtro estiver ativo, exportará o banco integral.</li>
                    <li><strong>Colunas completas:</strong> Inclui ID do Registro, Tracer, Unidade, Leito, Auditor, Data/Hora, Quantidade de Critérios Conformes/Não Conformes, Taxa de Conformidade (%) e todas as perguntas com as respectivas respostas e justificativas.</li>
                  </ul>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-900 font-black uppercase text-xs">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>2. Exportação de Conformidade por Item (Indicadores Pergunta a Pergunta)</span>
                    </div>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-md">Conformidade por Item</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    No menu <strong>"Conformidade por Item"</strong>, na barra de controle dos gráficos empilhados, clique em <strong>"Exportar CSV"</strong>.
                  </p>
                  <p className="text-slate-600 text-[11px]">
                    Gera uma tabela estatística consolidada contendo o nome de cada critério auditado, o total de avaliações, a quantidade e o percentual exato de <strong>Sim (%)</strong>, <strong>Não (%)</strong> e <strong>Não se Aplica (%)</strong>. Ideal para planos de ação 5W2H e ciclos PDCA de causas de não-conformidade.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-900 font-black uppercase text-xs">
                      <ExternalLink className="w-4 h-4 text-emerald-600" />
                      <span>3. Sincronização em Tempo Real com Planilhas Google (Webhooks)</span>
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">Nuvem & Google Sheets</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Cada coleta realizada no sistema é transmitida automaticamente para a planilha municipal de destino no Google Sheets via Google Apps Script Webhooks.
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                    <li><strong>Resiliência Offline:</strong> Se o dispositivo estiver sem internet no momento da coleta, a auditoria é armazenada em uma fila local segura e transmitida assim que a conexão retornar.</li>
                    <li><strong>Sincronização Global da Configuração:</strong> As URLs das planilhas são armazenadas centralizadamente no Firestore (`system_config/webhook_urls`). Quando um administrador atualiza a planilha de destino, todos os auditores passam a salvar nela automaticamente.</li>
                  </ul>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-900 font-black uppercase text-xs">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>4. Exportação do Manual Oficial para Google Docs</span>
                    </div>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">Google Docs</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Utilize o banner no topo desta janela e clique em <strong>"Criar e Editar no Google Docs"</strong>. O sistema gera automaticamente um documento formatado e editável na pasta do seu Google Drive institucional.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 5: TODAS AS FUNCIONALIDADES */}
          {activeTab === 'features' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-indigo-900 font-black text-xs uppercase">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <h3>Guia Completo de Todas as Funcionalidades do Sistema</h3>
                </div>
                <p className="text-slate-700 text-xs">
                  Conheça detalhadamente cada módulo, tela e recurso operacional disponível na plataforma:
                </p>
              </div>

              <div className="space-y-4">
                
                {/* 1. Iniciar Tracer */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-900">
                    <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">1</span>
                    <span>Iniciar Tracer (Coleta Digital em Campo)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Formulário eletrônico otimizado para celulares, tablets e notebooks, com validações automáticas:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px]">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <strong className="text-slate-900">Tracer 01 (Beira Leito):</strong>
                      <p className="text-slate-500 mt-0.5">Auditoria de pulseiras, placa de leito, checagem ativa de 2 identificadores (nome e data de nascimento/mãe), identificação de riscos de queda e alergias.</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <strong className="text-slate-900">Tracer 02 (Cirurgia Segura):</strong>
                      <p className="text-slate-500 mt-0.5">Auditoria das 3 etapas da Lista de Verificação: Sign-In (antes da indução), Time-Out (antes da incisão) e Sign-Out (antes da saída da sala).</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <strong className="text-slate-900">Tracer 03 (Proc. Medicação):</strong>
                      <p className="text-slate-500 mt-0.5">Prescrição médica, dupla checagem na administração, identificação de ampolas e equipos, e higiene de mãos nos 5 momentos da OMS.</p>
                    </div>
                  </div>
                  <div className="bg-emerald-50 text-emerald-900 p-2.5 rounded-lg text-[11px] font-medium border border-emerald-200">
                    <strong>Recursos Especiais:</strong> Cálculo automático da taxa de conformidade em tempo real durante o preenchimento, abertura de campo de justificativa obrigatória ao marcar "Não", histórico de coletas recentes com botões diretos de edição e exclusão.
                  </div>
                </div>

                {/* 2. Visão Geral (Dashboard) */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-900">
                    <span className="p-1.5 bg-blue-100 text-blue-800 rounded-lg">2</span>
                    <span>Visão Geral (Dashboard Executivo & Metas)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Painel com métricas consolidadas em tempo real:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                    <li><strong>Cards de Indicadores Chave:</strong> Total de auditorias realizadas, Taxa Geral de Conformidade (%), Quantidade de Unidades Monitoradas e Dias de Auditoria em Campo.</li>
                    <li><strong>Diagnósticos Inteligentes Automatizados:</strong> O sistema detecta automaticamente itens com conformidade crítica (&lt;80%) e emite recomendações imediatas de melhoria.</li>
                    <li><strong>Comparativo por Unidade:</strong> Gráfico de barras com ranking de desempenho de cada hospital/policlínica frente à média municipal.</li>
                    <li><strong>Monitor de Metas Mensais:</strong> Indicador visual de progresso frente à meta de auditorias estipulada para cada unidade.</li>
                  </ul>
                </div>

                {/* 3. Conformidade por Item */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-900">
                    <span className="p-1.5 bg-indigo-100 text-indigo-800 rounded-lg">3</span>
                    <span>Conformidade por Item (Gráficos Empilhados Pergunta a Pergunta)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Visualização analítica de cada critério verificado nos Tracers:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                    <li><strong>Barras Empilhadas Coloridas:</strong> Verde para "Sim", Vermelho para "Não" e Cinza para "Não se Aplica".</li>
                    <li><strong>Ordenação Rápida:</strong> Ordene os critérios por maior conformidade ou por itens críticos (menor conformidade) para priorizar treinamentos da equipe de enfermagem e médica.</li>
                    <li><strong>Campo de Busca de Critérios:</strong> Encontre instantaneamente qualquer item pelo nome ou palavra-chave.</li>
                  </ul>
                </div>

                {/* 4. Participação de Auditores */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-900">
                    <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">4</span>
                    <span>Participação dos Auditores (Produtividade & Engajamento)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Tabela de monitoramento da força de trabalho das auditorias:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                    <li>Quantidade de auditorias realizadas por cada profissional da equipe.</li>
                    <li>Distribuição por tipo de Tracer e unidades visitadas.</li>
                    <li>Média de conformidade registrada por auditor, auxiliando no alinhamento metodológico das coletas.</li>
                  </ul>
                </div>

                {/* 5. Explorador de Auditorias */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-900">
                    <span className="p-1.5 bg-purple-100 text-purple-800 rounded-lg">5</span>
                    <span>Explorador de Auditorias (Tabela Geral, Visualização, Edição & Exclusão)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Repositório analítico completo de todas as auditorias:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                    <li><strong>Alternância de Modos:</strong> Modo Tabela Executiva compacta ou Modo Cards Detalhados.</li>
                    <li><strong>Visualização da Ficha Completa:</strong> Modal que reproduz fielmente todo o formulário preenchido com respostas e justificativas.</li>
                    <li><strong>Edição Direta:</strong> Possibilidade de corrigir digitações de leitos ou respostas sem perder o histórico do registro.</li>
                    <li><strong>Exclusão Segura:</strong> Botão de exclusão com janela de confirmação e desvinculação em cascata (remoção do banco e das listas).</li>
                  </ul>
                </div>

                {/* 6. Sincronização & Fontes de Dados */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-900">
                    <span className="p-1.5 bg-teal-100 text-teal-800 rounded-lg">6</span>
                    <span>Sincronização & Fontes de Dados (Administradores)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Módulo de governança da integração entre Google Sheets e o banco de dados em nuvem Firestore:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                    <li>Status de conectividade em tempo real com as planilhas consolidadas.</li>
                    <li>Botão <strong>"Forçar Sincronização Manual"</strong> para importar imediatamente novos registros lançados nas planilhas de origem.</li>
                    <li>Validação de hashes criptográficos para evitar leituras redundantes e garantir consistência dos dados.</li>
                  </ul>
                </div>

                {/* 7. Gestão de Cadastros */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-900">
                    <span className="p-1.5 bg-rose-100 text-rose-800 rounded-lg">7</span>
                    <span>Gestão de Cadastros (Auditores & Unidades de Saúde)</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Administração das equipes de campo e da rede municipal:
                  </p>
                  <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4 font-medium">
                    <li>Cadastro de novos auditores com categoria profissional (Enfermeiro, Médico, etc.) e conselho de classe.</li>
                    <li>Vínculo automático de auditores com sua Unidade de Saúde de referência.</li>
                    <li>Gestão das Unidades da Rede Municipal de Saúde do Recife.</li>
                  </ul>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            Secretaria de Saúde do Recife • Núcleo de Segurança do Paciente
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
