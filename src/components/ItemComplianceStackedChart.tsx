import { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  T01_ITEMS_CONFIG, 
  T02_ITEMS_CONFIG, 
  T03_ITEMS_CONFIG, 
  calculateItemsCompliance, 
  ItemComplianceResult 
} from '../lib/itemComplianceHelper';
import { exportItemComplianceToCSV } from '../lib/csvExport';
import { CheckCircle2, AlertCircle, HelpCircle, Search, ArrowUpDown, Filter, Sparkles, Download, Layers, FileSpreadsheet } from 'lucide-react';

interface Props {
  patientAudits: any[];
  surgeryAudits: any[];
  handAudits: any[];
  unitName?: string;
  selectedMonthName?: string;
  globalTracer?: string;
}

export default function ItemComplianceStackedChart({
  patientAudits,
  surgeryAudits,
  handAudits,
  unitName,
  selectedMonthName,
  globalTracer
}: Props) {
  const [activeTracer, setActiveTracer] = useState<'T01' | 'T02' | 'T03'>('T01');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'compliance_asc' | 'compliance_desc'>('default');

  useEffect(() => {
    if (globalTracer === 'T01' || globalTracer === 'T02' || globalTracer === 'T03') {
      setActiveTracer(globalTracer);
    }
  }, [globalTracer]);

  // Calculate items compliance for current active tracer
  const itemsData: ItemComplianceResult[] = useMemo(() => {
    if (activeTracer === 'T01') {
      return calculateItemsCompliance(patientAudits, T01_ITEMS_CONFIG);
    } else if (activeTracer === 'T02') {
      return calculateItemsCompliance(surgeryAudits, T02_ITEMS_CONFIG);
    } else {
      return calculateItemsCompliance(handAudits, T03_ITEMS_CONFIG);
    }
  }, [activeTracer, patientAudits, surgeryAudits, handAudits]);

  // Current audits count
  const currentAuditsCount = useMemo(() => {
    if (activeTracer === 'T01') return patientAudits.length;
    if (activeTracer === 'T02') return surgeryAudits.length;
    return handAudits.length;
  }, [activeTracer, patientAudits, surgeryAudits, handAudits]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let result = [...itemsData];

    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      result = result.filter(item => item.name.toLowerCase().includes(q));
    }

    if (sortBy === 'compliance_asc') {
      result.sort((a, b) => a.simPct - b.simPct);
    } else if (sortBy === 'compliance_desc') {
      result.sort((a, b) => b.simPct - a.simPct);
    }

    return result;
  }, [itemsData, searchTerm, sortBy]);

  // Overall tracer compliance average
  const overallAvgSim = useMemo(() => {
    if (itemsData.length === 0) return 0;
    const totalSim = itemsData.reduce((acc, curr) => acc + curr.simPct, 0);
    return Number((totalSim / itemsData.length).toFixed(1));
  }, [itemsData]);

  // Format percentage with comma like in image.png (e.g. 83,0%)
  const formatPct = (val: number) => {
    return val.toFixed(1).replace('.', ',') + '%';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6 space-y-6">
      
      {/* Header with Title & Tracer Selector Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg">
              <Layers className="w-4 h-4" />
            </span>
            <h3 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight">
              Conformidade por Item Verificado de Cada Tracer
            </h3>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Distribuição percentual detalhada de respostas (Sim, Não e Não se aplica) por critério auditado
            {unitName ? ` • ${unitName}` : ''}
            {selectedMonthName ? ` • ${selectedMonthName}` : ''}
          </p>
        </div>

        {/* Tracer Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60 self-start lg:self-auto">
          <button
            onClick={() => setActiveTracer('T01')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTracer === 'T01'
                ? 'bg-blue-600 text-white shadow-sm font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-300" />
            T01 - Beira Leito ({patientAudits.length})
          </button>
          
          <button
            onClick={() => setActiveTracer('T02')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTracer === 'T02'
                ? 'bg-amber-600 text-white shadow-sm font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-300" />
            T02 - Cirúrgico ({surgeryAudits.length})
          </button>

          <button
            onClick={() => setActiveTracer('T03')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTracer === 'T03'
                ? 'bg-indigo-600 text-white shadow-sm font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-300" />
            T03 - Medicação ({handAudits.length})
          </button>
        </div>
      </div>

      {/* Control bar: Search, Sort and Legend matching image.png */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70 p-3.5 rounded-xl border border-slate-150">
        
        {/* Visual Legend (Sim, Não, Não se aplica) */}
        <div className="flex items-center gap-5 text-xs font-bold text-slate-700">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-[#15803d] inline-block shadow-xs" />
            <span>Sim</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-[#cb3c3c] inline-block shadow-xs" />
            <span>Não</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-[#a1a1aa] inline-block shadow-xs" />
            <span>Não se aplica</span>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar critério..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 w-44 md:w-56"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-transparent outline-none cursor-pointer text-slate-700 text-xs font-bold"
            >
              <option value="default">Ordem Padrão</option>
              <option value="compliance_desc">Maior Conformidade (Sim %)</option>
              <option value="compliance_asc">Menor Conformidade (Críticos)</option>
            </select>
          </div>

          {/* Overall Average Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800 shadow-xs">
            <span className="text-slate-400 font-bold uppercase text-[9px]">Média Sim:</span>
            <span className="text-emerald-700">{formatPct(overallAvgSim)}</span>
          </div>

          {/* Export CSV Button */}
          <button
            onClick={() => {
              const tracerLabel = activeTracer === 'T01' 
                ? 'T01_Identificacao_Beira_Leito' 
                : activeTracer === 'T02' 
                  ? 'T02_Processos_Cirurgicos' 
                  : 'T03_Processos_Medicacao';
              exportItemComplianceToCSV(itemsData, tracerLabel, unitName, selectedMonthName);
            }}
            disabled={itemsData.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            title="Exportar percentuais de conformidade deste Tracer para CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Main Chart Area: Stacked Horizontal Bars (Faithful to image.png layout) */}
      {currentAuditsCount === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/40 space-y-2">
          <HelpCircle className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs font-black uppercase text-slate-400 tracking-wider">
            Nenhuma auditoria encontrada para este Tracer no período selecionado
          </p>
          <p className="text-[11px] text-slate-400">
            Altere os filtros de Mês/Unidade ou colete novos registros para gerar os gráficos.
          </p>
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          {filteredItems.map((item, index) => {
            const hasSim = item.simPct > 0;
            const hasNao = item.naoPct > 0;
            const hasNa = item.naoSeAplicaPct > 0;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className="group flex flex-col md:flex-row md:items-center gap-2 md:gap-4 hover:bg-slate-50/70 p-2 rounded-xl transition-colors"
              >
                {/* Item Label (Left Column) */}
                <div className="md:w-64 lg:w-80 shrink-0 text-left md:text-right pr-2">
                  <span 
                    className="text-xs lg:text-[13px] font-bold text-slate-800 leading-snug tracking-tight block"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  <span className="text-[9px] font-semibold text-slate-400 hidden group-hover:inline-block">
                    Total: {item.total} registros
                  </span>
                </div>

                {/* Vertical Separator Line */}
                <div className="hidden md:block w-px h-10 bg-slate-300 shrink-0" />

                {/* Stacked Horizontal Bar */}
                <div className="flex-1 flex items-center">
                  <div className="w-full h-11 bg-slate-100 rounded-none overflow-hidden flex shadow-xs relative border border-slate-200/50">
                    
                    {/* SIM Segment (Green) */}
                    {hasSim && (
                      <div
                        style={{ width: `${item.simPct}%` }}
                        className="h-full bg-[#15803d] flex items-center justify-center text-black font-black text-xs md:text-sm tracking-tight transition-all duration-500 overflow-hidden px-1 relative select-none"
                        title={`Sim: ${item.simCount} (${formatPct(item.simPct)})`}
                      >
                        {item.simPct >= 5 && (
                          <span className="truncate drop-shadow-xs font-black">
                            {formatPct(item.simPct)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* NÃO Segment (Red) */}
                    {hasNao && (
                      <div
                        style={{ width: `${item.naoPct}%` }}
                        className="h-full bg-[#cb3c3c] flex items-center justify-center text-black font-black text-xs md:text-sm tracking-tight transition-all duration-500 overflow-hidden px-1 relative select-none"
                        title={`Não: ${item.naoCount} (${formatPct(item.naoPct)})`}
                      >
                        {item.naoPct >= 5 && (
                          <span className="truncate drop-shadow-xs font-black">
                            {formatPct(item.naoPct)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* NÃO SE APLICA Segment (Gray) */}
                    {hasNa && (
                      <div
                        style={{ width: `${item.naoSeAplicaPct}%` }}
                        className="h-full bg-[#a1a1aa] flex items-center justify-center text-black font-black text-xs md:text-sm tracking-tight transition-all duration-500 overflow-hidden px-1 relative select-none"
                        title={`Não se aplica: ${item.naoSeAplicaCount} (${formatPct(item.naoSeAplicaPct)})`}
                      >
                        {item.naoSeAplicaPct >= 5 && (
                          <span className="truncate drop-shadow-xs font-black">
                            {formatPct(item.naoSeAplicaPct)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Fallback if 0 responses */}
                    {!hasSim && !hasNao && !hasNa && (
                      <div className="w-full h-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        Sem dados
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Summary Footer */}
      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-bold gap-2">
        <span>Exibindo {filteredItems.length} critérios auditados para o {activeTracer === 'T01' ? 'Tracer 01 (Beira Leito)' : activeTracer === 'T02' ? 'Tracer 02 (Cirurgia Segura)' : 'Tracer 03 (Processos de Medicação)'}</span>
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total de {currentAuditsCount} auditorias avaliadas no período</span>
      </div>

    </div>
  );
}
