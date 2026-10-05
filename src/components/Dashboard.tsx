import { useState, useEffect, useMemo } from 'react';
import { HEALTH_UNITS } from '../lib/utils';
import { useAuditsData } from '../context/DataContext';
import { 
  TrendingUp, ShieldCheck, Contact, LayoutList, ChevronRight,
  Clock, MapPin, Download, AlertTriangle, HelpCircle, Activity, LayoutGrid, CheckCircle2, XCircle,
  BedDouble, Scissors, Pill, Syringe, Target, Award, Check, Layers, Users, Building2, BarChart3,
  FileSpreadsheet
} from 'lucide-react';
import { motion } from 'motion/react';
import { MONTH_NAMES, getTracerDateMonth, getTracerDateDay } from './AuditExplorer';
import ItemComplianceStackedChart from './ItemComplianceStackedChart';
import AuditorsParticipation from './AuditorsParticipation';
import { exportAuditsToCSV, exportDashboardIndicatorsToCSV } from '../lib/csvExport';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ReferenceLine,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface Props {
  onExplore: () => void;
  userUnit: string | null;
  isAdmin: boolean;
  globalMonth?: string;
  globalQuarter?: string;
  globalDay?: string;
  globalUnit?: string;
  globalType?: string;
  globalTracer?: string;
  onSetMonth?: (m: string) => void;
  onSetQuarter?: (q: string) => void;
  onSetDay?: (d: string) => void;
  onSetUnit?: (u: string) => void;
  onSetType?: (t: string) => void;
  onSetTracer?: (t: string) => void;
  subFilter?: string;
  onSubViewChange?: (view: 'overview' | 'items_compliance' | 'auditors_share') => void;
}

function parseBRDate(str: string) {
  if (!str || typeof str !== 'string') return null;
  // Flexible regex for DD/MM/YYYY HH:mm:ss (handles 1 or 2 digits for day, month, hour, min, sec)
  const parts = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!parts) return null;
  return new Date(
    parseInt(parts[3]),
    parseInt(parts[2]) - 1,
    parseInt(parts[1]),
    parseInt(parts[4]),
    parseInt(parts[5]),
    parseInt(parts[6] || '0')
  );
}

