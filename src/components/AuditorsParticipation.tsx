import { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { calculateAuditorsParticipation, AuditorShareResult } from '../lib/itemComplianceHelper';
import { HEALTH_UNITS } from '../lib/utils';
import { Users, UserCheck, Award, Search, Filter, Layers, TrendingUp, BarChart3 } from 'lucide-react';

interface Props {
  patientAudits: any[];
  surgeryAudits: any[];
  handAudits: any[];
  unitName?: string;
  selectedMonthName?: string;
  globalTracer?: string;
}

export default function AuditorsParticipation({
  patientAudits,
  surgeryAudits,
  handAudits,
  unitName,
  selectedMonthName,
  globalTracer
}: Props) {
  const [tracerFilter, setTracerFilter] = useState<'ALL' | 'T01' | 'T02' | 'T03'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (globalTracer === 'T01' || globalTracer === 'T02' || globalTracer === 'T03') {
      setTracerFilter(globalTracer);
    } else if (globalTracer === '') {
      setTracerFilter('ALL');
    }
  }, [globalTracer]);

  // Units map for display
  const unitsMap = useMemo(() => {
    const map: Record<string, string> = {};
    HEALTH_UNITS.forEach(u => {
      map[u.id] = u.name.replace('Hospital de Pediatria ', '').replace('Policlínica e Maternidade ', '').replace('Hospital ', '');
    });
    return map;
  }, []);

  // Compute auditor participation
  const allAuditors: AuditorShareResult[] = useMemo(() => {
    return calculateAuditorsParticipation(patientAudits, surgeryAudits, handAudits, unitsMap);
  }, [patientAudits, surgeryAudits, handAudits, unitsMap]);

  // Total audits based on active filter
  const totalAuditsInScope = useMemo(() => {
    if (tracerFilter === 'T01') return patientAudits.length;
    if (tracerFilter === 'T02') return surgeryAudits.length;
    if (tracerFilter === 'T03') return handAudits.length;
    return patientAudits.length + surgeryAudits.length + handAudits.length;
  }, [tracerFilter, patientAudits, surgeryAudits, handAudits]);

  // Filtered and recalculated for selected tracer
  const filteredAuditors = useMemo(() => {
    let list = allAuditors.map(a => {
      let count = a.totalCount;
      if (tracerFilter === 'T01') count = a.t01Count;
      if (tracerFilter === 'T02') count = a.t02Count;
      if (tracerFilter === 'T03') count = a.t03Count;

      const percentage = totalAuditsInScope > 0 
        ? Number(((count / totalAuditsInScope) * 100).toFixed(1)) 
        : 0;

      return {
        ...a,
        filteredCount: count,
        filteredPercentage: percentage
      };
    }).filter(a => a.filteredCount > 0);

    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      list = list.filter(a => 
        a.auditorName.toLowerCase().includes(q) || 
        a.professionalCategory.toLowerCase().includes(q) ||
        a.unitName.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => b.filteredCount - a.filteredCount);
  }, [allAuditors, tracerFilter, totalAuditsInScope, searchTerm]);

  const topAuditor = filteredAuditors[0];
  const avgAuditsPerAuditor = filteredAuditors.length > 0
    ? (totalAuditsInScope / filteredAuditors.length).toFixed(1)
    : '0';

  const formatPct = (val: number) => {
    return val.toFixed(1).replace('.', ',') + '%';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg">
              <Users className="w-4 h-4" />
            </span>
            <h3 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight">
              Percentual de Auditores por Tracer
            </h3>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Participação de cada auditor no total de registros e volume por processo assistencial
            {unitName ? ` • ${unitName}` : ''}
            {selectedMonthName ? ` • ${selectedMonthName}` : ''}
          </p>
        </div>

        {/* Tracer Selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60 self-start lg:self-auto">
          <button
            onClick={() => setTracerFilter('ALL')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              tracerFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Todos ({patientAudits.length + surgeryAudits.length + handAudits.length})
          </button>
          
          <button
            onClick={() => setTracerFilter('T01')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              tracerFilter === 'T01'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            T01 - Beira Leito ({patientAudits.length})
          </button>
          
          <button
            onClick={() => setTracerFilter('T02')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              tracerFilter === 'T02'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            T02 - Cirúrgico ({surgeryAudits.length})
          </button>

          <button
            onClick={() => setTracerFilter('T03')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              tracerFilter === 'T03'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            T03 - Medicação ({handAudits.length})
          </button>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Auditores Ativos</span>
          <p className="text-xl font-black text-slate-900">{filteredAuditors.length}</p>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Total de Registros</span>
          <p className="text-xl font-black text-blue-700">{totalAuditsInScope}</p>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Maior Participação</span>
          <p className="text-xl font-black text-emerald-700">
            {topAuditor ? formatPct(topAuditor.filteredPercentage) : '0%'}
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Média / Auditor</span>
          <p className="text-xl font-black text-slate-700">{avgAuditsPerAuditor}</p>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="flex items-center justify-between gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-150">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome do auditor, cargo ou unidade..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 font-medium"
          />
        </div>
        <span className="text-xs font-bold text-slate-500 hidden sm:inline-block">
          Mostrando {filteredAuditors.length} auditores
        </span>
      </div>

      {/* Auditors List with Share Bar */}
      {filteredAuditors.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/40 space-y-2">
          <Users className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs font-black uppercase text-slate-400">
            Nenhum auditor encontrado para os critérios selecionados
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAuditors.map((auditor, index) => {
            const isTop = index === 0 && auditor.filteredPercentage > 0;

            return (
              <motion.div
                key={auditor.auditorName + index}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className={`p-3.5 rounded-xl border transition-all ${
                  isTop 
                    ? 'bg-amber-50/30 border-amber-200 shadow-xs' 
                    : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  
                  {/* Auditor info */}
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                      isTop ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {isTop ? <Award className="w-4 h-4" /> : `#${index + 1}`}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs md:text-sm font-black text-slate-900 tracking-tight">
                          {auditor.auditorName}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {auditor.professionalCategory}
                        </span>
                        {isTop && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Maior Volume
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {auditor.unitName}
                      </span>
                    </div>
                  </div>

                  {/* Share % and Total audits */}
                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    {tracerFilter === 'ALL' && (
                      <div className="hidden md:flex items-center gap-1 text-[10px] font-bold text-slate-500">
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">T01: {auditor.t01Count}</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">T02: {auditor.t02Count}</span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">T03: {auditor.t03Count}</span>
                      </div>
                    )}

                    <div className="text-right">
                      <span className="text-sm md:text-base font-black text-slate-900">
                        {formatPct(auditor.filteredPercentage)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 block">
                        {auditor.filteredCount} {auditor.filteredCount === 1 ? 'registro' : 'registros'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar of participation share */}
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  {tracerFilter === 'ALL' ? (
                    <>
                      <div 
                        style={{ width: `${totalAuditsInScope > 0 ? (auditor.t01Count / totalAuditsInScope) * 100 : 0}%` }}
                        className="h-full bg-blue-500" 
                        title={`T01: ${auditor.t01Count}`}
                      />
                      <div 
                        style={{ width: `${totalAuditsInScope > 0 ? (auditor.t02Count / totalAuditsInScope) * 100 : 0}%` }}
                        className="h-full bg-amber-500" 
                        title={`T02: ${auditor.t02Count}`}
                      />
                      <div 
                        style={{ width: `${totalAuditsInScope > 0 ? (auditor.t03Count / totalAuditsInScope) * 100 : 0}%` }}
                        className="h-full bg-indigo-500" 
                        title={`T03: ${auditor.t03Count}`}
                      />
                    </>
                  ) : (
                    <div 
                      style={{ width: `${Math.min(100, auditor.filteredPercentage)}%` }}
                      className={`h-full ${
                        tracerFilter === 'T01' ? 'bg-blue-600' :
                        tracerFilter === 'T02' ? 'bg-amber-600' : 'bg-indigo-600'
                      }`}
                    />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400">
        <span>Filtro de visualização ativo: {tracerFilter === 'ALL' ? 'Todos os Tracers' : tracerFilter}</span>
        <span>Base calculada: {totalAuditsInScope} auditorias</span>
      </div>

    </div>
  );
}
