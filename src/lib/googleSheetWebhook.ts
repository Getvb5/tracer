/**
 * Google Sheets Destination Integration (Google Apps Script Webhooks)
 * Enables real-time row dispatching from Clinical Tracer Forms directly into Google Sheets.
 * Syncs webhook URLs across Firebase Firestore & LocalStorage for multi-device reliability.
 */
import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export interface SheetWebhookConfig {
  tracer_01: string;
  tracer_02: string;
  tracer_03: string;
}

export interface SendAuditResult {
  success: boolean;
  message: string;
  queued?: boolean;
  sheetName?: string;
  rowNumber?: number;
}

/**
 * Validates a Google Apps Script Webhook URL and flags common user mistakes.
 */
export function validateWebhookUrl(url?: string): { valid: boolean; error?: string; warning?: string; fixedUrl?: string } {
  if (!url || !url.trim()) {
    return { valid: false, error: 'URL não configurada no sistema.' };
  }
  const clean = url.trim();
  if (clean.includes('docs.google.com/spreadsheets')) {
    return {
      valid: false,
      error: 'Você colou o link de visualização da planilha (docs.google.com). É necessário criar uma implantação no Apps Script (Extensões > Apps Script > Implantar) e colar a URL do Web App gerada (script.google.com/.../exec).'
    };
  }
  if (clean.endsWith('/dev')) {
    return {
      valid: true,
      fixedUrl: clean.replace(/\/dev$/, '/exec'),
      warning: 'Aviso: A URL terminava com "/dev" e foi corrigida para "/exec" (a versão /dev requer login e não grava dados).'
    };
  }
  if (!clean.startsWith('https://script.google.com/macros/s/')) {
    return {
      valid: false,
      error: 'A URL informada não parece ser um Web App do Google Apps Script (deve começar com https://script.google.com/macros/s/... e terminar com /exec).'
    };
  }
  if (!clean.endsWith('/exec')) {
    return {
      valid: true,
      warning: 'Atenção: Para garantir funcionamento contínuo, a URL do Web App deve terminar com "/exec".'
    };
  }
  return { valid: true };
}

/**
 * Formats ISO or YYYY-MM-DD string into standard Brazilian Date (DD/MM/YYYY)
 */
export function formatBrDate(isoOrDateStr?: string): string {
  if (!isoOrDateStr) return '';
  const clean = String(isoOrDateStr).trim();
  if (clean.includes('/')) return clean;
  const parts = clean.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return clean;
}

/**
 * Formats time string into standard Brazilian Time (HH:mm:ss)
 */
export function formatBrTime(timeStr?: string): string {
  if (!timeStr) return '';
  const clean = String(timeStr).trim();
  if (clean.length === 5) return `${clean}:00`;
  return clean;
}

/**
 * Formats current Date into standard Google Sheets Timestamp: "DD/MM/YYYY HH:mm:ss" (no comma)
 */
export function formatBrTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

const STORAGE_KEYS: Record<string, string> = {
  tracer_01: 'url_webhook_tracer_01',
  tracer_02: 'url_webhook_tracer_02',
  tracer_03: 'url_webhook_tracer_03'
};

const QUEUE_KEY = 'pending_google_sheet_audits';

// Standard embedded production webhook URLs for all environments & devices
export const DEFAULT_WEBHOOK_URLS: SheetWebhookConfig = {
  tracer_01: 'https://script.google.com/macros/s/AKfycbxbE8DGTBp7ayF16cfopb7ILcZZnL46_QNbiYcaQtRMqTMLEGmz4rB7PxX8SFSsQj6G/exec',
  tracer_02: 'https://script.google.com/macros/s/AKfycbxVUi0gmxWZMruzhUXqOrAkovY5Q7ZN-5-7u8Dz2ODJPs2FpKupD358rgiXMJMlT8J-yA/exec',
  tracer_03: 'https://script.google.com/macros/s/AKfycbwZlpqpARdII4OaulkQzgDf7POqhZnHJ2sV_n8etbt1HJn6pHo1eDr53odcAEUhcCr3CQ/exec'
};

// In-memory cache for fast, non-blocking lookup (pre-seeded with DEFAULT_WEBHOOK_URLS)
let inMemoryUrls: SheetWebhookConfig = {
  tracer_01: typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEYS.tracer_01) || DEFAULT_WEBHOOK_URLS.tracer_01) : DEFAULT_WEBHOOK_URLS.tracer_01,
  tracer_02: typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEYS.tracer_02) || DEFAULT_WEBHOOK_URLS.tracer_02) : DEFAULT_WEBHOOK_URLS.tracer_02,
  tracer_03: typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEYS.tracer_03) || DEFAULT_WEBHOOK_URLS.tracer_03) : DEFAULT_WEBHOOK_URLS.tracer_03
};

// Initialize cloud sync with Firestore
let initializedCloudSync = false;