const getRowValue = (data: any, header: string) => {
  if (!data) return '-';
  const h = header.trim().toLowerCase();
  // Find key that matches header after trimming and ignoring case
  const entry = Object.entries(data).find(([k]) => {
    const keyNormalized = k.trim().toLowerCase().replace(/:$/, '');
    return keyNormalized === h;
  });
  return entry ? entry[1] : '-';
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md min-w-[180px] text-left">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => {
            const labelMap: any = {
              "Total Geral": "Total Geral",
              "T01 - Beira Leito": "T01 - Beira Leito",
              "T02 - Proc. Cirúrgicos": "T02 - Cirúrgicos",
              "T03 - Proc. Medicação": "T03 - Medicação"
            };
            const displayLabel = labelMap[entry.name] || entry.name;
            return (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.stroke || '#64748b' }} />
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">{displayLabel}</span>
                </div>
                <span className="text-[11px] font-extrabold text-slate-900">{entry.value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export default function Dashboard({ 
  onExplore, 
  userUnit, 
  isAdmin, 
  globalMonth = '', 
  globalQuarter = '',
  globalDay = '',
  globalUnit = '', 
  globalType = '',
  globalTracer = '',
  onSetMonth,
  onSetQuarter,
  onSetDay,
  onSetUnit,
  onSetType,
  onSetTracer,
  subFilter = '',
  onSubViewChange
}: Props) {
  const { handAudits, patientAudits, surgeryAudits, loading } = useAuditsData();
  const [dashboardView, setDashboardView] = useState<'overview' | 'items_compliance' | 'auditors_share'>('overview');

  useEffect(() => {
    if (subFilter === 'items' || subFilter === 'items_compliance') {
      setDashboardView('items_compliance');
    } else if (subFilter === 'auditors' || subFilter === 'auditors_share') {
      setDashboardView('auditors_share');
    } else {
      setDashboardView('overview');
    }
  }, [subFilter]);

  const [exporting, setExporting] = useState(false);
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('area');
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPDF = async () => {
    setExportError(null);
    setExporting(true);
    
    // Store original inline style attribute values to restore them later
    const originalInlineStyles = new Map<Element, string | null>();
    const elementsToRestore: HTMLElement[] = [];
    const sheetsToRestore: { sheet: CSSStyleSheet; wasDisabled: boolean }[] = [];
    const temporaryStyleElements: HTMLStyleElement[] = [];
    
    try {
      const element = document.getElementById('dashboard-pdf-report');
      if (!element) {
        throw new Error('Elemento de relatório PDF não encontrado');
      }

      // Convert OKLCH color strings to fallback sRGB strings
      const convertOklchToRgb = (oklchStr: string): string => {
        if (!oklchStr || typeof oklchStr !== 'string' || !oklchStr.includes('oklch')) {
          return oklchStr;
        }
        try {
          return oklchStr.replace(/oklch\(([^)]+)\)/gi, (match, inner) => {
            try {
              // Parse values. In OKLCH they could be space-separated or comma-separated
              // We replace any slashes with spaces, then split by spaces or commas
              const parts = inner.replace(/\//g, ' ').trim().split(/[\s,]+/);
              
              if (parts.length < 3) {
                return 'rgb(79, 70, 229)'; // Fallback safe color (Indigo)
              }
              
              const p1 = parts[0];
              const p2 = parts[1];
              const p3 = parts[2];
              const p4 = parts[3]; // alpha if present
              
              let l = parseFloat(p1);
              if (p1.includes('%')) l /= 100;
              let c = parseFloat(p2);
              if (p2.includes('%')) c /= 100;
              let h = parseFloat(p3);
              
              let a = 1;
              if (p4) {
                a = parseFloat(p4);
                if (p4.includes('%')) a /= 100;
              }

              if (isNaN(l) || isNaN(c) || isNaN(h)) {
                return 'rgb(79, 70, 229)'; // Fallback safe color
              }

              // hue to radians
              const hRad = (h * Math.PI) / 180;
              const a_lab = c * Math.cos(hRad);
              const b_lab = c * Math.sin(hRad);

              // OKLab to LMS
              const l_ = l + 0.3963377774 * a_lab + 0.2158037573 * b_lab;
              const m_ = l - 0.1055613458 * a_lab - 0.0638541728 * b_lab;
              const s_ = l - 0.0894841775 * a_lab - 1.2914855480 * b_lab;

              // LMS to linear RGB
              const l3 = l_ * l_ * l_;
              const m3 = m_ * m_ * m_;
              const s3 = s_ * s_ * s_;

              let r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
              let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
              let b = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

              // Linear RGB to sRGB
              const gamma = (val: number) => (val <= 0.0031308 ? 12.92 * val : 1.055 * Math.pow(val, 1 / 2.4) - 0.055);
              
              r = Math.round(Math.max(0, Math.min(1, gamma(r))) * 255);
              g = Math.round(Math.max(0, Math.min(1, gamma(g))) * 255);
              b = Math.round(Math.max(0, Math.min(1, gamma(b))) * 255);

              if (isNaN(r) || isNaN(g) || isNaN(b)) {
                return 'rgb(79, 70, 229)'; // Fallback safe color
              }

              return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
            } catch {
              return 'rgb(79, 70, 229)';
            }
          });
        } catch (e) {
          return oklchStr;
        }
      };

      // 1. Scan and transform all active stylesheets on the page to prevent html2canvas parsing errors with "oklch" colors
      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        if (!sheet) continue;
        try {
          const originalText = Array.from(sheet.cssRules)
            .map(rule => rule.cssText)
            .join('\n');
            
          if (originalText && originalText.includes('oklch')) {
            const rgbText = convertOklchToRgb(originalText);
            
            // Create a new style tag with transformed non-oklch styles
            const tempStyle = document.createElement('style');
            tempStyle.setAttribute('data-html2canvas-oklch-fallback', 'true');
            tempStyle.textContent = rgbText;
            document.head.appendChild(tempStyle);
            temporaryStyleElements.push(tempStyle);
            
            // Disable original stylesheet
            sheetsToRestore.push({ sheet, wasDisabled: sheet.disabled });
            sheet.disabled = true;
          }
        } catch (e) {
          console.warn('[PDF Export] Could not dynamically process stylesheet due to CORS or read constraints:', e);
        }
      }

      // 2. Traverse element and all descendants, override OKLCH colors with inline RGB styles
      const descendants = element.querySelectorAll('*');
      const allElements = [element, ...Array.from(descendants)];
      
      for (const el of allElements) {
        const htmlEl = el as HTMLElement;
        originalInlineStyles.set(htmlEl, htmlEl.getAttribute('style'));
        elementsToRestore.push(htmlEl);
        
        try {
          const computed = window.getComputedStyle(htmlEl);
          const propertiesToInspect = [
            'color', 
            'background-color', 
            'border-color', 
            'border-top-color', 
            'border-right-color', 
            'border-bottom-color', 
            'border-left-color',
            'fill',
            'stroke'
          ];
          
          for (const prop of propertiesToInspect) {
            const val = computed.getPropertyValue(prop);
            if (val && val.includes('oklch')) {
              const rgbVal = convertOklchToRgb(val);
              htmlEl.style.setProperty(prop, rgbVal, 'important');
            }
          }
        } catch (styleErr) {
          console.warn('Could not process styles for element:', htmlEl, styleErr);
        }
      }

      // Aguarda estabilização de renderização
      await new Promise((resolve) => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      
      // Suporte robusto a imports nomeados/padrão de jsPDF
      let JsPDFClass = jsPDF;
      if (!JsPDFClass || typeof JsPDFClass !== 'function') {
        const anyJsPDF = jsPDF as any;
        if (anyJsPDF.jsPDF && typeof anyJsPDF.jsPDF === 'function') {
          JsPDFClass = anyJsPDF.jsPDF;
        } else if (anyJsPDF.default && typeof anyJsPDF.default === 'function') {
          JsPDFClass = anyJsPDF.default;
        }
      }

      if (!JsPDFClass || typeof JsPDFClass !== 'function') {
        throw new Error('Não foi possível inicializar a biblioteca de criação de arquivos PDF (jsPDF)');
      }

      const pdf = new JsPDFClass({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      let pName = '-geral';
      if (globalMonth !== '') {
        pName = `-${MONTH_NAMES[parseInt(globalMonth)].toLowerCase()}`;
      } else if (globalQuarter && globalQuarter !== '') {
        pName = `-trimestre-${globalQuarter}`;
      }
      pdf.save(`relatorio-executivo-tracers${pName}.pdf`);
    } catch (err: any) {
      console.error('Falha ao exportar PDF:', err);
      setExportError(err?.message || 'Erro inesperado ao gerar o arquivo PDF');
      setTimeout(() => setExportError(null), 8000);
    } finally {
      // Restore original stylesheets
      for (const item of sheetsToRestore) {
        try {
          item.sheet.disabled = item.wasDisabled;
        } catch (restoreErr) {
          console.error('[PDF Export] Error restoring stylesheet:', restoreErr);
        }
      }
      for (const tempEl of temporaryStyleElements) {
        try {
          tempEl.remove();
        } catch (restoreErr) {
          console.error('[PDF Export] Error removing temp element:', restoreErr);
        }
      }

      // Always restore style attributes safely
      for (const htmlEl of elementsToRestore) {
        try {
          const orig = originalInlineStyles.get(htmlEl);
          if (orig === null) {
            htmlEl.removeAttribute('style');
          } else if (typeof orig === 'string') {
            htmlEl.setAttribute('style', orig);
          }
        } catch (restoreErr) {
          console.error('Error restoring style for element:', htmlEl, restoreErr);
        }
      }
      setExporting(false);
    }
  };

  const { filteredHand, filteredPatient, filteredSurgery } = useMemo(() => {
    let hands = handAudits;
    let patients = patientAudits;
    let surgeries = surgeryAudits;

    const targetUnit = isAdmin ? (globalUnit || '') : (userUnit || '');
    if (targetUnit) {
      const filter = (a: any) => a.unitId === targetUnit || a.hospitalId === targetUnit || a.unidadeId === targetUnit;
      hands = hands.filter(filter);
      patients = patients.filter(filter);
      surgeries = surgeries.filter(filter);
    } else if (!isAdmin) {
      hands = [];
      patients = [];
      surgeries = [];
    }

    if (globalMonth !== '') {
      const targetMonth = parseInt(globalMonth);
      hands = hands.filter(a => getTracerDateMonth(a) === targetMonth);
      patients = patients.filter(a => getTracerDateMonth(a) === targetMonth);
      surgeries = surgeries.filter(a => getTracerDateMonth(a) === targetMonth);
      
      if (globalDay && globalDay !== '') {
        const targetDay = parseInt(globalDay);
        hands = hands.filter(a => getTracerDateDay(a) === targetDay);
        patients = patients.filter(a => getTracerDateDay(a) === targetDay);
        surgeries = surgeries.filter(a => getTracerDateDay(a) === targetDay);
      }
    } else if (globalQuarter && globalQuarter !== '') {
      const getMonthsForQuarter = (q: string): number[] => {
        if (q === '1') return [0, 1, 2];
        if (q === '2') return [3, 4, 5];
        if (q === '3') return [6, 7, 8];
        if (q === '4') return [9, 10, 11];
        return [];
      };
      const validMonths = getMonthsForQuarter(globalQuarter);
      const qFilter = (a: any) => {
        const m = getTracerDateMonth(a);
        return m !== null && validMonths.includes(m);
      };
      hands = hands.filter(qFilter);
      patients = patients.filter(qFilter);
      surgeries = surgeries.filter(qFilter);
    }

    if (globalType === 'Hospitalar') {
      const hospitals = HEALTH_UNITS.filter(u => u.type === 'Hospital').map(u => u.id);
      const hFilter = (a: any) => hospitals.includes(a.unitId || a.hospitalId || a.unidadeId);
      hands = hands.filter(hFilter);
      patients = patients.filter(hFilter);
      surgeries = surgeries.filter(hFilter);
    } else if (globalType === 'Ambulatorial') {
      const polys = HEALTH_UNITS.filter(u => u.type !== 'Hospital').map(u => u.id);
      const pFilter = (a: any) => polys.includes(a.unitId || a.hospitalId || a.unidadeId);
      hands = hands.filter(pFilter);
      patients = patients.filter(pFilter);
      surgeries = surgeries.filter(pFilter);
    }

    if (globalTracer === 'T01') {
      hands = [];
      surgeries = [];
    } else if (globalTracer === 'T02') {
      patients = [];
      hands = [];
    } else if (globalTracer === 'T03') {
      patients = [];
      surgeries = [];
    }

    return {
      filteredHand: hands,
      filteredPatient: patients,
      filteredSurgery: surgeries
    };
  }, [handAudits, patientAudits, surgeryAudits, isAdmin, userUnit, globalMonth, globalQuarter, globalDay, globalUnit, globalType, globalTracer]);

  const advancedStats = useMemo(() => {
    const combined = [...filteredHand, ...filteredPatient, ...filteredSurgery];
    const sectorCounts: Record<string, number> = {};
    const professionalCounts: Record<string, number> = {};

    combined.forEach(a => {
      const data = a.rawData || (a.sourceRowHash ? (typeof a.sourceRowHash === 'string' ? JSON.parse(a.sourceRowHash) : a.sourceRowHash) : {});

      // Sector calculation
      const sec = (a.sector || a.setor || data['03- Setor:'] || data['03- Setor'] || data['Setor'] || '-').toString().trim();
      if (sec && sec !== '-') {
        sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
      }

      // Professional Category calculation
      let prof = a.professionalCategory;
      if (!prof || prof === '-' || typeof prof !== 'string') {
        for (const [k, v] of Object.entries(data)) {
          const kNorm = k.toLowerCase().replace(/^[0-9]+[-\s]+/, '').replace(/:$/, '').trim();
          if (kNorm.includes('categoria profissional') || kNorm === 'categoria' || kNorm === 'cargo' || kNorm === 'funcao') {
            if (v && typeof v === 'string' && v.trim() !== '' && v.trim() !== '-') {
              prof = v.trim();
              break;
            }
          }
        }
      }

      if (!prof || prof === '-' || typeof prof !== 'string') {
        const auditor = a.auditorName || a.auditor || data['06- Nome Completo do Auditor:'] || data['06- Nome Completo do Auditor'] || data['04- Nome Completo do Auditor:'];
        if (auditor && typeof auditor === 'string') {
          const lower = auditor.toLowerCase();
          if (lower.includes('enf') || lower.includes('tecn')) {
            prof = 'ENFERMAGEM';
          } else if (lower.includes('dr.') || lower.includes('dra.') || lower.includes('med')) {
            prof = 'MÉDICO';
          }
        }
      }

      if (!prof || prof === '-' || typeof prof !== 'string') {
        prof = 'ENFERMAGEM';
      }

      let p = prof.trim().toUpperCase();
      // Standardize categories for better classification
      if (p.includes('ENF') || p.includes('OBSTET')) p = 'ENFERMAGEM';
      else if (p.includes('MED') || p.includes('CIRUR') || p.includes('ANEST')) p = 'MÉDICO';
      else if (p.includes('FISIO') || p.includes('FISI')) p = 'FISIOTERAPIA';
      else if (p.includes('TECN') || p.includes('AUX')) p = 'TÉCNICO DE ENFERMAGEM';
      else {
        p = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      }
      
      professionalCounts[p] = (professionalCounts[p] || 0) + 1;
    });

    const sortedProfs = Object.entries(professionalCounts).sort((a, b) => b[1] - a[1]);
    const topProfessional = sortedProfs[0];

    let topProfessionalStr = 'N/A';
    if (topProfessional) {
      topProfessionalStr = topProfessional[0];
    }

    const sortedSectors = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]);
    const topSectorStr = sortedSectors[0] ? sortedSectors[0][0] : 'N/A';

    return {
      topSector: topSectorStr,
      topProfessional: topProfessionalStr
    };
  }, [filteredHand, filteredPatient, filteredSurgery]);

  const checkVal = (v: any) => {
    if (v === true) return true;
    if (!v) return false;
    const s = String(v).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s === 'SIM' || s === 'CONFORME' || s === 'ADEQUADO' || s === 'PRESENTE' || s === 'REALIZADO' || s === '1' || s.startsWith('SIM');
  };

  const complianceMetrics = useMemo(() => {
    let t01Total = filteredPatient.length;
    let t01HasWristband = 0;
    let t01WristbandLegible = 0;
    let t01CorrectData = 0;

    filteredPatient.forEach(a => {
      const raw = a.rawData || (a.sourceRowHash ? (typeof a.sourceRowHash === 'object' ? a.sourceRowHash : (typeof a.sourceRowHash === 'string' ? (() => { try { return JSON.parse(a.sourceRowHash); } catch { return {}; } })() : {})) : {});
      const hasW = a.hasWristband !== undefined ? a.hasWristband : (raw['Paciente identificado com pulseira branca?'] || raw['Paciente identificado com pulseira branca'] || raw['07- Paciente identificado com pulseira branca?']);
      const legW = a.wristbandLegible !== undefined ? a.wristbandLegible : (raw['A pulseira de identificação está legível?'] || raw['A pulseira de identificação está legível'] || raw['08- A pulseira de identificação está legível?']);
      const corD = a.correctData !== undefined ? a.correctData : (raw['A pulseira de identificação preenchida adequadamente?'] || raw['A pulseira de identificação preenchida adequadamente'] || raw['09- A pulseira de identificação preenchida adequadamente?']);

      if (checkVal(hasW)) t01HasWristband++;
      if (checkVal(legW)) t01WristbandLegible++;
      if (checkVal(corD)) t01CorrectData++;
    });

    let t02Total = filteredSurgery.length;
    let t02SignIn = 0;
    let t02TimeOut = 0;
    let t02SignOut = 0;

    filteredSurgery.forEach(a => {
      const raw = a.rawData || (a.sourceRowHash ? (typeof a.sourceRowHash === 'object' ? a.sourceRowHash : (typeof a.sourceRowHash === 'string' ? (() => { try { return JSON.parse(a.sourceRowHash); } catch { return {}; } })() : {})) : {});
      const sIn = a.signIIn !== undefined ? a.signIIn : (raw['Check list de cirurgia segura aplicado antes da indução anestésica?'] || raw['Check list de cirurgia segura aplicado antes da indução anestésica']);
      const tOut = a.timeOut !== undefined ? a.timeOut : (raw['Check list de cirurgia segura aplicado antes da incisão cirúrgica?'] || raw['Check list de cirurgia segura aplicado antes da incisão cirúrgica']);
      const sOut = a.signOut !== undefined ? a.signOut : (raw['Check list de cirurgia segura aplicado antes de sair da sala?'] || raw['Check list de cirurgia segura aplicado antes de sair da sala']);

      if (checkVal(sIn)) t02SignIn++;
      if (checkVal(tOut)) t02TimeOut++;
      if (checkVal(sOut)) t02SignOut++;
    });

    let t03Total = filteredHand.length;
    let t03Compliant = 0;

    filteredHand.forEach(a => {
      const raw = a.rawData || (a.sourceRowHash ? (typeof a.sourceRowHash === 'object' ? a.sourceRowHash : (typeof a.sourceRowHash === 'string' ? (() => { try { return JSON.parse(a.sourceRowHash); } catch { return {}; } })() : {})) : {});
      const comp = a.compliant !== undefined ? a.compliant : (a.handHygiene !== undefined ? a.handHygiene : (raw['Houve higienização das mãos imediatamente antes da administração da medicação ?'] || raw['Houve higienização das mãos imediatamente antes da administração da medicação']));

      if (checkVal(comp)) t03Compliant++;
    });

    const totalAudits = t01Total + t02Total + t03Total;
    const totalConformingPoints = t01HasWristband + t01WristbandLegible + t01CorrectData + t02SignIn + t02TimeOut + t02SignOut + t03Compliant;
    const totalPossiblePoints = (t01Total * 3) + (t02Total * 3) + t03Total;
    const overallCompliancePct = totalPossiblePoints > 0 ? Math.min(100, Math.round((totalConformingPoints / totalPossiblePoints) * 100)) : 0;

    return {
      t01Total,
      t01HasWristband,
      t01WristbandLegible,
      t01CorrectData,
      t02Total,
      t02SignIn,
      t02TimeOut,
      t02SignOut,
      t03Total,
      t03Compliant,
      overallCompliancePct,
      totalAudits
    };
  }, [filteredPatient, filteredSurgery, filteredHand]);

  const itemsComplianceData = useMemo(() => {
    const { 
      t01Total, t01HasWristband, t01WristbandLegible, t01CorrectData,
      t02Total, t02SignIn, t02TimeOut, t02SignOut,
      t03Total, t03Compliant
    } = complianceMetrics;

    return [
      { name: 'Pulseira Branca', pct: t01Total > 0 ? Math.min(100, Math.round((t01HasWristband / t01Total) * 100)) : 0, color: '#3b82f6', tracer: 'T01' },
      { name: 'Pulseira Legível', pct: t01Total > 0 ? Math.min(100, Math.round((t01WristbandLegible / t01Total) * 100)) : 0, color: '#3b82f6', tracer: 'T01' },
      { name: 'Dados Corretos', pct: t01Total > 0 ? Math.min(100, Math.round((t01CorrectData / t01Total) * 100)) : 0, color: '#3b82f6', tracer: 'T01' },
      { name: 'Sign-In Anestesia', pct: t02Total > 0 ? Math.min(100, Math.round((t02SignIn / t02Total) * 100)) : 0, color: '#f59e0b', tracer: 'T02' },
      { name: 'Time-Out Cirurgia', pct: t02Total > 0 ? Math.min(100, Math.round((t02TimeOut / t02Total) * 100)) : 0, color: '#f59e0b', tracer: 'T02' },
      { name: 'Sign-Out Saída', pct: t02Total > 0 ? Math.min(100, Math.round((t02SignOut / t02Total) * 100)) : 0, color: '#f59e0b', tracer: 'T02' },
      { name: 'Proc. Medicação', pct: t03Total > 0 ? Math.min(100, Math.round((t03Compliant / t03Total) * 100)) : 0, color: '#6366f1', tracer: 'T03' },
    ];
  }, [complianceMetrics]);

  const unitsComplianceData = useMemo(() => {
    const effectiveUnit = isAdmin ? (globalUnit || '') : (userUnit || '');
    const unitsList = effectiveUnit
      ? HEALTH_UNITS.filter(u => u.id === effectiveUnit)
      : HEALTH_UNITS;

    const unitStats: Record<string, { total: number; conforming: number; name: string }> = {};

    unitsList.forEach(u => {
      unitStats[u.id] = { total: 0, conforming: 0, name: u.name };
    });

    const addAuditToUnit = (unitId: string | undefined, conPoints: number, possPoints: number) => {
      if (!unitId) return;
      if (effectiveUnit && unitId !== effectiveUnit) return;
      if (!unitStats[unitId]) {
        const found = HEALTH_UNITS.find(u => u.id === unitId);
        unitStats[unitId] = { total: 0, conforming: 0, name: found ? found.name : unitId };
      }
      unitStats[unitId].total += possPoints;
      unitStats[unitId].conforming += conPoints;
    };

    filteredPatient.forEach(a => {
      const uid = a.unitId || a.hospitalId || a.unidadeId;
      const raw = a.rawData || (a.sourceRowHash ? (typeof a.sourceRowHash === 'object' ? a.sourceRowHash : (typeof a.sourceRowHash === 'string' ? (() => { try { return JSON.parse(a.sourceRowHash); } catch { return {}; } })() : {})) : {});
      let con = 0;
      const hasW = a.hasWristband !== undefined ? a.hasWristband : (raw['Paciente identificado com pulseira branca?'] || raw['Paciente identificado com pulseira branca'] || raw['07- Paciente identificado com pulseira branca?']);
      const legW = a.wristbandLegible !== undefined ? a.wristbandLegible : (raw['A pulseira de identificação está legível?'] || raw['A pulseira de identificação está legível'] || raw['08- A pulseira de identificação está legível?']);
      const corD = a.correctData !== undefined ? a.correctData : (raw['A pulseira de identificação preenchida adequadamente?'] || raw['A pulseira de identificação preenchida adequadamente'] || raw['09- A pulseira de identificação preenchida adequadamente?']);
      if (checkVal(hasW)) con++;
      if (checkVal(legW)) con++;
      if (checkVal(corD)) con++;
      addAuditToUnit(uid, con, 3);
    });

    filteredSurgery.forEach(a => {
      const uid = a.unitId || a.hospitalId || a.unidadeId;
      const raw = a.rawData || (a.sourceRowHash ? (typeof a.sourceRowHash === 'object' ? a.sourceRowHash : (typeof a.sourceRowHash === 'string' ? (() => { try { return JSON.parse(a.sourceRowHash); } catch { return {}; } })() : {})) : {});
      let con = 0;
      const sIn = a.signIIn !== undefined ? a.signIIn : (raw['Check list de cirurgia segura aplicado antes da indução anestésica?'] || raw['Check list de cirurgia segura aplicado antes da indução anestésica']);
      const tOut = a.timeOut !== undefined ? a.timeOut : (raw['Check list de cirurgia segura aplicado antes da incisão cirúrgica?'] || raw['Check list de cirurgia segura aplicado antes da incisão cirúrgica']);
      const sOut = a.signOut !== undefined ? a.signOut : (raw['Check list de cirurgia segura aplicado antes de sair da sala?'] || raw['Check list de cirurgia segura aplicado antes de sair da sala']);
      if (checkVal(sIn)) con++;
      if (checkVal(tOut)) con++;
      if (checkVal(sOut)) con++;
      addAuditToUnit(uid, con, 3);
    });

    filteredHand.forEach(a => {
      const uid = a.unitId || a.hospitalId || a.unidadeId;
      const raw = a.rawData || (a.sourceRowHash ? (typeof a.sourceRowHash === 'object' ? a.sourceRowHash : (typeof a.sourceRowHash === 'string' ? (() => { try { return JSON.parse(a.sourceRowHash); } catch { return {}; } })() : {})) : {});
      const comp = a.compliant !== undefined ? a.compliant : (a.handHygiene !== undefined ? a.handHygiene : (raw['Houve higienização das mãos imediatamente antes da administração da medicação ?'] || raw['Houve higienização das mãos imediatamente antes da administração da medicação']));
      let con = checkVal(comp) ? 1 : 0;
      addAuditToUnit(uid, con, 1);
    });

    return Object.entries(unitStats)
      .map(([id, s]) => {
        const pct = s.total > 0 ? Math.min(100, Math.round((s.conforming / s.total) * 100)) : 0;
        return {
          id,
          name: s.name.replace('Hospital de Pediatria ', '').replace('Policlínica e Maternidade ', '').replace('Policlínica ', '').replace('Hospital ', ''),
          compliance: pct,
          volume: s.total
        };
      })
      .filter(u => u.volume > 0)
      .sort((a, b) => b.compliance - a.compliance);
  }, [filteredPatient, filteredSurgery, filteredHand, isAdmin, globalUnit, userUnit]);

  const professionalDistributionData = useMemo(() => {
    const counts: Record<string, number> = {};
    const combined = [...filteredHand, ...filteredPatient, ...filteredSurgery];
    
    combined.forEach(a => {
      const data不易 = a.rawData || (a.sourceRowHash ? (typeof a.sourceRowHash === 'object' ? a.sourceRowHash : (typeof a.sourceRowHash === 'string' ? (() => { try { return JSON.parse(a.sourceRowHash); } catch { return {}; } })() : {})) : {});
      let prof = a.professionalCategory || getRowValue(data不易, 'CATEGORIA PROFISSIONAL') || getRowValue(data不易, 'CATEGORIA') || getRowValue(data不易, 'FUNÇÃO') || getRowValue(data不易, 'CARGO');
      if (prof && prof !== '-' && typeof prof === 'string') {
        let p = prof.trim().toLowerCase();
        if (p.includes('enf') || p.includes('obstet')) p = 'Enfermagem';
        else if (p.includes('med') || p.includes('cirur') || p.includes('anest')) p = 'Médico';
        else if (p.includes('fisio') || p.includes('fisi')) p = 'Fisioterapia';
        else if (p.includes('tecn') || p.includes('aux')) p = 'Téct. Enfermagem';
        else p = p.charAt(0).toUpperCase() + p.slice(1);
        
        counts[p] = (counts[p] || 0) + 1;
      } else {
        counts['Enfermagem'] = (counts['Enfermagem'] || 0) + 1; // Default fallback representation helper
      }
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 5) {
      const top4 = sorted.slice(0, 4);
      const rest = sorted.slice(4).reduce((sum, item) => sum + item[1], 0);
      top4.push(['Outros', rest]);
      return top4.map(([name, value]) => ({ name, value }));
    }
    return sorted.map(([name, value]) => ({ name, value }));
  }, [filteredHand, filteredPatient, filteredSurgery]);

  const tracerShareData = useMemo(() => {
    return [
      { name: 'T01 - Beira Leito', value: filteredPatient.length, color: '#3b82f6' },
      { name: 'T02 - Proc. Cirúrgicos', value: filteredSurgery.length, color: '#f59e0b' },
      { name: 'T03 - Proc. Medicação', value: filteredHand.length, color: '#6366f1' }
    ].filter(t => t.value > 0);
  }, [filteredPatient, filteredSurgery, filteredHand]);

  const strategicInsightsList = useMemo(() => {
    const { 
      t01Total, t01HasWristband, t01WristbandLegible, t01CorrectData,
      t02Total, t02SignIn, t02TimeOut, t02SignOut,
      t03Total, t03Compliant
    } = complianceMetrics;

    const insights = [];

    if (t01Total > 0) {
      const wristbandPct = Math.round((t01HasWristband / t01Total) * 100);
      const legiblePct = Math.round((t01WristbandLegible / t01Total) * 100);
      const dataPct = Math.round((t01CorrectData / t01Total) * 100);
      
      if (wristbandPct < 85) {
        insights.push({
          type: 'danger',
          title: 'Presença de Pulseira Crítica',
          desc: `O indicador de pulseira branca está em ${wristbandPct}%. É recomendável auditar com urgência as rotinas de admissão imediata para zerar riscos de desidentificação.`,
          tracer: 'T01'
        });
      } else if (legiblePct < 90) {
        insights.push({
          type: 'warning',
          title: 'Legibilidade de Identificação Defasada',
          desc: `A legibilidade das pulseiras de beira leito está em ${legiblePct}%. Problema secundário a desgaste de impressão plástica. Sugere-se revisão das fitas térmicas.`,
          tracer: 'T01'
        });
      } else if (dataPct < 90) {
        insights.push({
          type: 'warning',
          title: 'Dados Incompletos nas Pulseiras',
          desc: `O preenchimento adequado dos dados de pulseiras está em ${dataPct}%. Reforçar junto à recepção a importância de imprimir Nome Completo e Prontuário legíveis.`,
          tracer: 'T01'
        });
      } else {
        insights.push({
          type: 'success',
          title: 'Conformidade Excepcional de Identificação',
          desc: `A identificação de beira leito mantém os três índices de controle acima da meta regulamentar de 90%. Ótimo engajamento das enfermarias.`,
          tracer: 'T01'
        });
      }
    }

    if (t02Total > 0) {
      const signInPct = Math.round((t02SignIn / t02Total) * 100);
      const timeOutPct = Math.round((t02TimeOut / t02Total) * 100);
      const signOutPct = Math.round((t02SignOut / t02Total) * 100);

      const lowest = Math.min(signInPct, timeOutPct, signOutPct);
      if (lowest === signOutPct && signOutPct < 85) {
        insights.push({
          type: 'danger',
          title: 'Gargalo Assistencial no Sign-Out',
          desc: `O Sign-Out cirúrgico antes da saída de sala apresenta conformidade de apenas ${signOutPct}%. Comum por encerramento apressado. Exige foco em contagem de gazes.`,
          tracer: 'T02'
        });
      } else if (lowest === timeOutPct && timeOutPct < 85) {
        insights.push({
          type: 'warning',
          title: 'Risco de Registro no Time-Out',
          desc: `Pausa cirúrgica preventiva (Time-Out) está em ${timeOutPct}%. Esta etapa previne erros gravíssimos de lateralidade. Deve ser exigida a parada da equipe.`,
          tracer: 'T02'
        });
      } else if (signInPct < 85) {
        insights.push({
          type: 'warning',
          title: 'Falha de Registro no Sign-In Anestésico',
          desc: `A verificação do Sign-In com o anestesista está abaixo do esperado (${signInPct}%). Necessário reforçar a liderança conjunta na indução anestésica.`,
          tracer: 'T02'
        });
      } else {
        insights.push({
          type: 'success',
          title: 'Protocolo de Cirurgia Segura Ativado',
          desc: `Toda a jornada cirúrgica atende os requisitos estabelecidos pela OMS com índices maduros de conformidade assistencial.`,
          tracer: 'T02'
        });
      }
    }

    if (t03Total > 0) {
      const medPct = Math.round((t03Compliant / t03Total) * 100);
      if (medPct < 80) {
        insights.push({
          type: 'danger',
          title: 'Conformidade Crítica em Proc. de Medicação',
          desc: `O índice de conformidade dos processos seguros de medicação está em ${medPct}%. Recomendada ação de reforço nos protocolos de prescrição, preparo e administração.`,
          tracer: 'T03'
        });
      } else if (medPct < 90) {
        insights.push({
          type: 'warning',
          title: 'Meta de Proc. de Medicação Próxima',
          desc: `A conformidade dos processos de medicação está em ${medPct}%. Intensificar dupla checagem à beira-leito para atingir a meta.`,
          tracer: 'T03'
        });
      } else {
        insights.push({
          type: 'success',
          title: 'Processos de Medicação em Alto Padrão',
          desc: `Processos Seguros de Medicação mantidos com excelência em ${medPct}%, assegurando adesão aos protocolos e segurança medicamentosa.`,
          tracer: 'T03'
        });
      }
    }

    while (insights.length < 3) {
      insights.push({
        type: 'success',
        title: 'Diretriz Estratégica SESAU Recife',
        desc: `Consolidação de auditorias em tempo real impulsiona o plano municipal Recife Cuida Mais para redução contínua de eventos adversos.`,
        tracer: 'GERAL'
      });
    }

    return insights.slice(0, 3);
  }, [complianceMetrics]);

  const tracerVolumeTrendData = useMemo(() => {
    let hands = handAudits;
    let patients = patientAudits;
    let surgeries = surgeryAudits;

    const targetUnit = isAdmin ? (globalUnit || '') : (userUnit || '');
    if (targetUnit) {
      const filter = (a: any) => a.unitId === targetUnit || a.hospitalId === targetUnit || a.unidadeId === targetUnit;
      hands = hands.filter(filter);
      patients = patients.filter(filter);
      surgeries = surgeries.filter(filter);
    }

    if (globalType === 'Hospitalar') {
      const hospitals = HEALTH_UNITS.filter(u => u.type === 'Hospital').map(u => u.id);
      const hFilter = (a: any) => hospitals.includes(a.unitId || a.hospitalId || a.unidadeId);
      hands = hands.filter(hFilter);
      patients = patients.filter(hFilter);
      surgeries = surgeries.filter(hFilter);
    } else if (globalType === 'Ambulatorial') {
      const polys = HEALTH_UNITS.filter(u => u.type !== 'Hospital').map(u => u.id);
      const pFilter = (a: any) => polys.includes(a.unitId || a.hospitalId || a.unidadeId);
      hands = hands.filter(pFilter);
      patients = patients.filter(pFilter);
      surgeries = surgeries.filter(pFilter);
    }

    const monthlyStats = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i,
      monthName: MONTH_NAMES[i],
      total: 0,
      t01: 0,
      t02: 0,
      t03: 0
    }));

    patients.forEach(audit => {
      const m = getTracerDateMonth(audit);
      if (m !== null && m >= 0 && m < 12) {
        monthlyStats[m].total += 1;
        monthlyStats[m].t01 += 1;
      }
    });

    surgeries.forEach(audit => {
      const m = getTracerDateMonth(audit);
      if (m !== null && m >= 0 && m < 12) {
        monthlyStats[m].total += 1;
        monthlyStats[m].t02 += 1;
      }
    });

    hands.forEach(audit => {
      const m = getTracerDateMonth(audit);
      if (m !== null && m >= 0 && m < 12) {
        monthlyStats[m].total += 1;
        monthlyStats[m].t03 += 1;
      }
    });

    return monthlyStats
      .filter(m => m.total > 0)
      .map(m => ({
        name: m.monthName,
        "Total Geral": m.total,
        "T01 - Beira Leito": m.t01,
        "T02 - Proc. Cirúrgicos": m.t02,
        "T03 - Proc. Medicação": m.t03
      }));
  }, [handAudits, patientAudits, surgeryAudits, isAdmin, userUnit, globalUnit, globalType]);

  const defaultGoalMonth = useMemo(() => {
    if (globalMonth !== '') return parseInt(globalMonth);
    // Find month with the most audits
    const counts = Array(12).fill(0);
    patientAudits.forEach(a => { const m = getTracerDateMonth(a); if (m !== null) counts[m]++; });
    surgeryAudits.forEach(a => { const m = getTracerDateMonth(a); if (m !== null) counts[m]++; });
    handAudits.forEach(a => { const m = getTracerDateMonth(a); if (m !== null) counts[m]++; });
    
    let maxIdx = 4; // default to May (index 4) if all empty
    let maxVal = 0;
    counts.forEach((c, idx) => {
      if (c > maxVal) {
        maxVal = c;
        maxIdx = idx;
      }
    });
    return maxIdx;
  }, [globalMonth, patientAudits, surgeryAudits, handAudits]);

  const goalTrackingData = useMemo(() => {
    const targetMonths = globalQuarter && globalQuarter !== '' 
      ? (() => {
          if (globalQuarter === '1') return [0, 1, 2];
          if (globalQuarter === '2') return [3, 4, 5];
          if (globalQuarter === '3') return [6, 7, 8];
          if (globalQuarter === '4') return [9, 10, 11];
          return [defaultGoalMonth];
        })()
      : [defaultGoalMonth];
    
    const monthPatients = patientAudits.filter(a => {
      const m = getTracerDateMonth(a);
      return m !== null && targetMonths.includes(m);
    });
    const monthSurgeries = surgeryAudits.filter(a => {
      const m = getTracerDateMonth(a);
      return m !== null && targetMonths.includes(m);
    });
    const monthHands = handAudits.filter(a => {
      const m = getTracerDateMonth(a);
      return m !== null && targetMonths.includes(m);
    });

    const multiplier = targetMonths.length;

    const effectiveUnit = isAdmin ? (globalUnit || '') : (userUnit || '');
    const unitsToTrack = effectiveUnit
      ? HEALTH_UNITS.filter(u => u.id === effectiveUnit)
      : (isAdmin ? HEALTH_UNITS : []);

    return unitsToTrack.map(unit => {
      const filterByUnit = (audits: any[]) => audits.filter(a => 
        a.unitId === unit.id || a.hospitalId === unit.id || a.unidadeId === unit.id
      );

      const t01Count = filterByUnit(monthPatients).length;
      const t02Count = filterByUnit(monthSurgeries).length;
      const t03Count = filterByUnit(monthHands).length;

      const isMaternity = ['policlinica_barros_lima', 'policlinica_arnaldo_marques', 'maternidade_bandeira_filho'].includes(unit.id);

      const t01Goal = 10 * multiplier;
      const t02Goal = isMaternity ? 10 * multiplier : 0;
      const t03Goal = 10 * multiplier;

      const t01Pct = Math.min(100, (t01Count / t01Goal) * 100);
      const t02Pct = t02Goal > 0 ? Math.min(100, (t02Count / t02Goal) * 100) : 0;
      const t03Pct = Math.min(100, (t03Count / t03Goal) * 100);

      const t01Met = t01Count >= t01Goal;
      const t02Met = t02Goal > 0 ? (t02Count >= t02Goal) : true;
      const t03Met = t03Count >= t03Goal;

      const allMet = t01Met && t02Met && t03Met;
      const totalCount = t01Count + t02Count + t03Count;
      const targetTotal = t01Goal + t02Goal + t03Goal;

      return {
        unitId: unit.id,
        name: unit.name,
        shortName: unit.name.replace('Hospital de Pediatria ', '').replace('Policlínica e Maternidade ', '').replace('Maternidade ', ''),
        isMaternity,
        t01Count,
        t02Count,
        t03Count,
        t01Goal,
        t02Goal,
        t03Goal,
        t01Pct,
        t02Pct,
        t03Pct,
        t01Met,
        t02Met,
        t03Met,
        allMet,
        totalCount,
        targetTotal,
        progressPct: Math.min(100, (totalCount / targetTotal) * 100)
      };
    });
  }, [defaultGoalMonth, globalQuarter, patientAudits, surgeryAudits, handAudits, isAdmin, globalUnit, userUnit]);

  const [exportingCSV, setExportingCSV] = useState(false);

  const handleExportCSV = () => {
    try {
      setExportingCSV(true);
      const allFiltered = [...filteredPatient, ...filteredSurgery, ...filteredHand];
      if (allFiltered.length === 0) {
        setExportError('Nenhum dado encontrado para exportar');
        setTimeout(() => setExportError(null), 3000);
        return;
      }
      const periodLabel = globalMonth !== '' ? MONTH_NAMES[parseInt(globalMonth)] : (globalQuarter ? `${globalQuarter}º_Trimestre` : 'Geral');
      exportAuditsToCSV(allFiltered, `auditorias_dashboard_${periodLabel.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err: any) {
      setExportError(err.message || 'Erro ao exportar CSV');
      setTimeout(() => setExportError(null), 3000);
    } finally {
      setExportingCSV(false);
    }
  };

  const handleExportIndicatorsCSV = () => {
    try {
      if (!goalTrackingData || goalTrackingData.length === 0) {
        setExportError('Nenhum indicador disponível para exportar');
        setTimeout(() => setExportError(null), 3000);
        return;
      }
      const periodLabel = globalMonth !== '' ? MONTH_NAMES[parseInt(globalMonth)] : (globalQuarter ? `${globalQuarter}º_Trimestre` : 'Geral');
      exportDashboardIndicatorsToCSV(
        goalTrackingData.map(u => ({
          unitId: u.unitId,
          unitName: u.name,
          target: u.targetTotal,
          completed: u.totalCount,
          coveragePct: u.progressPct,
          compliancePct: u.progressPct,
          t01Count: u.t01Count,
          t02Count: u.t02Count,
          t03Count: u.t03Count
        })),
        periodLabel
      );
    } catch (err: any) {
      setExportError(err.message || 'Erro ao exportar indicadores CSV');
      setTimeout(() => setExportError(null), 3000);
    }
  };

  const totalConformingItems = complianceMetrics.t01HasWristband + complianceMetrics.t01WristbandLegible + complianceMetrics.t01CorrectData + complianceMetrics.t02SignIn + complianceMetrics.t02TimeOut + complianceMetrics.t02SignOut + complianceMetrics.t03Compliant;
  const totalEvaluatedItems = (complianceMetrics.t01Total * 3) + (complianceMetrics.t02Total * 3) + complianceMetrics.t03Total;
  const itemCompliancePctFormatted = totalEvaluatedItems > 0 
    ? ((totalConformingItems / totalEvaluatedItems) * 100).toFixed(1).replace('.', ',') 
    : '0,0';

  const fullAuditCompliantCount = useMemo(() => {
    let t01Full = 0;
    filteredPatient.forEach(a => {
      const raw = a.rawData || {};
      const hasW = a.hasWristband !== undefined ? a.hasWristband : (raw['Paciente identificado com pulseira branca?'] || raw['Paciente identificado com pulseira branca']);
      const legW = a.wristbandLegible !== undefined ? a.wristbandLegible : (raw['A pulseira de identificação está legível?'] || raw['A pulseira de identificação está legível']);
      const corD = a.correctData !== undefined ? a.correctData : (raw['A pulseira de identificação preenchida adequadamente?'] || raw['A pulseira de identificação preenchida adequadamente']);
      if (checkVal(hasW) && checkVal(legW) && checkVal(corD)) t01Full++;
    });

    let t02Full = 0;
    filteredSurgery.forEach(a => {
      const raw = a.rawData || {};
      const sIn = a.signIIn !== undefined ? a.signIIn : (raw['Check list de cirurgia segura aplicado antes da indução anestésica?'] || raw['Check list de cirurgia segura aplicado antes da indução anestésica']);
      const tOut = a.timeOut !== undefined ? a.timeOut : (raw['Check list de cirurgia segura aplicado antes da incisão cirúrgica?'] || raw['Check list de cirurgia segura aplicado antes da incisão cirúrgica']);
      const sOut = a.signOut !== undefined ? a.signOut : (raw['Check list de cirurgia segura aplicado antes de sair da sala?'] || raw['Check list de cirurgia segura aplicado antes de sair da sala']);
      if (checkVal(sIn) && checkVal(tOut) && checkVal(sOut)) t02Full++;
    });

    const t03Full = complianceMetrics.t03Compliant;
    return t01Full + t02Full + t03Full;
  }, [filteredPatient, filteredSurgery, complianceMetrics]);

  const primaryStats = [
    { label: 'T01 - Beira Leito', value: `${filteredPatient.length}`, icon: <BedDouble className="w-5 h-5 text-blue-600" />, color: 'text-blue-600', bg: 'bg-blue-50/50', border: 'border-blue-100', glow: 'shadow-blue-50/10', sub: 'auditorias' },
    { label: 'T02 - Proc. Cirúrgicos', value: `${filteredSurgery.length}`, icon: <Scissors className="w-5 h-5 text-amber-600" />, color: 'text-amber-600', bg: 'bg-amber-50/50', border: 'border-amber-100', glow: 'shadow-amber-50/10', sub: 'auditorias' },
    { label: 'T03 - Proc. Medicação', value: `${filteredHand.length}`, icon: <Pill className="w-5 h-5 text-indigo-600" />, color: 'text-indigo-600', bg: 'bg-indigo-50/50', border: 'border-indigo-100', glow: 'shadow-indigo-50/10', sub: 'auditorias' },
    { label: 'Respostas Totais', value: `${filteredHand.length + filteredPatient.length + filteredSurgery.length}`, icon: <TrendingUp className="w-5 h-5 text-slate-800" />, color: 'text-slate-800', bg: 'bg-slate-50/50', border: 'border-slate-100', glow: 'shadow-slate-50/10', sub: 'formulários' },
    { 
      label: 'Conformidade dos Itens', 
      value: `${itemCompliancePctFormatted}%`, 
      icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50/50', 
      border: 'border-emerald-200', 
      glow: 'shadow-emerald-50/10', 
      sub: `${totalConformingItems.toLocaleString('pt-BR')} de ${totalEvaluatedItems.toLocaleString('pt-BR')} itens`,
      isCompliance: true
    },
  ];

  const secondaryStats = [
    { label: 'Setor mais Auditado', value: advancedStats.topSector, icon: <MapPin className="w-5 h-5 text-emerald-600" />, color: 'text-emerald-600', bg: 'bg-emerald-50/50', border: 'border-emerald-100', isLabel: true, sub: 'Setor com maior volume' },
    { label: 'Categoria Profissional mais Ativa', value: advancedStats.topProfessional, icon: <Contact className="w-5 h-5 text-rose-600" />, color: 'text-rose-600', bg: 'bg-rose-50/50', border: 'border-rose-100', isLabel: true, sub: 'Categoria mais engajada nas auditorias' },
  ];

  const tracerBreakdown = useMemo(() => {
    const effectiveUnit = isAdmin ? (globalUnit || '') : (userUnit || '');
    const unitsList = effectiveUnit
      ? HEALTH_UNITS.filter(u => u.id === effectiveUnit)
      : (isAdmin ? HEALTH_UNITS : []);

    return [
      { 
        id: 'T01', 
        name: 'Identificação Beira Leito', 
        count: filteredPatient.length, 
        color: 'bg-blue-500',
        units: unitsList.map(u => ({
          id: u.id,
          name: u.name,
          count: filteredPatient.filter(a => a.unitId === u.id || a.hospitalId === u.id || a.unidadeId === u.id).length
        })).filter(u => u.count > 0).sort((a,b) => b.count - a.count).slice(0, 5)
      },
      { 
        id: 'T02', 
        name: 'Processos Cirúrgicos', 
        count: filteredSurgery.length, 
        color: 'bg-amber-500',
        units: unitsList.map(u => ({
          id: u.id,
          name: u.name,
          count: filteredSurgery.filter(a => a.unitId === u.id || a.hospitalId === u.id || a.unidadeId === u.id).length
        })).filter(u => u.count > 0).sort((a,b) => b.count - a.count).slice(0, 5)
      },
      { 
        id: 'T03', 
        name: 'Proc. Medicação', 
        count: filteredHand.length, 
        color: 'bg-indigo-500',
        units: unitsList.map(u => ({
          id: u.id,
          name: u.name,
          count: filteredHand.filter(a => a.unitId === u.id || a.hospitalId === u.id || a.unidadeId === u.id).length
        })).filter(u => u.count > 0).sort((a,b) => b.count - a.count).slice(0, 5)
      }
    ];
  }, [filteredHand, filteredPatient, filteredSurgery, isAdmin, globalUnit, userUnit]);

  if (loading) return <div className="h-64 flex items-center justify-center text-neutral-400 font-bold uppercase tracking-tight">Carregando painel de métricas...</div>;

  return (
    <div className="space-y-6">
      {/* Dashboard View Mode Selector & Export Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-b border-slate-200/80 pb-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200/60 shadow-xs">
          <button
            onClick={() => {
              setDashboardView('overview');
              onSubViewChange?.('overview');
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              dashboardView === 'overview'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Visão Geral
          </button>

          <button
            onClick={() => {
              setDashboardView('items_compliance');
              onSubViewChange?.('items_compliance');
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              dashboardView === 'items_compliance'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Conformidade por Item
          </button>

          <button
            onClick={() => {
              setDashboardView('auditors_share');
              onSubViewChange?.('auditors_share');
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              dashboardView === 'auditors_share'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Participação de Auditores
          </button>
        </div>

        {/* Export Buttons (PDF & CSV) */}
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          <button
            id="export-csv-dashboard-btn"
            onClick={handleExportCSV}
            disabled={exportingCSV || (filteredPatient.length + filteredSurgery.length + filteredHand.length === 0)}
            className="group flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-200 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 shadow-sm border border-emerald-800 cursor-pointer"
            title="Exportar coletas do período em planilha CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {exportingCSV ? 'Gerando...' : `Exportar CSV (${filteredPatient.length + filteredSurgery.length + filteredHand.length})`}
          </button>

          <button
            id="export-indicators-csv-btn"
            onClick={handleExportIndicatorsCSV}
            className="hidden lg:flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 shadow-xs cursor-pointer"
            title="Exportar resumo de metas e cobertura das unidades para CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-700" />
            Indicadores CSV
          </button>

          <button
            id="export-pdf-dashboard-btn"
            onClick={handleExportPDF}
            disabled={exporting}
            className="group flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-200 text-white px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 shadow-sm border border-slate-950 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5" />
            {exporting ? 'Gerando...' : 'Exportar PDF'}
          </button>
          {exportError && (
            <div className="text-rose-600 font-bold bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-2 shadow-sm animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{exportError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Render Dedicated Indicator Views if Selected */}
      {dashboardView === 'items_compliance' && (
        <ItemComplianceStackedChart
          patientAudits={filteredPatient}
          surgeryAudits={filteredSurgery}
          handAudits={filteredHand}
          unitName={HEALTH_UNITS.find(u => u.id === (isAdmin ? globalUnit : userUnit))?.name}
          selectedMonthName={globalMonth !== '' ? MONTH_NAMES[parseInt(globalMonth)] : ''}
          globalTracer={globalTracer}
        />
      )}

      {dashboardView === 'auditors_share' && (
        <AuditorsParticipation
          patientAudits={filteredPatient}
          surgeryAudits={filteredSurgery}
          handAudits={filteredHand}
          unitName={HEALTH_UNITS.find(u => u.id === (isAdmin ? globalUnit : userUnit))?.name}
          selectedMonthName={globalMonth !== '' ? MONTH_NAMES[parseInt(globalMonth)] : ''}
          globalTracer={globalTracer}
        />
      )}

      {/* Render Overview Dashboard */}
      {dashboardView === 'overview' && (
        <>
      {/* Executive Primary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {primaryStats.map((s: any, i) => (
          <motion.div 
            key={s.label}
            initial={{ opacity: 0, y: 12 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: i * 0.06, ease: 'easeOut' }}
            className={`relative overflow-hidden bg-white rounded-2xl border ${s.border || 'border-slate-200'} p-4.5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group`}
          >
            {/* Soft decorative background highlight */}
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${s.bg} opacity-40 blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none`} />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{s.label}</span>
                <span className={`p-2 rounded-xl ${s.bg} border ${s.border} flex items-center justify-center shrink-0`}>
                  {s.icon}
                </span>
              </div>
              
              <div className="flex flex-col gap-0.5 mt-1">
                <p className={`text-2xl lg:text-3xl font-black tracking-tight leading-none group-hover:scale-[1.01] transition-transform duration-250 ${s.isCompliance ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {s.value}
                </p>
                {s.sub && (
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mt-1">{s.sub}</span>
                )}
              </div>
            </div>
            
            <div className="relative mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[8px] font-black uppercase text-slate-400 tracking-wider">
              <span>{s.isCompliance ? 'Meta Qualidade: ≥ 85%' : 'Monitorado On-line'}</span>
              <span className={`flex h-1.5 w-1.5 rounded-full ${s.isCompliance ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Global Items Compliance Summary Panel */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ease: 'easeOut' }}
        className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest leading-tight">
                Taxa de Conformidade dos Itens Analisados
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                Consolidação ponderada de todos os critérios assistenciais avaliados
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-2xl font-black text-emerald-600 tracking-tight">{itemCompliancePctFormatted}%</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase">Global</span>
              </div>
              <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider block">
                {totalConformingItems.toLocaleString('pt-BR')} de {totalEvaluatedItems.toLocaleString('pt-BR')} itens conformes
              </span>
            </div>
            <button
              onClick={() => {
                setDashboardView('items_compliance');
                onSubViewChange?.('items_compliance');
              }}
              className="hidden md:flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer shrink-0"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Ver Itens Detalhados
            </button>
          </div>
        </div>

        {/* Breakdown by Tracer and Integral Adherence */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* T01 Items Summary */}
          <div className="p-3.5 bg-blue-50/40 border border-blue-100 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">T01 - Beira Leito</span>
              <span className="text-xs font-black text-blue-800">
                {complianceMetrics.t01Total > 0 
                  ? `${Math.round(((complianceMetrics.t01HasWristband + complianceMetrics.t01WristbandLegible + complianceMetrics.t01CorrectData) / (complianceMetrics.t01Total * 3)) * 100)}%` 
                  : '0%'}
              </span>
            </div>
            <div className="w-full bg-blue-100/60 h-1.5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all duration-500" 
                style={{ 
                  width: `${complianceMetrics.t01Total > 0 ? ((complianceMetrics.t01HasWristband + complianceMetrics.t01WristbandLegible + complianceMetrics.t01CorrectData) / (complianceMetrics.t01Total * 3)) * 100 : 0}%` 
                }} 
              />
            </div>
            <div className="flex items-center justify-between text-[8px] font-bold text-slate-500 uppercase tracking-tight pt-0.5">
              <span>Pulseira: {complianceMetrics.t01Total > 0 ? Math.round((complianceMetrics.t01HasWristband / complianceMetrics.t01Total) * 100) : 0}%</span>
              <span>Legível: {complianceMetrics.t01Total > 0 ? Math.round((complianceMetrics.t01WristbandLegible / complianceMetrics.t01Total) * 100) : 0}%</span>
              <span>Dados: {complianceMetrics.t01Total > 0 ? Math.round((complianceMetrics.t01CorrectData / complianceMetrics.t01Total) * 100) : 0}%</span>
            </div>
          </div>

          {/* T02 Items Summary */}
          <div className="p-3.5 bg-amber-50/40 border border-amber-100 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider">T02 - Cirurgia Segura</span>
              <span className="text-xs font-black text-amber-800">
                {complianceMetrics.t02Total > 0 
                  ? `${Math.round(((complianceMetrics.t02SignIn + complianceMetrics.t02TimeOut + complianceMetrics.t02SignOut) / (complianceMetrics.t02Total * 3)) * 100)}%` 
                  : '0%'}
              </span>
            </div>
            <div className="w-full bg-amber-100/60 h-1.5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-600 rounded-full transition-all duration-500" 
                style={{ 
                  width: `${complianceMetrics.t02Total > 0 ? ((complianceMetrics.t02SignIn + complianceMetrics.t02TimeOut + complianceMetrics.t02SignOut) / (complianceMetrics.t02Total * 3)) * 100 : 0}%` 
                }} 
              />
            </div>
            <div className="flex items-center justify-between text-[8px] font-bold text-slate-500 uppercase tracking-tight pt-0.5">
              <span>Sign-In: {complianceMetrics.t02Total > 0 ? Math.round((complianceMetrics.t02SignIn / complianceMetrics.t02Total) * 100) : 0}%</span>
              <span>Time-Out: {complianceMetrics.t02Total > 0 ? Math.round((complianceMetrics.t02TimeOut / complianceMetrics.t02Total) * 100) : 0}%</span>
              <span>Sign-Out: {complianceMetrics.t02Total > 0 ? Math.round((complianceMetrics.t02SignOut / complianceMetrics.t02Total) * 100) : 0}%</span>
            </div>
          </div>

          {/* T03 Items Summary */}
          <div className="p-3.5 bg-indigo-50/40 border border-indigo-100 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-indigo-700 uppercase tracking-wider">T03 - Proc. Medicação</span>
              <span className="text-xs font-black text-indigo-800">
                {complianceMetrics.t03Total > 0 
                  ? `${Math.round((complianceMetrics.t03Compliant / complianceMetrics.t03Total) * 100)}%` 
                  : '0%'}
              </span>
            </div>
            <div className="w-full bg-indigo-100/60 h-1.5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                style={{ 
                  width: `${complianceMetrics.t03Total > 0 ? (complianceMetrics.t03Compliant / complianceMetrics.t03Total) * 100 : 0}%` 
                }} 
              />
            </div>
            <div className="flex items-center justify-between text-[8px] font-bold text-slate-500 uppercase tracking-tight pt-0.5">
              <span>Higienização das Mãos</span>
              <span>{complianceMetrics.t03Compliant} de {complianceMetrics.t03Total}</span>
            </div>
          </div>

          {/* Integral Adherence Summary */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-slate-700 uppercase tracking-wider">Aderência 100% Integral</span>
              <span className="text-xs font-black text-slate-900">
                {complianceMetrics.totalAudits > 0 
                  ? `${Math.round((fullAuditCompliantCount / complianceMetrics.totalAudits) * 100)}%` 
                  : '0%'}
              </span>
            </div>
            <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-600 rounded-full transition-all duration-500" 
                style={{ 
                  width: `${complianceMetrics.totalAudits > 0 ? (fullAuditCompliantCount / complianceMetrics.totalAudits) * 100 : 0}%` 
                }} 
              />
            </div>
            <div className="flex items-center justify-between text-[8px] font-bold text-slate-500 uppercase tracking-tight pt-0.5">
              <span>Auditorias sem não-conformidade</span>
              <span>{fullAuditCompliantCount} / {complianceMetrics.totalAudits}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Advanced Analytic Bento Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {secondaryStats.map((s: any, i) => (
          <motion.div 
            key={s.label}
            initial={{ opacity: 0, y: 12 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: (i + 4) * 0.08, ease: 'easeOut' }}
            className={`relative overflow-hidden bg-white rounded-2xl border ${s.border || 'border-slate-200'} p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group`}
          >
            {/* Background dynamic blur accent */}
            <div className={`absolute -right-6 -bottom-6 w-28 h-28 rounded-full ${s.bg} opacity-30 blur-2xl group-hover:scale-110 transition-transform duration-500 pointer-events-none`} />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Insight Operacional</span>
                <span className={`p-2 rounded-xl ${s.bg} border ${s.border} flex items-center justify-center shrink-0`}>
                  {s.icon}
                </span>
              </div>
              
              <div className="space-y-1">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{s.label}</h4>
                <p className="text-lg font-extrabold text-slate-800 uppercase tracking-tight leading-snug truncate max-w-[90%]">
                  {s.value}
                </p>
              </div>
            </div>
            
            <div className="relative mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[8px] font-black uppercase text-slate-400 tracking-wider">
              <span>{s.sub}</span>
              <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tracer Results Section */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
          <LayoutList className="w-4 h-4 text-blue-500" />
          Resultados por Tracer
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {tracerBreakdown.map((tracer) => {
            // Find maximum count for relative gauge rendering
            const maxCount = tracer.units.length > 0 ? Math.max(...tracer.units.map(u => u.count)) : 1;
            
            return (
              <motion.div 
                key={tracer.id}
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  {/* Card Header Info */}
                  <div className="flex items-start justify-between pb-4 border-b border-slate-100 mb-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">{tracer.id}</span>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight mt-1">{tracer.name}</h4>
                      <span className="text-[8px] font-extrabold text-blue-600 uppercase tracking-widest mt-0.5">
                        {isAdmin && !globalUnit ? 'Top 5 Unidades' : 'Sua Unidade'}
                      </span>
                    </div>
                    <div className={`w-10 h-10 ${tracer.color} text-white rounded-xl flex items-center justify-center font-black text-sm shadow-sm shrink-0`}>
                      {tracer.count}
                    </div>
                  </div>

                  {/* Leaderboard Body */}
                  <div className="space-y-2 mt-2">
                    {tracer.units.length === 0 ? (
                      <div className="py-8 text-center bg-slate-50/50 border border-dashed border-slate-100 rounded-xl">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider italic">Sem dados nesta seleção</p>
                      </div>
                    ) : (
                      tracer.units.map((unit, idx) => {
                        // Styles for the premium ranking positions
                        const ranks = [
                          { badge: 'bg-amber-500 text-white border-amber-500', label: '1º' },
                          { badge: 'bg-slate-500 text-white border-slate-500', label: '2º' },
                          { badge: 'bg-amber-700 text-white border-amber-700', label: '3º' },
                          { badge: 'bg-slate-100 text-slate-500 border-slate-200', label: '4º' },
                          { badge: 'bg-slate-100 text-slate-500 border-slate-200', label: '5º' }
                        ];
                        const rank = ranks[idx] || { badge: 'bg-slate-50 text-slate-400', label: `${idx + 1}º` };
                        
                        // Select dynamic fill color based on Tracer color theme
                        const barColor = tracer.id === 'T01' ? 'bg-blue-500/10' : 
                                         tracer.id === 'T02' ? 'bg-amber-500/10' : 
                                         'bg-indigo-500/10';

                        return (
                          <div 
                            key={unit.id} 
                            className="relative overflow-hidden w-full rounded-xl border border-slate-100/80 hover:border-slate-200/90 transition-colors py-2 px-3 flex items-center justify-between"
                            style={{ contentVisibility: 'auto' }}
                          >
                            {/* Visual background progress fill relative to maximum value */}
                            <div 
                              className={`absolute left-0 top-0 bottom-0 ${barColor} rounded-l transition-all duration-500`}
                              style={{ width: `${(unit.count / maxCount) * 100}%` }}
                            />
                            
                            <div className="relative z-10 flex items-center gap-2.5 min-w-0">
                              <span className={`text-[8px] font-black h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 shadow-sm ${rank.badge}`}>
                                {rank.label}
                              </span>
                              <span className="text-[10px] font-extrabold text-slate-700 truncate max-w-[170px] uppercase tracking-tight">
                                {unit.name}
                              </span>
                            </div>
                            
                            <span className="relative z-10 text-[10px] font-black text-slate-800 bg-white/90 border border-slate-100/50 px-2 py-0.5 rounded-lg shrink-0 shadow-sm">
                              {unit.count}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </motion.div>
            );
          })}
        </div>
      </div>

      {/* AMOSTRAGEM DE AUDITORIAS - GOAL TRACKING PANEL */}
      <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200/95 shadow-sm hover:shadow-md transition-all duration-300 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 px-3 bg-indigo-50 border border-indigo-100 rounded-xl shrink-0">
                <Target className="w-4 h-4 text-indigo-600 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                  AMOSTRAGEM DE AUDITORIAS (METAS)
                </h3>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mt-1">
                  {globalQuarter && globalQuarter !== '' 
                    ? 'Acompanhamento de metas recomendadas: 30 processos trimestrais por tipo de TRACER' 
                    : 'Acompanhamento de metas recomendadas: 10 processos mensais por tipo de TRACER'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-3.5 py-1.5 self-start md:self-auto shadow-xs">
            <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Referência:</span>
            <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
              {globalQuarter && globalQuarter !== '' ? `${globalQuarter}º Trimestre` : MONTH_NAMES[defaultGoalMonth]}
            </span>
          </div>
        </div>

        {/* Global targets rules overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
            <div className="p-2 bg-indigo-100/60 text-indigo-600 rounded-lg">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Meta por TRACER</p>
              <p className="text-sm font-black text-slate-800 mt-1.5">10 Processos / Mês</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Por tipo de tracer ativo na unidade</p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
            <div className="p-2 bg-pink-100/60 text-pink-600 rounded-lg">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Meta Maternidades</p>
              <p className="text-sm font-black text-slate-800 mt-1.5">30 Processos / Mês</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 font-sans">10 Beira Leito + 10 Cirúrgico + 10 Medicação</p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3">
            <div className="p-2 bg-blue-100/60 text-blue-600 rounded-lg">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none font-sans">Meta Policlínicas & Hospitais</p>
              <p className="text-sm font-black text-slate-800 mt-1.5">20 Processos / Mês</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">10 Beira Leito + 10 Medicação (sem cirurgia)</p>
            </div>
          </div>
        </div>

        {/* Detailed Grid for each unit */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {goalTrackingData.map((data) => {
            return (
              <div 
                key={data.unitId} 
                className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                  data.allMet 
                    ? 'border-emerald-200 bg-emerald-50/5 shadow-xs hover:border-emerald-300' 
                    : data.totalCount > 0 
                      ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs' 
                      : 'border-slate-150 bg-slate-50/20 opacity-85'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100/70 pb-3">
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight truncate max-w-[150px]" title={data.name}>
                        {data.shortName}
                      </h4>
                      <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-wider ${
                        data.isMaternity 
                          ? 'bg-pink-50 border border-pink-100 text-pink-600' 
                          : 'bg-blue-50 border border-blue-100 text-blue-600'
                      }`}>
                        {data.isMaternity ? 'Maternidade' : 'Hospital / Policlínica'}
                      </span>
                    </div>

                    <div className="text-right">
                      {data.allMet ? (
                        <span className="flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider leading-none">
                          <Check className="w-2.5 h-2.5 shrink-0" />
                          Alcançada
                        </span>
                      ) : data.totalCount > 0 ? (
                        <span className="flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider leading-none">
                          <Activity className="w-2.5 h-2.5 shrink-0 animate-pulse" />
                          {Math.round(data.progressPct)}%
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider leading-none">
                          Sem Registros
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tracers detail lists */}
                  <div className="space-y-3 mt-3.5">
                    {/* T01 details */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          T01 - Beira Leito
                        </span>
                        <span className={data.t01Met ? 'text-emerald-600 font-extrabold' : 'text-slate-600 font-extrabold'}>
                          {data.t01Count} / 10
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${data.t01Met ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                          style={{ width: `${data.t01Pct}%` }}
                        />
                      </div>
                    </div>

                    {/* T02 details */}
                    {data.isMaternity ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            T02 - Cirúrgico
                          </span>
                          <span className={data.t02Met ? 'text-emerald-600 font-extrabold' : 'text-slate-600 font-extrabold'}>
                            {data.t02Count} / 10
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${data.t02Met ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                            style={{ width: `${data.t02Pct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 opacity-50">
                        <div className="flex items-center justify-between text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            T02 - Cirúrgico
                          </span>
                          <span>Não se aplica</span>
                        </div>
                        <div className="w-full bg-slate-100/50 h-1 rounded-full" />
                      </div>
                    )}

                    {/* T03 details */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          T03 - Medicação
                        </span>
                        <span className={data.t03Met ? 'text-emerald-600 font-extrabold' : 'text-slate-600 font-extrabold'}>
                          {data.t03Count} / 10
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${data.t03Met ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                          style={{ width: `${data.t03Pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card footer totals */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  <span>Total Geral</span>
                  <span className={data.allMet ? 'text-emerald-600 font-extrabold' : data.totalCount > 0 ? 'text-slate-700 font-extrabold' : 'text-slate-400 font-extrabold'}>
                    {data.totalCount} / {data.targetTotal}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visualmente Inteligente: Evolução Temporal dos Tracers */}
      <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200/95 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 px-3 bg-blue-50 border border-blue-100 rounded-xl shrink-0">
                <Activity className="w-4 h-4 text-blue-600 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                  Evolução Temporal dos Tracer's
                </h3>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mt-1">
                  Visão analítica histórica de auditorias e coberturas
                </span>
              </div>
            </div>
          </div>

          {/* Selector Tabs for Dynamic View Mode */}
          <div className="flex items-center gap-1 bg-slate-100/80 rounded-xl p-1 border border-slate-200/30">
            <button
              onClick={() => setChartType('area')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                chartType === 'area'
                  ? 'bg-white text-blue-600 shadow-sm font-black border border-slate-200/20'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
              }`}
            >
              Área Fluída
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                chartType === 'line'
                  ? 'bg-white text-slate-800 shadow-sm font-black border border-slate-200/20'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
              }`}
            >
              Tendência
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                chartType === 'bar'
                  ? 'bg-white text-indigo-600 shadow-sm font-black border border-slate-200/20'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
              }`}
            >
              Carga (Barras)
            </button>
          </div>
        </div>

        <div className="h-72 w-full mt-2">
          {tracerVolumeTrendData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
              <HelpCircle className="w-8 h-8 text-slate-300 mb-2 animate-bounce" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sem dados de auditoria para os filtros atuais</p>
              <p className="text-[9px] font-extrabold text-slate-300 uppercase tracking-wider mt-1">Conecte planilhas ou adicione novos registros</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={tracerVolumeTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorT01" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorT02" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorT03" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    dy={8}
                    style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }} 
                  />
                  <YAxis 
                    allowDecimals={false}
                    axisLine={false} 
                    tickLine={false} 
                    dx={-8}
                    style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }} 
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconSize={8} 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '9px', fontWeight: '900', fill: '#64748b' }} 
                  />
                  <Area 
                    type="monotone" 
                    name="T01 - Beira Leito"
                    dataKey="T01 - Beira Leito" 
                    stroke="#3b82f6" 
                    fillOpacity={1} 
                    fill="url(#colorT01)" 
                    strokeWidth={2.5}
                    activeDot={{ r: 5.5, strokeWidth: 0, fill: '#3b82f6' }}
                    dot={{ r: 3, strokeWidth: 2, stroke: '#3b82f6', fill: '#ffffff' }}
                  />
                  <Area 
                    type="monotone" 
                    name="T02 - Proc. Cirúrgicos"
                    dataKey="T02 - Proc. Cirúrgicos" 
                    stroke="#f59e0b" 
                    fillOpacity={1} 
                    fill="url(#colorT02)" 
                    strokeWidth={2.5}
                    activeDot={{ r: 5.5, strokeWidth: 0, fill: '#f59e0b' }}
                    dot={{ r: 3, strokeWidth: 2, stroke: '#f59e0b', fill: '#ffffff' }}
                  />
                  <Area 
                    type="monotone" 
                    name="T03 - Proc. Medicação"
                    dataKey="T03 - Proc. Medicação" 
                    stroke="#6366f1" 
                    fillOpacity={1} 
                    fill="url(#colorT03)" 
                    strokeWidth={2.5}
                    activeDot={{ r: 5.5, strokeWidth: 0, fill: '#6366f1' }}
                    dot={{ r: 3, strokeWidth: 2, stroke: '#6366f1', fill: '#ffffff' }}
                  />
                </AreaChart>
              ) : chartType === 'line' ? (
                <LineChart data={tracerVolumeTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    dy={8}
                    style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }} 
                  />
                  <YAxis 
                    allowDecimals={false}
                    axisLine={false} 
                    tickLine={false} 
                    dx={-8}
                    style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }} 
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconSize={8} 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '9px', fontWeight: '900', fill: '#64748b' }} 
                  />
                  <Line 
                    type="monotone" 
                    name="Total Geral"
                    dataKey="Total Geral" 
                    stroke="#0f172a" 
                    strokeWidth={3} 
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#0f172a' }} 
                    dot={{ r: 3.5, strokeWidth: 2, stroke: '#0f172a', fill: '#ffffff' }}
                  />
                  <Line 
                    type="monotone" 
                    name="T01 - Beira Leito"
                    dataKey="T01 - Beira Leito" 
                    stroke="#3b82f6" 
                    strokeWidth={2.5} 
                    activeDot={{ r: 5.5, strokeWidth: 0, fill: '#3b82f6' }} 
                    dot={{ r: 3, strokeWidth: 2, stroke: '#3b82f6', fill: '#ffffff' }}
                  />
                  <Line 
                    type="monotone" 
                    name="T02 - Proc. Cirúrgicos"
                    dataKey="T02 - Proc. Cirúrgicos" 
                    stroke="#f59e0b" 
                    strokeWidth={2.5} 
                    activeDot={{ r: 5.5, strokeWidth: 0, fill: '#f59e0b' }} 
                    dot={{ r: 3, strokeWidth: 2, stroke: '#f59e0b', fill: '#ffffff' }}
                  />
                  <Line 
                    type="monotone" 
                    name="T03 - Proc. Medicação"
                    dataKey="T03 - Proc. Medicação" 
                    stroke="#6366f1" 
                    strokeWidth={2.5} 
                    activeDot={{ r: 5.5, strokeWidth: 0, fill: '#6366f1' }} 
                    dot={{ r: 3, strokeWidth: 2, stroke: '#6366f1', fill: '#ffffff' }}
                  />
                </LineChart>
              ) : (
                <BarChart data={tracerVolumeTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    dy={8}
                    style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }} 
                  />
                  <YAxis 
                    allowDecimals={false}
                    axisLine={false} 
                    tickLine={false} 
                    dx={-8}
                    style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }} 
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconSize={8} 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '9px', fontWeight: '900', fill: '#64748b' }} 
                  />
                  <Bar dataKey="T01 - Beira Leito" name="T01 - Beira Leito" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={28} />
                  <Bar dataKey="T02 - Proc. Cirúrgicos" name="T02 - Proc. Cirúrgicos" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} barSize={28} />
                  <Bar dataKey="T03 - Proc. Medicação" name="T03 - Proc. Medicação" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Section Divider & Embedded Item Compliance from image.png */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              Conformidade por Item Verificado de Cada Tracer
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              Distribuição percentual de Sim, Não e Não se aplica por questão conforme padrão dos formulários
            </p>
          </div>
          <button
            onClick={() => setDashboardView('items_compliance')}
            className="text-[10px] font-black text-emerald-700 hover:text-emerald-800 uppercase tracking-wider flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
          >
            Ver em tela cheia <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        
        <ItemComplianceStackedChart
          patientAudits={filteredPatient}
          surgeryAudits={filteredSurgery}
          handAudits={filteredHand}
          unitName={HEALTH_UNITS.find(u => u.id === (isAdmin ? globalUnit : userUnit))?.name}
          selectedMonthName={globalMonth !== '' ? MONTH_NAMES[parseInt(globalMonth)] : ''}
        />
      </div>

      {/* Embedded Auditors Participation */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Percentual de Auditores por Tracer
          </h3>
          <button
            onClick={() => setDashboardView('auditors_share')}
            className="text-[10px] font-black text-blue-700 hover:text-blue-800 uppercase tracking-wider flex items-center gap-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            Expandir <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <AuditorsParticipation
          patientAudits={filteredPatient}
          surgeryAudits={filteredSurgery}
          handAudits={filteredHand}
          unitName={HEALTH_UNITS.find(u => u.id === (isAdmin ? globalUnit : userUnit))?.name}
          selectedMonthName={globalMonth !== '' ? MONTH_NAMES[parseInt(globalMonth)] : ''}
        />
      </div>
      </>
      )}



      {/* Hidden printable A4 report component */}
      <div style={{ position: 'fixed', left: '-12000px', top: '-12000px', zIndex: -99999, pointerEvents: 'none' }}>
        <div 
          id="dashboard-pdf-report"
          className="flex flex-col justify-between"
          style={{
            width: '820px',
            height: '1160px',
            padding: '45px',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#0f172a'
          }}
        >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center pb-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: '#94a3b8' }}>Hospital Gestor de Qualidade</span>
              <h1 className="text-xl font-black uppercase tracking-tight leading-none mt-1" style={{ color: '#0f172a' }}>Relatório Geral Executivo</h1>
              <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: '#64748b' }}>Monitoramento Mensal e Consolidação de Registros Tracers</p>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-black uppercase block tracking-wider leading-none" style={{ color: '#94a3b8' }}>Exportado em</span>
              <span className="text-xs font-black block mt-1" style={{ color: '#1e293b' }}>{new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="inline-block mt-2 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                {globalMonth !== '' 
                  ? `Mês: ${MONTH_NAMES[parseInt(globalMonth)]}` 
                  : globalQuarter !== '' 
                    ? `Trimestre: ${globalQuarter}º` 
                    : 'Período Completo'}
              </span>
            </div>
          </div>

          {/* Indicators cards */}
          <div className="grid grid-cols-4 gap-4 mt-2">
            {primaryStats.map((s) => (
              <div key={s.label} className="p-4 rounded-xl flex flex-col justify-between" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                <div>
                  <h4 className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>{s.label}</h4>
                  <p className="text-2xl font-black" style={{ color: '#0f172a' }}>{s.value}</p>
                </div>
                <div className="text-[8px] font-bold uppercase mt-2" style={{ color: '#94a3b8' }}>Registros</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="p-4 rounded-xl" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
              <h4 className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>Setor Mais Auditado</h4>
              <p className="text-base font-black uppercase" style={{ color: '#0f172a' }}>{advancedStats.topSector}</p>
              <p className="text-[8px] font-bold uppercase mt-1" style={{ color: '#94a3b8' }}>Maior concentração de auditorias no período</p>
            </div>
            <div className="p-4 rounded-xl flex flex-col justify-center" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
              <h4 className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>Filtro de Visualização</h4>
              <p className="text-xs font-black uppercase" style={{ color: '#2563eb' }}>
                {userUnit ? `Unidade Restrita: ${HEALTH_UNITS.find(u => u.id === userUnit)?.name || userUnit}` : 'Visão Geral Multi-Unidades'}
              </p>
              <p className="text-[8px] font-bold uppercase mt-1" style={{ color: '#94a3b8' }}>Conforme nível de acesso do usuário</p>
            </div>
          </div>

          {/* Chart Section */}
          <div className="p-5 rounded-xl space-y-3" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', marginTop: '16px' }}>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-[#0f172a]" style={{ color: '#0f172a' }}>Evolução temporal dos Tracer's</h3>
            </div>
            <div className="h-44 w-full flex items-center justify-center">
              {tracerVolumeTrendData.length === 0 ? (
                <div className="text-[10px] italic" style={{ color: '#94a3b8' }}>Aguardando dados...</div>
              ) : (
                <LineChart width={710} height={170} data={tracerVolumeTrendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tickLine={false} style={{ fontSize: '9px', fontWeight: 'bold', fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tickLine={false} style={{ fontSize: '9px', fontWeight: 'bold', fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={24} iconSize={6} iconType="circle" wrapperStyle={{ fontSize: '8px', fontWeight: '900', fill: '#64748b' }} />
                  <Line type="monotone" dataKey="Total Geral" stroke="#0f172a" strokeWidth={3} dot={{ r: 3.5, strokeWidth: 2, stroke: '#0f172a', fill: '#ffffff' }} />
                  <Line type="monotone" dataKey="T01 - Beira Leito" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, stroke: '#3b82f6', fill: '#ffffff' }} />
                  <Line type="monotone" dataKey="T02 - Proc. Cirúrgicos" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, stroke: '#f59e0b', fill: '#ffffff' }} />
                  <Line type="monotone" dataKey="T03 - Proc. Medicação" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, stroke: '#6366f1', fill: '#ffffff' }} />
                </LineChart>
              )}
            </div>
          </div>

          {/* Top 5 Units per Tracer */}
          <div className="space-y-3" style={{ marginTop: '16px' }}>
            <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: '#475569' }}>Ranking Top 5 de Registros por Unidade</h3>
            <div className="grid grid-cols-3 gap-4">
              {tracerBreakdown.map((tracer) => {
                const tracerColors: Record<string, string> = {
                  'T01': '#3b82f6',
                  'T02': '#f59e0b',
                  'T03': '#6366f1',
                };
                const bgColors: Record<string, string> = {
                  'T01': '#eff6ff',
                  'T02': '#fffbeb',
                  'T03': '#e0e7ff',
                };
                const tagBg = tracerColors[tracer.id] || '#64748b';
                return (
                  <div key={tracer.id} className="p-4 rounded-xl flex flex-col justify-between" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div className="flex justify-between items-center pb-2" style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <div>
                          <span className="text-[8px] font-black block tracking-widest" style={{ color: '#94a3b8' }}>{tracer.id}</span>
                          <h4 className="text-[10px] font-black uppercase leading-none mt-0.5" style={{ color: '#0f172a' }}>{tracer.name.split(' ')[0]}</h4>
                        </div>
                        <span className="px-1.5 py-0.5 text-white font-black text-[9px] rounded" style={{ backgroundColor: tagBg }}>{tracer.count}</span>
                      </div>

                      <div className="space-y-1.5 mt-3">
                        {tracer.units.length === 0 ? (
                          <p className="text-[9px] italic py-1" style={{ color: '#94a3b8' }}>Sem registros.</p>
                        ) : (
                          tracer.units.map((unit, idx) => {
                            const labels = ['1º', '2º', '3º', '4º', '5º'];
                            return (
                              <div key={unit.id} className="flex justify-between items-center text-[9px] py-0.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-extrabold text-[8px]" style={{ color: '#94a3b8' }}>{labels[idx] || `${idx + 1}º`}</span>
                                  <span className="font-bold truncate max-w-[150px]" style={{ color: '#475569' }}>{unit.name}</span>
                                </div>
                                <span className="font-black px-1 py-0.2 rounded text-[9px]" style={{ color: '#0f172a', backgroundColor: '#f8fafc' }}>{unit.count}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer info to lock perfect printable sizing */}
        <div className="flex justify-between items-center pt-4 text-[8px] font-bold uppercase tracking-wider" style={{ borderTop: '1px solid #e2e8f0', color: '#94a3b8' }}>
          <span>Relatório gerado eletronicamente e protegido por assinatura digital.</span>
          <span>Página 1 de 1</span>
        </div>
      </div>
    </div>
  </div>
  );
}
