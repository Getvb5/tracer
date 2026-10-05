import React, { useState, useMemo } from 'react';
import { HEALTH_UNITS } from '../lib/utils';
import { useData } from '../context/DataContext';
import { 
  Building2, ChevronRight, Search, 
  Target, AlertCircle, CheckCircle2, 
  ArrowLeft, Download, Info, Database,
  BedDouble, Scissors, Pill
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';

interface UnitExplorerProps {
  isAdmin?: boolean;
  userUnit?: string | null;
}

export default function UnitExplorer({ isAdmin = true, userUnit = null }: UnitExplorerProps) {
  const effectiveDefaultUnit = !isAdmin && userUnit ? userUnit : null;
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(effectiveDefaultUnit);
  const [searchTerm, setSearchTerm] = useState('');

  React.useEffect(() => {
    if (!isAdmin && userUnit) {
      setSelectedUnitId(userUnit);
    }
  }, [isAdmin, userUnit]);
  
  const { handAudits, patientAudits, surgeryAudits, loading } = useData();

  const filteredUnits = useMemo(() => {
    let list = HEALTH_UNITS;
    if (!isAdmin && userUnit) {
      list = list.filter(u => u.id === userUnit);
    }
    return list.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.district.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, isAdmin, userUnit]);

  const selectedUnit = useMemo(() => 
    HEALTH_UNITS.find(u => u.id === selectedUnitId)
  , [selectedUnitId]);

  const unitData = useMemo(() => {
    if (!selectedUnitId) return null;
    
    // Normalize filtering to handle potential legacy or slightly varied field names
    const filterByUnit = (audits: any[]) => audits.filter(a => 
      a.unitId === selectedUnitId || 
      a.hospitalId === selectedUnitId || 
      a.unidadeId === selectedUnitId
    );

    const p = filterByUnit(patientAudits);
    const s = filterByUnit(surgeryAudits);
    const h = filterByUnit(handAudits);
    
    return {
      t01: { count: p.length },
      t02: { count: s.length },
      t03: { count: h.length },
      total: p.length + s.length + h.length,
      history: [...p, ...s, ...h].sort((a, b) => {
        const timeA = new Date(a.timestampStr || (a.timestamp?.toDate ? a.timestamp.toDate() : (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0))).getTime();
        const timeB = new Date(b.timestampStr || (b.timestamp?.toDate ? b.timestamp.toDate() : (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0))).getTime();
        return timeB - timeA;
      })
    };
  }, [selectedUnitId, patientAudits, surgeryAudits, handAudits]);

  const globalTotal = useMemo(() => {
    if (!isAdmin && userUnit) {
      return [...patientAudits, ...surgeryAudits, ...handAudits].filter(a => 
        a.unitId === userUnit || a.hospitalId === userUnit || a.unidadeId === userUnit
      ).length;
    }
    return patientAudits.length + surgeryAudits.length + handAudits.length;
  }, [patientAudits, surgeryAudits, handAudits, isAdmin, userUnit]);

  if (loading) return <div className="h-64 flex items-center justify-center text-slate-400">Carregando painel de unidades...</div>;

  return (
    <div className="space-y-6 flex flex-col h-full min-h-[600px]">
      <AnimatePresence mode="wait">
        {!selectedUnitId ? (
          <motion.div 
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">Visualização por Unidade</h1>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  {isAdmin ? 'Acesse os indicadores específicos de cada estabelecimento' : 'Indicadores específicos da sua unidade vinculada'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg">
                  <Database className="w-4 h-4 text-blue-400" />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">
                      {isAdmin ? 'Base Geral' : 'Total da Unidade'}
                    </span>
                    <span className="text-sm font-black tracking-tighter leading-none mt-1">{globalTotal} registros</span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Buscar unidade..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUnits.map((unit, i) => {
                const count = [...patientAudits, ...surgeryAudits, ...handAudits].filter(a => 
                  a.unitId === unit.id || a.hospitalId === unit.id || a.unidadeId === unit.id
                ).length;
                return (
                  <motion.div 
                    key={unit.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelectedUnitId(unit.id)}
                    className="theme-card cursor-pointer group hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-transform group-hover:translate-x-1" />
                    </div>
                    <h3 className="font-black text-xs text-slate-800 uppercase tracking-tight mb-1">{unit.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{unit.district}</p>
                    
                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">Auditorias</span>
                      <span className="text-xs font-black text-slate-900">{count}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <header className="flex items-center gap-4">
              {isAdmin && (
                <button 
                  onClick={() => setSelectedUnitId(null)}
                  className="p-2 bg-white border border-slate-200 text-slate-400 rounded-lg hover:bg-slate-50 hover:text-slate-600 transition-all cursor-pointer"
                  title="Voltar à lista de unidades"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <h1 className="text-lg font-black text-slate-900 tracking-tight uppercase leading-none">{selectedUnit?.name}</h1>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1">{selectedUnit?.district} • Indicadores Consolidados</p>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <UnitStatCard label="T01 - Beira Leito" color="blue" data={unitData?.t01} />
               <UnitStatCard label="T02 - Cirúrgico" color="amber" data={unitData?.t02} />
               <UnitStatCard label="T03 - Medicação" color="indigo" data={unitData?.t03} />
               <div className="theme-card bg-slate-900 text-white border-none flex flex-col justify-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total na Unidade</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tracking-tight">{unitData?.total}</span>
                    <span className="text-[10px] font-bold opacity-60">registros</span>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-8 space-y-6">
                 <div className="theme-card">
                   <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6 flex items-center gap-2">
                     <Target className="w-3.5 h-3.5" />
                     Distribuição de Registros por Tracer
                   </h3>
                   <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'T01', val: unitData?.t01.count, color: '#3b82f6' },
                        { name: 'T02', val: unitData?.t02.count, color: '#f59e0b' },
                        { name: 'T03', val: unitData?.t03.count, color: '#6366f1' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '10px', fontWeight: 'bold' }} />
                        <YAxis axisLine={false} tickLine={false} style={{ fontSize: '10px', fontWeight: 'bold' }} />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="val" radius={[4, 4, 0, 0]} barSize={40}>
                          { [0,1,2].map((i) => (
                            <Cell key={i} fill={['#3b82f6', '#f59e0b', '#6366f1'][i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                   </div>
                 </div>

                 <div className="theme-card">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Info className="w-3.5 h-3.5" />
                        Histórico Recente
                      </h3>
                      <button className="text-[9px] font-black text-blue-600 uppercase flex items-center gap-1.5 hover:underline transition-all">
                        <Download className="w-3 h-3" />
                        Baixar Unidade
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Tracer</th>
                            <th className="px-4 py-3 text-[9px] font-black uppercase text-slate-400 tracking-widest">Data</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {unitData?.history.slice(0, 15).map(audit => {
                             const getAuditDate = () => {
                               if (audit.timestampStr) return new Date(audit.timestampStr);
                               if (audit.timestamp?.toDate) return audit.timestamp.toDate();
                               if (audit.timestamp?.seconds) return new Date(audit.timestamp.seconds * 1000);
                               if (audit.timestamp) return new Date(audit.timestamp);
                               return new Date();
                             };
                             const auditDate = getAuditDate();
                             return (
                               <tr key={audit.id} className="hover:bg-slate-50/50 transition-colors">
                                 <td className="px-4 py-3">
                                   <div className="flex items-center gap-2">
                                      <div className={`w-1.5 h-1.5 rounded-full ${audit.type === 'T01' ? 'bg-blue-500' : audit.type === 'T02' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
                                      <span className="text-[10px] font-black text-slate-700 uppercase">{audit.type}</span>
                                      <span className="text-[9px] font-bold text-slate-400 hidden sm:inline truncate max-w-[100px]">{audit.tracerName?.split(' - ')[1] || 'Auditoria'}</span>
                                   </div>
                                 </td>
                                 <td className="px-4 py-3 text-[10px] font-bold text-slate-500">
                                   {auditDate.toLocaleDateString()} {auditDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                 </td>
                               </tr>
                             );
                          })}
                          {unitData?.history.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-4 py-12 text-center text-slate-400 text-[11px] italic">Sem dados registrados para esta unidade.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                 </div>
              </div>

              <div className="col-span-12 lg:col-span-4 space-y-6">
                <div className="theme-card bg-emerald-50 border-emerald-100 h-full">
                  <h3 className="text-[10px] font-black uppercase text-emerald-700 tracking-widest mb-2">Resumo da Unidade</h3>
                  <p className="text-xs text-emerald-900 font-medium leading-relaxed italic">
                    Esta visualização apresenta o volume bruto de dados sincronizados. Para navegar na integralidade dos registros, use o Explorador de Auditorias.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UnitStatCard({ label, data, color }: { label: string, data?: { count: number }, color: 'blue' | 'amber' | 'indigo' }) {
  const colors = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-100', bar: 'bg-blue-500' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100', bar: 'bg-amber-500' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', ring: 'ring-indigo-100', bar: 'bg-indigo-500' }
  }[color];

  // Render health-centric icons based on filter / tracer color
  const IconComponent = {
    blue: BedDouble,
    amber: Scissors,
    indigo: Pill
  }[color];

  return (
    <div className="theme-card border-none ring-1 ring-slate-100 shadow-sm flex flex-col justify-between">
      <div>
        <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3">{label}</h4>
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <span className={`text-2xl font-black tracking-tight ${colors.text}`}>{data?.count || 0}</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase">Total Registros</span>
          </div>
          <div className={`p-2 ${colors.bg} rounded-lg`}>
            <IconComponent className={`w-5 h-5 ${colors.text}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