export async function fetchWebhookUrlsFromCloud(): Promise<SheetWebhookConfig> {
  if (typeof window === 'undefined') return inMemoryUrls;
  try {
    const configDocRef = doc(db, 'system_config', 'webhook_urls');
    const snap = await getDoc(configDocRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<SheetWebhookConfig>;
      if (data) {
        if (data.tracer_01 !== undefined && data.tracer_01.trim()) {
          inMemoryUrls.tracer_01 = data.tracer_01.trim();
          localStorage.setItem(STORAGE_KEYS.tracer_01, data.tracer_01.trim());
        }
        if (data.tracer_02 !== undefined && data.tracer_02.trim()) {
          inMemoryUrls.tracer_02 = data.tracer_02.trim();
          localStorage.setItem(STORAGE_KEYS.tracer_02, data.tracer_02.trim());
        }
        if (data.tracer_03 !== undefined && data.tracer_03.trim()) {
          inMemoryUrls.tracer_03 = data.tracer_03.trim();
          localStorage.setItem(STORAGE_KEYS.tracer_03, data.tracer_03.trim());
        }
        window.dispatchEvent(new Event('webhook-urls-updated'));
      }
    } else {
      // Seed initial defaults to Firestore so all environments and users get them immediately
      setDoc(configDocRef, {
        ...DEFAULT_WEBHOOK_URLS,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }
  } catch (e: any) {
    console.warn('[GoogleSheetWebhook] Cloud fetch fallback notice:', e?.message || e);
  }
  return getAllWebhookUrls();
}

export function initWebhookCloudSync() {
  if (initializedCloudSync || typeof window === 'undefined') return;
  initializedCloudSync = true;

  // Immediate fetch
  fetchWebhookUrlsFromCloud().catch(() => {});

  try {
    const configDocRef = doc(db, 'system_config', 'webhook_urls');
    onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<SheetWebhookConfig>;
        if (data) {
          if (data.tracer_01 !== undefined && data.tracer_01.trim()) {
            inMemoryUrls.tracer_01 = data.tracer_01.trim();
            localStorage.setItem(STORAGE_KEYS.tracer_01, data.tracer_01.trim());
          }
          if (data.tracer_02 !== undefined && data.tracer_02.trim()) {
            inMemoryUrls.tracer_02 = data.tracer_02.trim();
            localStorage.setItem(STORAGE_KEYS.tracer_02, data.tracer_02.trim());
          }
          if (data.tracer_03 !== undefined && data.tracer_03.trim()) {
            inMemoryUrls.tracer_03 = data.tracer_03.trim();
            localStorage.setItem(STORAGE_KEYS.tracer_03, data.tracer_03.trim());
          }
          window.dispatchEvent(new Event('webhook-urls-updated'));
        }
      }
    }, (err) => {
      console.warn('[GoogleSheetWebhook] Cloud sync fallback to localStorage:', err?.message || err);
    });
  } catch (e) {
    console.warn('[GoogleSheetWebhook] Initialization notice:', e);
  }
}

// Auto-run cloud sync
initWebhookCloudSync();

export function getWebhookUrl(tracerId: 'tracer_01' | 'tracer_02' | 'tracer_03' | string, allowFallback: boolean = true): string {
  const normId = tracerId === '01' || tracerId === 'T01' ? 'tracer_01' : tracerId === '02' || tracerId === 'T02' ? 'tracer_02' : tracerId === '03' || tracerId === 'T03' ? 'tracer_03' : tracerId;
  const key = STORAGE_KEYS[normId] || `url_webhook_${normId}`;
  
  let raw = inMemoryUrls[normId as keyof SheetWebhookConfig] || 
    (typeof localStorage !== 'undefined' ? localStorage.getItem(key) || '' : '') ||
    DEFAULT_WEBHOOK_URLS[normId as keyof SheetWebhookConfig] || '';
  
  // Smart fallback: if this specific tracer has no dedicated URL, use any configured tracer URL
  if ((!raw || !raw.trim()) && allowFallback) {
    raw = inMemoryUrls.tracer_01 || inMemoryUrls.tracer_02 || inMemoryUrls.tracer_03 ||
      (typeof localStorage !== 'undefined' ? 
        localStorage.getItem(STORAGE_KEYS.tracer_01) || 
        localStorage.getItem(STORAGE_KEYS.tracer_02) || 
        localStorage.getItem(STORAGE_KEYS.tracer_03) || 
        localStorage.getItem('url_webhook_global') || '' : '') ||
      DEFAULT_WEBHOOK_URLS.tracer_01 ||
      DEFAULT_WEBHOOK_URLS.tracer_02 ||
      DEFAULT_WEBHOOK_URLS.tracer_03 || '';
  }
  
  if (raw && raw.trim()) {
    let clean = raw.trim();
    if (clean.endsWith('/dev')) {
      clean = clean.replace(/\/dev$/, '/exec');
    }
    return clean;
  }
  
  return '';
}

