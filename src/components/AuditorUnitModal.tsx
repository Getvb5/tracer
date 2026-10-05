import React, { useState } from 'react';
import { HEALTH_UNITS } from '../lib/utils';
import { Building2, ShieldAlert, CheckCircle2, UserCheck, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuditorUnitModalProps {
  isOpen: boolean;
  userEmail: string;
  userName: string;
  onSave: (unitId: string, auditorName: string) => Promise<void>;
}

export default function AuditorUnitModal({
  isOpen,
  userEmail,
  userName,
  onSave
}: AuditorUnitModalProps) {
  const [selectedUnit, setSelectedUnit] = useState('');
  const [name, setName] = useState(userName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor, informe seu nome completo de auditor.');
      return;
    }
    if (!selectedUnit) {
      setError('Por favor, selecione a unidade de saúde à qual você pertence.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await onSave(selectedUnit, name.trim());
    } catch (err: any) {
      console.error('Erro ao vincular unidade de saúde:', err);
      setError('Ocorreu um erro ao salvar o vínculo. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const currentSelectedUnitObj = HEALTH_UNITS.find(u => u.id === selectedUnit);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden text-left"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-2xl text-blue-300">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-300">Vínculo Obrigatório</span>
              <h2 className="text-lg font-black tracking-tight uppercase text-white">Definição de Unidade de Saúde</h2>
            </div>
          </div>
          <p className="text-xs text-blue-100/80 font-medium mt-2 leading-relaxed">
            Como auditor de campo, você deve vincular seu perfil à sua respectiva unidade de saúde para visualizar e registrar auditorias de segurança do paciente.
          </p>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-red-700 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              E-mail de Acesso
            </label>
            <div className="px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 truncate">
              {userEmail}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Nome Completo do Auditor *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Dra. Maria Silva"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Unidade de Saúde de Atuação *
            </label>
            <select
              required
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all cursor-pointer"
            >
              <option value="">Selecione sua unidade...</option>
              {HEALTH_UNITS.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.type})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 font-medium">
              Todos os auditores vinculados a esta mesma unidade compartilharão a visão consolidada de dados e indicadores.
            </p>
          </div>

          {currentSelectedUnitObj && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-3">
              <UserCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-black text-blue-900 uppercase">
                  Unidade Selecionada: {currentSelectedUnitObj.name}
                </p>
                <p className="text-[10px] text-blue-700/90 font-medium mt-0.5">
                  Distrito: {currentSelectedUnitObj.district} • Tipo: {currentSelectedUnitObj.type}
                </p>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || !selectedUnit || !name.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving ? (
                <span>Salvando Vínculo...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Vínculo e Acessar Sistema</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
