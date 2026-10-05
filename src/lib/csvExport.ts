import { HEALTH_UNITS, TRACER_FIELD_ORDER } from './utils';
import { getAuditDateObj, getRowValue } from '../components/AuditExplorer';
import { ItemComplianceResult } from './itemComplianceHelper';

/**
 * Escapes a cell value for CSV (RFC 4180 standard)
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  
  // Clean newlines, double quotes, semicolons
  if (str.includes('"') || str.includes(';') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Triggers a client-side download of a CSV file with UTF-8 BOM
 */
export function downloadCSV(csvContent: string, fileName: string) {
  // UTF-8 BOM (\uFEFF) ensures Excel automatically opens with proper UTF-8 accent marks
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats a Date object to Brazilian Portuguese date/time string (DD/MM/AAAA HH:mm)
 */
function formatDateBR(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Normalize header name for dynamic columns
 */
function normalizeHeader(str: string): string {
  return str.trim().replace(/:$/, '');
}

/**
 * Export full list of audits (filtered or all) to CSV
 */
export function exportAuditsToCSV(audits: any[], customFileName?: string) {
  if (!audits || audits.length === 0) {
    throw new Error('Nenhuma auditoria disponível para exportação.');
  }

  // 1. Gather all dynamic question keys across audits
  const dynamicKeysSet = new Set<string>();
  audits.forEach(audit => {
    const raw = audit.rawData || (audit.sourceRowHash ? (typeof audit.sourceRowHash === 'object' ? audit.sourceRowHash : (typeof audit.sourceRowHash === 'string' ? (() => { try { return JSON.parse(audit.sourceRowHash); } catch { return null; } })() : null)) : null);
    if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(k => {
        dynamicKeysSet.add(normalizeHeader(k));
      });
    }
  });

  // Sort dynamic keys according to canonical order
  const normalize = (s: string) => s.toLowerCase().replace(/[?:]/g, '').replace(/^[0-9]+-\s+/, '').trim();
  const sortedDynamicKeys = Array.from(dynamicKeysSet).sort((a, b) => {
    const normA = normalize(a);
    const normB = normalize(b);
    let indexA = TRACER_FIELD_ORDER.findIndex(header => normalize(header) === normA);
    let indexB = TRACER_FIELD_ORDER.findIndex(header => normalize(header) === normB);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    if (indexA === indexB) return a.localeCompare(b);
    return indexA - indexB;
  });

  // 2. Fixed Base Headers
  const baseHeaders = [
    'ID do Registro',
    'Tracer',
    'Unidade de Saúde',
    'Auditor / Responsável',
    'Setor / Local',
    'Categoria Profissional',
    'Data / Hora da Coleta',
    'Mês / Competência',
    'Status de Conformidade'
  ];

  const allHeaders = [...baseHeaders, ...sortedDynamicKeys];

  // 3. Build CSV Rows (using semicolon ';' for immediate compatibility in Excel PT-BR)
  const rows: string[] = [];
  rows.push(allHeaders.map(escapeCSVValue).join(';'));

  audits.forEach(audit => {
    const dateObj = getAuditDateObj(audit);
    const dateFormatted = dateObj ? formatDateBR(dateObj) : '';
    const uId = audit.unitId || audit.hospitalId || audit.unidadeId;
    const unitName = HEALTH_UNITS.find(u => u.id === uId)?.name || audit.unitName || uId || 'Não informada';
    
    let tracerLabel = audit.tracerName || `Tracer ${audit.tracerNumber || ''}`;
    if (audit.type === 'patient' || audit.tracerNumber === '01' || audit.tracerNumber === '1') {
      tracerLabel = 'Tracer 01 - Identificação do Paciente';
    } else if (audit.type === 'surgery' || audit.tracerNumber === '02' || audit.tracerNumber === '2') {
      tracerLabel = 'Tracer 02 - Cirurgia Segura';
    } else if (audit.type === 'hand' || audit.type === 'T03' || audit.tracerNumber === '03' || audit.tracerNumber === '3') {
      tracerLabel = 'Tracer 03 - Proc. Medicação';
    }

    const auditorName = audit.auditorId || audit.auditorName || '-';
    const sector = audit.sector || audit.auditedSector || '-';
    const category = audit.professionalCategory || audit.category || '-';
    const month = audit.competencia || (dateObj ? `${dateObj.getMonth() + 1}/${dateObj.getFullYear()}` : '-');

    // Conformity status determination
    let complianceStatus = 'Não avaliado';
    if (audit.isConforming !== undefined) {
      complianceStatus = audit.isConforming ? 'Conforme' : 'Não Conforme';
    } else if (audit.complianceRate !== undefined) {
      complianceStatus = `${Math.round(audit.complianceRate)}%`;
    }

    const rowData: string[] = [
      escapeCSVValue(audit.id || ''),
      escapeCSVValue(tracerLabel),
      escapeCSVValue(unitName),
      escapeCSVValue(auditorName),
      escapeCSVValue(sector),
      escapeCSVValue(category),
      escapeCSVValue(dateFormatted),
      escapeCSVValue(month),
      escapeCSVValue(complianceStatus)
    ];

    // Dynamic field values
    const raw = audit.rawData || (audit.sourceRowHash ? (typeof audit.sourceRowHash === 'object' ? audit.sourceRowHash : (typeof audit.sourceRowHash === 'string' ? (() => { try { return JSON.parse(audit.sourceRowHash); } catch { return {}; } })() : {})) : {});
    sortedDynamicKeys.forEach(header => {
      const val = getRowValue(raw, header);
      rowData.push(escapeCSVValue(val === '-' ? '' : val));
    });

    rows.push(rowData.join(';'));
  });

  const now = new Date();
  const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fileName = customFileName || `relatorio_auditorias_${dateStamp}.csv`;

  downloadCSV(rows.join('\r\n'), fileName);
}

/**
 * Export Item Compliance ranking / statistics to CSV
 */
export function exportItemComplianceToCSV(
  items: ItemComplianceResult[], 
  tracerName: string, 
  unitName?: string, 
  monthName?: string
) {
  if (!items || items.length === 0) {
    throw new Error('Nenhum dado de conformidade por item para exportar.');
  }

  const headers = [
    'Código / ID',
    'Critério / Pergunta Avaliada',
    'Total Avaliado',
    'Qtd Sim (Conforme)',
    '% Sim (Conformidade)',
    'Qtd Não (Não Conforme)',
    '% Não',
    'Qtd Não se Aplica',
    '% Não se Aplica',
    'Tracer',
    'Unidade',
    'Período'
  ];

  const rows: string[] = [];
  rows.push(headers.map(escapeCSVValue).join(';'));

  items.forEach(item => {
    const row = [
      escapeCSVValue(item.id),
      escapeCSVValue(item.name),
      escapeCSVValue(item.total),
      escapeCSVValue(item.simCount),
      escapeCSVValue(`${item.simPct.toFixed(1)}%`),
      escapeCSVValue(item.naoCount),
      escapeCSVValue(`${item.naoPct.toFixed(1)}%`),
      escapeCSVValue(item.naoSeAplicaCount),
      escapeCSVValue(`${item.naoSeAplicaPct.toFixed(1)}%`),
      escapeCSVValue(tracerName),
      escapeCSVValue(unitName || 'Todas as Unidades'),
      escapeCSVValue(monthName || 'Geral')
    ];
    rows.push(row.join(';'));
  });

  const now = new Date();
  const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const cleanTracer = tracerName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const fileName = `conformidade_itens_${cleanTracer}_${dateStamp}.csv`;

  downloadCSV(rows.join('\r\n'), fileName);
}

/**
 * Export Dashboard unit summary indicators to CSV
 */
export function exportDashboardIndicatorsToCSV(
  unitSummaries: Array<{
    unitId: string;
    unitName: string;
    target: number;
    completed: number;
    coveragePct: number;
    conformingCount?: number;
    compliancePct: number;
    t01Count?: number;
    t02Count?: number;
    t03Count?: number;
  }>,
  periodName?: string
) {
  if (!unitSummaries || unitSummaries.length === 0) {
    throw new Error('Nenhum indicador disponível para exportar.');
  }

  const headers = [
    'Unidade de Saúde',
    'Meta Mensal (Coletas)',
    'Coletas Realizadas',
    'Cobertura da Meta (%)',
    'Conformidade Geral (%)',
    'Tracer 01 (Identificação)',
    'Tracer 02 (Cirurgia Segura)',
    'Tracer 03 (Proc. Medicação)',
    'Período / Competência'
  ];

  const rows: string[] = [];
  rows.push(headers.map(escapeCSVValue).join(';'));

  unitSummaries.forEach(u => {
    const row = [
      escapeCSVValue(u.unitName),
      escapeCSVValue(u.target),
      escapeCSVValue(u.completed),
      escapeCSVValue(`${u.coveragePct.toFixed(1)}%`),
      escapeCSVValue(`${u.compliancePct.toFixed(1)}%`),
      escapeCSVValue(u.t01Count || 0),
      escapeCSVValue(u.t02Count || 0),
      escapeCSVValue(u.t03Count || 0),
      escapeCSVValue(periodName || 'Geral')
    ];
    rows.push(row.join(';'));
  });

  const now = new Date();
  const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fileName = `resumo_indicadores_unidades_${dateStamp}.csv`;

  downloadCSV(rows.join('\r\n'), fileName);
}