export async function setWebhookUrl(tracerId: 'tracer_01' | 'tracer_02' | 'tracer_03' | string, url: string): Promise<void> {
  const normId = tracerId === '01' || tracerId === 'T01' ? 'tracer_01' : tracerId === '02' || tracerId === 'T02' ? 'tracer_02' : tracerId === '03' || tracerId === 'T03' ? 'tracer_03' : tracerId;
  const key = STORAGE_KEYS[normId] || `url_webhook_${normId}`;
  let cleanUrl = url ? url.trim() : '';
  if (cleanUrl.endsWith('/dev')) {
    cleanUrl = cleanUrl.replace(/\/dev$/, '/exec');
  }

  // 1. Update in-memory & LocalStorage immediately
  if (!cleanUrl) {
    localStorage.removeItem(key);
    if (normId in inMemoryUrls) {
      inMemoryUrls[normId as keyof SheetWebhookConfig] = '';
    }
  } else {
    localStorage.setItem(key, cleanUrl);
    if (normId in inMemoryUrls) {
      inMemoryUrls[normId as keyof SheetWebhookConfig] = cleanUrl;
    }
  }

  window.dispatchEvent(new Event('webhook-urls-updated'));

  // 2. Persist to Firestore for all connected devices
  try {
    const configDocRef = doc(db, 'system_config', 'webhook_urls');
    await setDoc(configDocRef, {
      [normId]: cleanUrl,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('[GoogleSheetWebhook] Failed to save webhook URL to Firestore (saved locally):', err);
  }

  if (cleanUrl) {
    flushPendingQueue().catch(() => {});
  }
}

export async function setAllWebhookUrls(config: SheetWebhookConfig): Promise<{ success: boolean; cloudSynced: boolean; message: string }> {
  const sanitize = (u?: string) => {
    let s = (u || '').trim();
    if (s.endsWith('/dev')) s = s.replace(/\/dev$/, '/exec');
    return s;
  };

  const cleanConfig: SheetWebhookConfig = {
    tracer_01: sanitize(config.tracer_01),
    tracer_02: sanitize(config.tracer_02),
    tracer_03: sanitize(config.tracer_03)
  };

  inMemoryUrls = { ...cleanConfig };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.tracer_01, cleanConfig.tracer_01);
    localStorage.setItem(STORAGE_KEYS.tracer_02, cleanConfig.tracer_02);
    localStorage.setItem(STORAGE_KEYS.tracer_03, cleanConfig.tracer_03);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('webhook-urls-updated'));
  }

  // 2. Persist to Firestore for all connected devices
  let cloudSynced = false;
  try {
    const configDocRef = doc(db, 'system_config', 'webhook_urls');
    await setDoc(configDocRef, {
      ...cleanConfig,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    cloudSynced = true;
  } catch (err: any) {
    console.warn('[GoogleSheetWebhook] Cloud sync warning (saved locally):', err?.message || err);
  }

  // 3. Automatically dispatch any pending queue if URLs are now set!
  if (cleanConfig.tracer_01 || cleanConfig.tracer_02 || cleanConfig.tracer_03) {
    flushPendingQueue().catch(() => {});
  }

  return {
    success: true,
    cloudSynced,
    message: cloudSynced 
      ? 'URLs salvas e sincronizadas na nuvem com sucesso para todos os auditores e dispositivos!' 
      : 'URLs salvas localmente neste navegador.'
  };
}

export function getAllWebhookUrls(): SheetWebhookConfig {
  return {
    tracer_01: getWebhookUrl('tracer_01', false),
    tracer_02: getWebhookUrl('tracer_02', false),
    tracer_03: getWebhookUrl('tracer_03', false)
  };
}

export interface PendingAuditItem {
  id: string;
  tracerId: string;
  type: string;
  timestamp: string;
  rawData: Record<string, any>;
  patientName?: string;
  unitName?: string;
  auditorName?: string;
  medicalRecordNumber?: string;
  tracerDate?: string;
  tracerTime?: string;
  sector?: string;
}

export function getPendingQueue(): PendingAuditItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToQueue(item: PendingAuditItem): void {
  try {
    const queue = getPendingQueue();
    // Avoid duplicate IDs
    const filtered = queue.filter(q => q.id !== item.id);
    filtered.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('pending-queue-updated'));
    }
  } catch (e) {
    console.error('[GoogleSheetWebhook] Failed to save to pending queue:', e);
  }
}

export function removeFromQueue(id: string): void {
  try {
    const queue = getPendingQueue();
    const filtered = queue.filter(q => q.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('pending-queue-updated'));
    }
  } catch (e) {
    console.error('[GoogleSheetWebhook] Failed to remove from queue:', e);
  }
}

/**
 * Dispatches an audit record to the destination Google Sheet Webhook.
 */
