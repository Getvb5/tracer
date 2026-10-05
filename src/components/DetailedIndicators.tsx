import { useState } from 'react';
import ItemComplianceStackedChart from './ItemComplianceStackedChart';
import AuditorsParticipation from './AuditorsParticipation';
import { Layers, Users } from 'lucide-react';

interface Props {
  patientAudits: any[];
  surgeryAudits: any[];
  handAudits: any[];
  unitName?: string;
  selectedMonthName?: string;
  initialTab?: 'items' | 'auditors';
}

export default function DetailedIndicators({
  patientAudits,
  surgeryAudits,
  handAudits,
  unitName,
  selectedMonthName,
  initialTab = 'items'
}: Props) {
  const [activeTab, setActiveTab] = useState<'items' | 'auditors'>(initialTab);

  return (
    <div className="space-y-6">
      
      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
        <button
          onClick={() => setActiveTab('items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'items'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Conformidade por Item (Tracers)
        </button>

        <button
          onClick={() => setActiveTab('auditors')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'auditors'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Participação dos Auditores
        </button>
      </div>

      {/* Render Active Indicator Module */}
      {activeTab === 'items' && (
        <ItemComplianceStackedChart
          patientAudits={patientAudits}
          surgeryAudits={surgeryAudits}
          handAudits={handAudits}
          unitName={unitName}
          selectedMonthName={selectedMonthName}
        />
      )}

      {activeTab === 'auditors' && (
        <AuditorsParticipation
          patientAudits={patientAudits}
          surgeryAudits={surgeryAudits}
          handAudits={handAudits}
          unitName={unitName}
          selectedMonthName={selectedMonthName}
        />
      )}

    </div>
  );
}