export async function sendAuditToGoogleSheet(audit: {
  id: string;
  tracerId: 'tracer_01' | 'tracer_02' | 'tracer_03' | string;
  type: string;
  rawData: Record<string, any>;
  patientName?: string;
  unitName?: string;
  auditorName?: string;
  medicalRecordNumber?: string;
  tracerDate?: string;
  tracerTime?: string;
  sector?: string;
}): Promise<SendAuditResult> {
  const normTracerId = audit.tracerId === '01' || audit.tracerId === 'T01' ? 'tracer_01' : audit.tracerId === '02' || audit.tracerId === 'T02' ? 'tracer_02' : audit.tracerId === '03' || audit.tracerId === 'T03' ? 'tracer_03' : audit.tracerId;
  const webhookUrl = getWebhookUrl(normTracerId);

  // Normalize rawData with standard headers and timestamps
  const enrichedData: Record<string, any> = { ...audit.rawData };

  // Timestamp format: "DD/MM/YYYY HH:mm:ss" without comma
  if (!enrichedData['Carimbo de data/hora']) {
    enrichedData['Carimbo de data/hora'] = formatBrTimestamp(new Date());
  }

  // Ensure standard fields are available with canonical keys
  if (audit.unitName && !enrichedData['Nome do Hospital/Maternidade']) {
    enrichedData['Nome do Hospital/Maternidade'] = audit.unitName;
    enrichedData['Nome do Hospital/Maternidade:'] = audit.unitName;
  }
  if (audit.patientName && !enrichedData['Nome Completo do Paciente:']) {
    enrichedData['Nome Completo do Paciente:'] = audit.patientName;
    enrichedData['Nome Completo do Paciente'] = audit.patientName;
  }
  if (audit.auditorName && !enrichedData['Nome Completo do Auditor:']) {
    enrichedData['Nome Completo do Auditor:'] = audit.auditorName;
    enrichedData['Nome Completo do Auditor'] = audit.auditorName;
  }
  if (audit.medicalRecordNumber && !enrichedData['Nº do Prontuário do Paciente:']) {
    enrichedData['Nº do Prontuário do Paciente:'] = audit.medicalRecordNumber;
    enrichedData['Nº do Prontuário do Paciente'] = audit.medicalRecordNumber;
  }
  if (audit.tracerDate && !enrichedData['Data do Tracer:']) {
    enrichedData['Data do Tracer:'] = formatBrDate(audit.tracerDate);
  }
  if (audit.tracerTime && !enrichedData['Horário do Início do Tracer:']) {
    enrichedData['Horário do Início do Tracer:'] = formatBrTime(audit.tracerTime);
  }
  if (audit.sector && !enrichedData['Setor Auditado:']) {
    enrichedData['Setor Auditado:'] = audit.sector;
  }

  // Validation
  const validation = validateWebhookUrl(webhookUrl);
  if (!validation.valid) {
    // Webhook not configured yet or invalid; save in pending queue in case user configures it later
    saveToQueue({
      id: audit.id,
      tracerId: normTracerId,
      type: audit.type,
      timestamp: new Date().toISOString(),
      rawData: enrichedData,
      patientName: audit.patientName,
      unitName: audit.unitName,
      auditorName: audit.auditorName,
      medicalRecordNumber: audit.medicalRecordNumber,
      tracerDate: audit.tracerDate,
      tracerTime: audit.tracerTime,
      sector: audit.sector
    });
    return {
      success: false,
      message: validation.error || 'URL do Webhook da Planilha Destino não configurada. A coleta foi guardada na fila de pendências.',
      queued: true
    };
  }

  const effectiveUrl = validation.fixedUrl || webhookUrl;

  const payload = {
    action: 'add_row',
    id: audit.id,
    tracerId: normTracerId,
    type: audit.type,
    patientName: audit.patientName || '',
    unitName: audit.unitName || '',
    auditorName: audit.auditorName || '',
    medicalRecordNumber: audit.medicalRecordNumber || '',
    tracerDate: formatBrDate(audit.tracerDate) || '',
    tracerTime: formatBrTime(audit.tracerTime) || '',
    sector: audit.sector || '',
    createdAt: new Date().toISOString(),
    data: enrichedData
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    // Mode 'no-cors' is essential for standard Google Apps Script Web Apps to prevent hanging and CORS redirect errors
    await fetch(effectiveUrl, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    // Remove from pending queue if present
    removeFromQueue(audit.id);

    return {
      success: true,
      message: 'Coleta gravada com sucesso na planilha destino!'
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('[GoogleSheetWebhook] Send failed, saving to retry queue:', err);
    saveToQueue({
      id: audit.id,
      tracerId: normTracerId,
      type: audit.type,
      timestamp: new Date().toISOString(),
      rawData: enrichedData,
      patientName: audit.patientName,
      unitName: audit.unitName,
      auditorName: audit.auditorName,
      medicalRecordNumber: audit.medicalRecordNumber,
      tracerDate: audit.tracerDate,
      tracerTime: audit.tracerTime,
      sector: audit.sector
    });

    const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
    return {
      success: false,
      message: isTimeout 
        ? 'Tempo limite de conexão esgotado (9s). A coleta foi guardada na fila de pendências para reenvio automático.'
        : `Erro no envio: ${err?.message || 'Falha de rede'}. Registro guardado na fila de reenvio.`,
      queued: true
    };
  }
}

/**
 * Dedicated, lightweight connection tester that does NOT pollute the pending audit queue.
 * Protected by an 8-second AbortController timeout to guarantee it never hangs in an infinite loop.
 */
export async function testWebhookConnection(
  tracerId: 'tracer_01' | 'tracer_02' | 'tracer_03' | string,
  explicitUrl?: string
): Promise<{ success: boolean; message: string }> {
  const normTracerId = tracerId === '01' || tracerId === 'T01' ? 'tracer_01' : tracerId === '02' || tracerId === 'T02' ? 'tracer_02' : tracerId === '03' || tracerId === 'T03' ? 'tracer_03' : tracerId;
  const targetUrl = (explicitUrl || getWebhookUrl(normTracerId, true) || '').trim();

  const val = validateWebhookUrl(targetUrl);
  if (!val.valid) {
    return {
      success: false,
      message: val.error || 'URL do Webhook não configurada ou inválida.'
    };
  }

  const effectiveUrl = val.fixedUrl || targetUrl;

  const testPayload = {
    action: 'add_row',
    id: 'test_' + Date.now(),
    tracerId: normTracerId,
    type: normTracerId === 'tracer_01' ? 'T01' : normTracerId === 'tracer_02' ? 'T02' : 'T03',
    patientName: 'TESTE DE CONEXÃO DO SISTEMA',
    unitName: 'Hospital / Unidade de Teste',
    auditorName: 'Auditor do Sistema (Teste)',
    medicalRecordNumber: '000000',
    tracerDate: new Date().toLocaleDateString('pt-BR'),
    tracerTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    sector: 'Teste de Integração Webhook',
    createdAt: new Date().toISOString(),
    data: {
      'Carimbo de data/hora': new Date().toLocaleString('pt-BR'),
      'Nome do Hospital/Maternidade': 'Hospital / Unidade de Teste',
      'Nome Completo do Auditor:': 'Auditor do Sistema (Teste)',
      'Nome Completo do Paciente:': 'PACIENTE TESTE DE CONEXÃO',
      'Nº do Prontuário do Paciente:': '000000',
      'Data do Tracer:': new Date().toLocaleDateString('pt-BR'),
      'Horário do Início do Tracer:': new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      'Setor Auditado:': 'Teste de Integração Webhook',
      'Status': 'CONEXÃO BEM-SUCEDIDA!'
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    await fetch(effectiveUrl, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(testPayload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    return {
      success: true,
      message: 'Conexão bem-sucedida! Linha de teste transmitida com sucesso para o Google Sheets.'
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      return {
        success: false,
        message: 'Tempo limite esgotado (8s). O Google Apps Script demorou muito para responder. Verifique se a URL está correta e se a implantação foi configurada como "Qualquer pessoa".'
      };
    }
    return {
      success: false,
      message: `Falha na transmissão: ${err?.message || 'Erro de rede ou conexão bloqueada'}.`
    };
  }
}

/**
 * Deletes an audit record from the destination Google Sheet via Webhook.
 */
export async function deleteAuditFromGoogleSheet(audit: {
  id: string;
  tracerId: 'tracer_01' | 'tracer_02' | 'tracer_03' | string;
  type?: string;
  patientName?: string;
  unitName?: string;
  timestamp?: string;
  rawData?: Record<string, any>;
}): Promise<{ success: boolean; message: string }> {
  const normTracerId = audit.tracerId === '01' || audit.tracerId === 'T01' ? 'tracer_01' : audit.tracerId === '02' || audit.tracerId === 'T02' ? 'tracer_02' : audit.tracerId === '03' || audit.tracerId === 'T03' ? 'tracer_03' : audit.tracerId;
  const webhookUrl = getWebhookUrl(normTracerId);

  if (!webhookUrl) {
    return {
      success: false,
      message: 'Webhook da planilha não configurado.'
    };
  }

  const payload = {
    action: 'delete_row',
    id: audit.id,
    tracerId: normTracerId,
    type: audit.type || '',
    patientName: audit.patientName || '',
    unitName: audit.unitName || '',
    timestamp: audit.timestamp || '',
    data: audit.rawData || {}
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    return {
      success: true,
      message: 'Comando de exclusão transmitido para a planilha destino.'
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('[GoogleSheetWebhook] Delete request failed:', err);
    return {
      success: false,
      message: `Falha ao excluir na planilha: ${err?.message || 'Erro de rede'}`
    };
  }
}

/**
 * Retries sending all pending queued audits.
 */
export async function flushPendingQueue(): Promise<{ sent: number; total: number; errors: number }> {
  const queue = getPendingQueue();
  if (queue.length === 0) return { sent: 0, total: 0, errors: 0 };

  let sent = 0;
  let errors = 0;

  for (const item of queue) {
    const webhookUrl = getWebhookUrl(item.tracerId, true);
    if (!webhookUrl) {
      errors++;
      continue;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: 'add_row',
          id: item.id,
          tracerId: item.tracerId,
          type: item.type,
          patientName: item.patientName || '',
          unitName: item.unitName || '',
          auditorName: item.auditorName || '',
          medicalRecordNumber: item.medicalRecordNumber || '',
          tracerDate: item.tracerDate || '',
          tracerTime: item.tracerTime || '',
          sector: item.sector || '',
          createdAt: item.timestamp,
          data: item.rawData
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      removeFromQueue(item.id);
      sent++;
    } catch {
      clearTimeout(timeoutId);
      errors++;
    }
  }

  return { sent, total: queue.length, errors };
}

// Auto-flush pending queue when internet connection restores
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushPendingQueue().catch(() => {});
  });
}

/**
 * Generates ready-to-copy Google Apps Script code for destination spreadsheets.
 * Features smart column header normalization and multi-tab safety.
 */
export function getAppsScriptCode(): string {
  return `/**
 * CÓDIGO DO GOOGLE APPS SCRIPT PARA SINCRONIZAÇÃO COMPLETA DOS TRACERS
 * (GRAVAÇÃO AUTOMÁTICA EM TEMPO REAL + EXCLUSÃO INTELIGENTE DE LINHAS)
 * 
 * INSTRUÇÕES RÁPIDAS (1 Minuto):
 * 1. Abra a sua Planilha no Google Sheets onde deseja receber os dados.
 * 2. No menu superior da planilha, clique em: Extensões > Apps Script.
 * 3. Apague QUALQUER código existente no editor e COLE este código completo.
 * 4. Clique no botão azul "Implantar" (Deploy) no canto superior direito > "Gerenciar Implantações" ou "Nova Implantação".
 * 5. Se for Nova Implantação, escolha "App da Web" (Web App).
 * 6. Configure rigorosamente assim:
 *    - Descrição: "Webhook Tracers Hospitalares"
 *    - Executar como: "Eu" (seu e-mail)
 *    - Quem tem acesso: "Qualquer pessoa" (Anyone) -> ESSENCIAL! Se deixar "Apenas eu", a planilha não recebe dados do app!
 * 7. Clique em "Implantar" (ou "Atualizar").
 * 8. Copie a "URL do App da Web" gerada (termina com /exec) e cole no sistema.
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000);
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: 'error', 
        message: 'Conteúdo da requisição vazio ou inválido.' 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action || 'add_row';
    var tracerId = String(postData.tracerId || '').toLowerCase();
    var tracerType = String(postData.type || '').toUpperCase();
    var allSheets = ss.getSheets();
    
    // Normalização de nomes de abas
    function cleanSheetName(val) {
      if (!val) return '';
      return String(val)
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
    }

    var sheet = null;
    
    // 1. Identificação inteligente da aba correta de acordo com o Tracer
    if (tracerId.indexOf('01') !== -1 || tracerType === 'T01') {
      for (var i = 0; i < allSheets.length; i++) {
        var sn = cleanSheetName(allSheets[i].getName());
        if (sn.indexOf('tracer 01') !== -1 || sn.indexOf('tracer 1') !== -1 || sn.indexOf('t01') !== -1 || 
            sn.indexOf('beira leito') !== -1 || sn.indexOf('identificacao') !== -1 || 
            sn.indexOf('respostas ao formulario 1') !== -1 || sn.indexOf('form responses 1') !== -1) {
          sheet = allSheets[i];
          break;
        }
      }
    } else if (tracerId.indexOf('02') !== -1 || tracerType === 'T02') {
      for (var i = 0; i < allSheets.length; i++) {
        var sn = cleanSheetName(allSheets[i].getName());
        if (sn.indexOf('tracer 02') !== -1 || sn.indexOf('tracer 2') !== -1 || sn.indexOf('t02') !== -1 || 
            sn.indexOf('cirurg') !== -1 || 
            sn.indexOf('respostas ao formulario 2') !== -1 || sn.indexOf('form responses 2') !== -1) {
          sheet = allSheets[i];
          break;
        }
      }
    } else if (tracerId.indexOf('03') !== -1 || tracerType === 'T03') {
      for (var i = 0; i < allSheets.length; i++) {
        var sn = cleanSheetName(allSheets[i].getName());
        if (sn.indexOf('tracer 03') !== -1 || sn.indexOf('tracer 3') !== -1 || sn.indexOf('t03') !== -1 || 
            sn.indexOf('medicac') !== -1 || sn.indexOf('higiene') !== -1 || 
            sn.indexOf('respostas ao formulario 3') !== -1 || sn.indexOf('form responses 3') !== -1) {
          sheet = allSheets[i];
          break;
        }
      }
    }
    
    // Fallbacks padrão se não houver aba específica
    if (!sheet) {
      sheet = ss.getSheetByName("Form_Responses") || 
              ss.getSheetByName("Form Responses 1") || 
              ss.getSheetByName("Respostas ao formulário 1") || 
              ss.getSheetByName("Respostas ao formulario 1") || 
              ss.getSheetByName("Respostas") || 
              ss.getSheetByName("Página1") || 
              ss.getSheetByName("Página 1") || 
              ss.getActiveSheet() || 
              allSheets[0];
    }
    
    // Helper para formatar data/hora nativa do Google Sheets: "DD/MM/YYYY HH:mm:ss"
    function formatDateTime(d) {
      var pad = function(n) { return (n < 10 ? '0' : '') + n; };
      return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + 
             pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    
    // Helper de limpeza e normalização de cabeçalhos
    function cleanStr(val) {
      if (!val) return '';
      return String(val)
        .replace(/^[0-9]+[\\.\\s\\-]+/g, '')  // remove prefixos numéricos ("02-", "01. ")
        .replace(/[:\\?\\*\\n\\r\\t_]/g, ' ')   // remove pontuação, quebras de linha e underscores
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') // remove acentuação
        .toLowerCase()
        .replace(/\\s+/g, ' ')
        .trim();
    }
    
    // ==========================================
    // AÇÃO 1: EXCLUIR LINHA DA PLANILHA (DELETE)
    // ==========================================
    if (action === 'delete_row' || action === 'delete') {
      var targetId = String(postData.id || '').trim();
      var targetPatient = cleanStr(postData.patientName || '');
      var targetUnit = cleanStr(postData.unitName || '');
      
      var dataRange = sheet.getDataRange();
      var values = dataRange.getValues();
      if (values.length <= 1) {
        return ContentService.createTextOutput(JSON.stringify({ 
          status: 'success', 
          message: 'Planilha sem dados para excluir.' 
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      var headers = values[0];
      var deletedRowsCount = 0;
      var patientColIdx = -1;
      var unitColIdx = -1;
      
      for (var h = 0; h < headers.length; h++) {
        var nH = cleanStr(headers[h]);
        if (patientColIdx === -1 && (nH.indexOf('paciente') !== -1 || nH.indexOf('prontuario') !== -1)) {
          patientColIdx = h;
        }
        if (unitColIdx === -1 && (nH.indexOf('hospital') !== -1 || nH.indexOf('unidade') !== -1 || nH.indexOf('maternidade') !== -1)) {
          unitColIdx = h;
        }
      }
      
      for (var r = values.length - 1; r >= 1; r--) {
        var row = values[r];
        var isMatch = false;
        
        // Match por ID se gravado em coluna
        if (targetId) {
          for (var c = 0; c < row.length; c++) {
            if (String(row[c]).trim() === targetId) {
              isMatch = true;
              break;
            }
          }
        }
        
        // Match por Paciente + Unidade
        if (!isMatch && targetPatient && patientColIdx !== -1) {
          var rowPat = cleanStr(row[patientColIdx]);
          if (rowPat && (rowPat.indexOf(targetPatient) !== -1 || targetPatient.indexOf(rowPat) !== -1)) {
            if (targetUnit && unitColIdx !== -1) {
              var rowUn = cleanStr(row[unitColIdx]);
              if (rowUn && (rowUn.indexOf(targetUnit) !== -1 || targetUnit.indexOf(rowUn) !== -1)) {
                isMatch = true;
              }
            } else {
              isMatch = true;
            }
          }
        }
        
        if (isMatch) {
          sheet.deleteRow(r + 1);
          deletedRowsCount++;
        }
      }
      
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({ 
        status: 'success', 
        message: deletedRowsCount > 0 
          ? 'Excluída(s) ' + deletedRowsCount + ' linha(s) da planilha com sucesso!' 
          : 'Nenhuma linha correspondente encontrada na planilha.' 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // ==========================================
    // AÇÃO 2: ADICIONAR NOVA LINHA (ADD_ROW)
    // ==========================================
    var rowData = postData.data || {};
    
    // Garante Carimbo de data/hora no formato limpo padrão
    if (!rowData['Carimbo de data/hora'] && !rowData['Data e Hora']) {
      rowData['Carimbo de data/hora'] = formatDateTime(new Date());
    }
    
    var lastCol = sheet.getLastColumn();
    var headers = [];
    if (lastCol > 0) {
      headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }
    
    // Se a planilha estiver completamente vazia, inicializar cabeçalhos da primeira linha
    if (headers.length === 0 || (headers.length === 1 && String(headers[0]).trim() === '')) {
      headers = Object.keys(rowData);
      sheet.appendRow(headers);
    }
    
    var normHeaders = headers.map(cleanStr);
    var newRow = [];
    
    // Mapeamento coluna a coluna rigoroso para cada cabeçalho existente na planilha
    for (var c = 0; c < headers.length; c++) {
      var header = String(headers[c] || '').trim();
      var normH = normHeaders[c];
      var val = undefined;
      
      // 1. Busca direta exata pelo nome do cabeçalho
      if (rowData[header] !== undefined && rowData[header] !== null && String(rowData[header]).trim() !== '') {
        val = rowData[header];
      }
      
      // 2. Busca exata com/sem dois-pontos final
      if (val === undefined) {
        if (header.slice(-1) === ':') {
          var withoutColon = header.slice(0, -1).trim();
          if (rowData[withoutColon] !== undefined && String(rowData[withoutColon]).trim() !== '') {
            val = rowData[withoutColon];
          }
        } else {
          var withColon = header + ':';
          if (rowData[withColon] !== undefined && String(rowData[withColon]).trim() !== '') {
            val = rowData[withColon];
          }
        }
      }
      
      // 3. Busca normalizada inteligente em todas as chaves enviadas
      if (val === undefined) {
        for (var k in rowData) {
          if (rowData[k] !== undefined && rowData[k] !== null && String(rowData[k]).trim() !== '') {
            if (cleanStr(k) === normH) {
              val = rowData[k];
              break;
            }
          }
        }
      }
      
      // 4. Fallbacks semânticos baseados no tipo da coluna
      if (val === undefined || val === null || val === '') {
        if (normH.indexOf('carimbo') !== -1 || normH.indexOf('data e hora') !== -1 || normH.indexOf('timestamp') !== -1) {
          val = rowData['Carimbo de data/hora'] || formatDateTime(new Date());
        } else if (normH.indexOf('hospital') !== -1 || normH.indexOf('maternidade') !== -1 || normH.indexOf('unidade') !== -1) {
          val = postData.unitName || rowData['Nome do Hospital/Maternidade'] || rowData['Nome do Hospital/Maternidade:'] || '';
        } else if (normH.indexOf('data') !== -1 && normH.indexOf('tracer') !== -1) {
          val = postData.tracerDate || rowData['Data do Tracer:'] || rowData['Data do Tracer'] || rowData['Data'] || '';
        } else if (normH.indexOf('horario') !== -1 || (normH.indexOf('hora') !== -1 && normH.indexOf('inicio') !== -1)) {
          val = postData.tracerTime || rowData['Horário do Início do Tracer:'] || rowData['Horário do Início do Tracer'] || rowData['Horario'] || '';
        } else if (normH.indexOf('setor') !== -1) {
          val = postData.sector || rowData['Setor Auditado:'] || rowData['Setor Auditado'] || rowData['Setor'] || '';
        } else if (normH.indexOf('auditor') !== -1) {
          val = postData.auditorName || rowData['Nome Completo do Auditor:'] || rowData['Nome Completo do Auditor'] || rowData['Auditor'] || '';
        } else if (normH.indexOf('paciente') !== -1 && (normH.indexOf('nome') !== -1 || normH.indexOf('completo') !== -1)) {
          val = postData.patientName || rowData['Nome Completo do Paciente:'] || rowData['Nome Completo do Paciente'] || rowData['Nome do paciente:'] || '';
        } else if (normH.indexOf('prontuario') !== -1) {
          val = postData.medicalRecordNumber || rowData['Nº do Prontuário do Paciente:'] || rowData['Nº do Prontuário do Paciente'] || '';
        } else {
          val = '';
        }
      }
      
      newRow.push(val);
    }
    
    // Grava a linha completa na aba correta da planilha
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    var lastRowNow = sheet.getLastRow();
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'success', 
      sheetName: sheet.getName(),
      rowNumber: lastRowNow,
      message: 'Linha adicionada com sucesso na aba "' + sheet.getName() + '" (linha ' + lastRowNow + ')!' 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets().map(function(s) { 
      return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() }; 
    });
    return ContentService.createTextOutput(JSON.stringify({
      status: 'online',
      spreadsheetTitle: ss.getName(),
      sheets: sheets,
      message: 'Webhook dos Tracers está ativo e pronto para gravação em tempo real!'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput("Webhook de Sincronização dos Tracers está ativo!");
  }
}

function testarNoAppsScript() {
  var fakeEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'add_row',
        tracerId: 'tracer_01',
        type: 'T01',
        unitName: 'Hospital Geral (Teste do Editor)',
        patientName: 'Paciente Teste Editor',
        auditorName: 'Auditor do Sistema',
        medicalRecordNumber: '000123',
        tracerDate: '10/09/2026',
        tracerTime: '12:00:00',
        sector: 'Enfermaria',
        data: {
          'Carimbo de data/hora': '10/09/2026 12:00:00',
          'Nome do Hospital/Maternidade': 'Hospital Geral (Teste do Editor)',
          'Nome Completo do Auditor:': 'Auditor do Sistema',
          'Nome Completo do Paciente:': 'Paciente Teste Editor'
        }
      })
    }
  };
  var res = doPost(fakeEvent);
  Logger.log(res.getContent());
}`;
}
