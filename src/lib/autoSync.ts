import Papa from 'papaparse';
import { db } from './firebase';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { HEALTH_UNITS } from './utils';
import { getCustomLocalAudits, replaceSyncedLocalAudits } from './fallbackData';

export const TRACER_CONFIGS = [
  { 
    id: 'tracer_01', 
    name: 'TRACER 01 - Beira Leito', 
    collection: 'audits_patient_id',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSC60psAKcfv3iaypiyAh5jGoNKQJE0VgsZyLnAiWqeJrJEMrTHqel-Y4UWw2XUmWKfn8fxrQDZDXhK/pub?gid=322028166&single=true&output=csv'
  },
  { 
    id: 'tracer_02', 
    name: 'TRACER 02 - Proc. Cirúrgicos', 
    collection: 'audits_safe_surgery',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQPHGA77UVgNeDPZtg_7YXqLKFJE3Fezfr2Oy2Xl02eXwLr0ZbdkqjxPdhJv0AXFI8DJWJQoMTRpgQw/pub?gid=836928129&single=true&output=csv'
  },
  { 
    id: 'tracer_03', 
    name: 'TRACER 03 - Proc. Medicação', 
    collection: 'audits_hand_hygiene',
    defaultUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8pDmvLv8C5Ikqj4-5O8XBOax4YUUliyh8IlyuHM8UugyGUN8URqSs7V-BH7BPwmFzFsrUZQvPGXBw/pub?gid=842761097&single=true&output=csv'
  }
];

const sanitizeStr = (val: any): string => {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
};

const checkYes = (val: any) => {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  const lower = val.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return (
    lower === 'sim' || 
    lower === 's' || 
    lower === 'yes' || 
    lower === 'conforme' || 
    lower === 'true' || 
    lower === 'adequado' || 
    lower === 'c' || 
    lower === '1' || 
    lower === 'ok' ||
    lower === '✔' ||
    lower.startsWith('sim') ||
    lower.startsWith('conforme') ||
    lower.startsWith('adequado')
  );
};

export async function syncSingleTracer(tracerId: string, url: string, competencia = 'mai./2026') {
  const config = TRACER_CONFIGS.find(c => c.id === tracerId);
  if (!config || !url) return { success: false, error: 'Configuração ou URL inválida', imported: 0, updated: 0, skipped: 0, errors: 1 };

  let timeoutId: any = null;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => {
      try {
        controller.abort(new Error('Tempo limite de sincronização excedido (25s)'));
      } catch {
        controller.abort();
      }
    }, 25000); // 25s timeout safeguard for large Google Sheets

    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'Accept': 'text/csv, text/plain, */*'
      }
    });
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (!response.ok) {
      throw new Error(`Falha ao acessar planilha: HTTP ${response.status}`);
    }

    const csvText = await response.text();
    
    // Simple fast string hashing for CSV comparison
    let csvHash = 0;
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText.charCodeAt(i);
      csvHash = ((csvHash << 5) - csvHash) + char;
      csvHash = (csvHash & csvHash);
    }
    const csvHashStr = Math.abs(csvHash).toString(16);
    const lastHash = localStorage.getItem(`last_hash_${tracerId}`);
    
    if (lastHash === csvHashStr) {
      console.log(`[AutoSync] CSV hash unchanged for ${tracerId}. Skipping.`);
      return { success: true, imported: 0, updated: 0, skipped: 0, errors: 0 };
    }

    const parseResult = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    const data = (parseResult.data || []) as any[];
    if (!data || data.length === 0) {
      return { success: false, imported: 0, updated: 0, skipped: 0, errors: 1 };
    }

    let imported = 0;
    let skipped = 0;
    const localRecordsToSave: any[] = [];
    const targetType = tracerId === 'tracer_01' ? 'T01' : tracerId === 'tracer_02' ? 'T02' : 'T03';

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const keys = Object.keys(row);
      const removeAccents = (str: string) => 
         str ? str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';

      const findValue = (keywords: string[]) => {
         const cleanKeywords = keywords.map(kw => removeAccents(kw));
         const key = keys.find(k => {
           const cleanKey = removeAccents(k);
           return cleanKeywords.some(kw => cleanKey.includes(kw));
         });
         return key ? row[key] : null;
      };

      const findSpecificValue = (includesAll: string[], excludesAny: string[] = []) => {
         const cleanExcludes = excludesAny.map(e => removeAccents(e));
         const cleanIncludes = includesAll.map(i => removeAccents(i));
         const key = keys.find(k => {
           const cleanKey = removeAccents(k);
           const hasAll = cleanIncludes.every(inc => cleanKey.includes(inc));
           const hasAnyExclude = cleanExcludes.some(exc => cleanKey.includes(exc));
           return hasAll && !hasAnyExclude;
         });
         return key ? row[key] : null;
      };

      const hospitalName = row['Unidade de Saúde'] || row['UNIDADE'] || row['HOSPITAL'] || row['ESTABELECIMENTO'] || 
                           findValue(['unidade', 'hospital', 'maternidade']);

      if (!hospitalName || hospitalName.toString().trim() === '') {
        skipped++;
        continue;
      }

      const hNameClean = removeAccents(hospitalName.toString());
      const unit = HEALTH_UNITS.find(u => {
        const uNameClean = removeAccents(u.name);
        const hasAliasMatch = u.aliases?.some(alias => {
          const aliasClean = removeAccents(alias);
          return hNameClean.includes(aliasClean) || aliasClean.includes(hNameClean);
        });
        return uNameClean.includes(hNameClean) || hNameClean.includes(uNameClean) || hasAliasMatch;
      });

      if (!unit) {
        skipped++;
        continue;
      }

      const rowId = row['ID'] || row['Carimbo de data/hora'] || row['CARIMBO DE DATA/HORA'] || `row_${rowIndex}`;
      const deterministicId = `sync_${tracerId}_${unit.id}_${rowIndex}_${Math.abs(rowId.split('').reduce((a: any,b: any)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16)}`;

      // Dynamically compute the month and year of the row date
      let derivedCompetencia = competencia;
      let rowDateStr = String(
        row['03- Data do Tracer:'] ||
        row['03- Data do Tracer'] ||
        row['Data do Tracer:'] ||
        row['Data do Tracer'] ||
        row['DATA DO TRACER'] ||
        row['Data da Coleta:'] ||
        row['Data da Coleta'] ||
        row['DATA DA COLETA'] ||
        row['Data:'] ||
        row['Data'] ||
        row['DATA'] ||
        row['Carimbo de data/hora'] ||
        row['CARIMBO DE DATA/HORA'] || ''
      ).trim();

      let rowDateISO: string = new Date().toISOString();
      if (rowDateStr && rowDateStr !== '-') {
        const datePart = rowDateStr.split(' ')[0];
        const parts = datePart.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (parts) {
          const monthsAbbr = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
          const day = parseInt(parts[1], 10);
          const mIdx = parseInt(parts[2], 10) - 1;
          let year = parseInt(parts[3], 10);
          if (year < 100) year += 2000;
          if (year < 2000 || year > 2050) year = 2026;
          if (mIdx >= 0 && mIdx < 12) {
            derivedCompetencia = `${monthsAbbr[mIdx]}/${year}`;
            rowDateISO = new Date(Date.UTC(year, mIdx, day, 12, 0, 0)).toISOString();
          }
        }
      }
      
      // Clean row dictionary
      const cleanRow: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k && v !== undefined && v !== null) {
          const cleanK = sanitizeStr(k);
          const strVal = sanitizeStr(v);
          if (cleanK && strVal && strVal !== '-') {
            cleanRow[cleanK] = strVal;
          }
        }
      }
      
      const auditorCandidates = [
        row['Nome Completo do Auditor:'],
        row['Nome Completo do Auditor'],
        row['06- Nome Completo do Auditor:'],
        row['06- Nome Completo do Auditor'],
        row['05- Nome Completo do Auditor:'],
        row['05- Nome Completo do Auditor'],
        row['04- Nome Completo do Auditor:'],
        row['04- Nome Completo do Auditor'],
        row['Nome Completo do Auditor: '],
        row['Nome do Auditor:'],
        row['Nome do Auditor'],
        row['Auditor:'],
        row['Auditor'],
        cleanRow['Nome Completo do Auditor:'],
        cleanRow['Nome Completo do Auditor'],
        findSpecificValue(['auditor'], ['setor', 'unidade']),
        findValue(['auditor'])
      ];
      let auditorRaw = '';
      for (const c of auditorCandidates) {
        if (c && typeof c === 'string' && c.trim() && c.trim() !== '-' && c.trim() !== 'Auditor Sincronizado') {
          auditorRaw = c.trim();
          break;
        }
      }
      if (!auditorRaw) {
        for (const [k, v] of Object.entries(row)) {
          if (k.toLowerCase().includes('auditor') && !k.toLowerCase().includes('setor') && !k.toLowerCase().includes('unidade')) {
            if (v && typeof v === 'string' && v.trim() && v.trim() !== '-' && v.trim() !== 'Auditor Sincronizado') {
              auditorRaw = v.trim();
              break;
            }
          }
        }
      }
      if (!auditorRaw) {
        auditorRaw = 'Auditor de Campo';
      }

      const patientRaw = row['Nome Completo do Paciente:'] || row['Nome Completo do Paciente'] || row['Paciente:'] || row['Paciente'] || 'Paciente Auditado';
      const mrnRaw = row['Nº do Prontuário do Paciente:'] || row['Nº do Prontuário do Paciente'] || row['Prontuário:'] || row['Prontuário'] || '-';
      const sectorRaw = row['Setor Auditado:'] || row['Setor Auditado'] || row['Setor:'] || row['Setor'] || row['Tipo de procedimento:'] || '-';

      const auditData: any = {
        id: deterministicId,
        unitId: unit.id,
        unitName: unit.name,
        auditorId: 'sync_bot',
        auditorName: sanitizeStr(auditorRaw.toString()),
        patientName: sanitizeStr(patientRaw.toString()),
        medicalRecordNumber: sanitizeStr(mrnRaw.toString()),
        sector: sanitizeStr(sectorRaw.toString()),
        tracerNumber: config.id === 'tracer_01' ? 'T01' : config.id === 'tracer_02' ? 'T02' : 'T03',
        tracerName: config.name.split(' - ')[1],
        type: targetType,
        externalSource: true,
        competencia: derivedCompetencia,
        timestampStr: rowDateISO,
        rawData: cleanRow
      };

      if (tracerId === 'tracer_01') {
        auditData.hasWristband = checkYes(
          cleanRow['Paciente identificado com pulseira branca?'] ||
          cleanRow['Paciente identificado com pulseira branca'] ||
          findSpecificValue(['identificado', 'pulseira', 'branca']) ||
          findSpecificValue(['presenca', 'pulseira']) ||
          findSpecificValue(['possui', 'pulseira']) ||
          findValue(['pulseira'])
        );
        auditData.wristbandLegible = checkYes(
          cleanRow['A pulseira de identificação está legível?'] ||
          cleanRow['A pulseira de identificação está legível'] ||
          findSpecificValue(['pulseira', 'legivel']) ||
          findSpecificValue(['legibilidade']) ||
          findValue(['legivel', 'legibilidade'])
        );
        auditData.correctData = checkYes(
          cleanRow['A pulseira de identificação preenchida adequadamente?'] ||
          cleanRow['A pulseira de identificação preenchida adequadamente'] ||
          findSpecificValue(['pulseira', 'preenchida', 'adequadamente']) ||
          findSpecificValue(['dados', 'corretos']) ||
          findSpecificValue(['conferem']) ||
          findValue(['dados corretos', 'identificacao correta'])
        );
      } else if (tracerId === 'tracer_02') {
        auditData.signIIn = checkYes(
          cleanRow['Check list de cirurgia segura aplicado antes da indução anestésica?'] ||
          findSpecificValue(['check', 'inducao', 'anestesica']) ||
          findSpecificValue(['check', 'inducao']) ||
          findSpecificValue(['antes', 'inducao']) ||
          findValue(['sign in', 'indução'])
        );
        auditData.timeOut = checkYes(
          cleanRow['Check list de cirurgia segura aplicado antes da incisão cirúrgica?'] ||
          findSpecificValue(['check', 'incisao', 'cirurgica']) ||
          findSpecificValue(['check', 'incisao']) ||
          findSpecificValue(['antes', 'incisao'], ['antibiotico', 'compressas', 'instrumentais']) ||
          findValue(['time out', 'incisão'])
        );
        auditData.signOut = checkYes(
          cleanRow['Check list de cirurgia segura aplicado antes de sair da sala?'] ||
          findSpecificValue(['check', 'sair', 'sala']) ||
          findSpecificValue(['check', 'sair']) ||
          findSpecificValue(['antes', 'sair']) ||
          findValue(['sign out', 'saída'])
        );
      } else {
        auditData.compliant = checkYes(
          cleanRow['Houve higienização das mãos imediatamente antes da administração da medicação ?'] ||
          cleanRow['Houve higienização das mãos imediatamente antes da administração da medicação'] ||
          findSpecificValue(['higienizacao', 'maos']) ||
          findSpecificValue(['higienizou', 'maos']) ||
          findSpecificValue(['higiene', 'maos']) ||
          findValue(['higiene', 'higienização', 'conformidade', 'lavadora', 'pia', 'higienizou', 'mãos'])
        );
        auditData.handHygiene = auditData.compliant;
      }

      localRecordsToSave.push(auditData);
      imported++;
    }

    // Instantly update local memory & storage so data is immediately visible
    replaceSyncedLocalAudits(targetType, tracerId, localRecordsToSave);

    // Persist to Firestore asynchronously using batches (up to 400 docs per batch)
    if (localRecordsToSave.length > 0) {
      try {
        const chunkSize = 400;
        const batchPromises: Promise<any>[] = [];
        for (let i = 0; i < localRecordsToSave.length; i += chunkSize) {
          const chunk = localRecordsToSave.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          for (const item of chunk) {
            const docRef = doc(db, config.collection, item.id);
            batch.set(docRef, { ...item, timestamp: serverTimestamp() }, { merge: true });
          }
          batchPromises.push(batch.commit());
        }
        // Protect with an 8-second race so offline Firestore does not block or throw
        await Promise.race([
          Promise.all(batchPromises),
          new Promise(resolve => setTimeout(resolve, 8000))
        ]);
      } catch (err: any) {
        console.warn(`[AutoSync] Batch write to Firestore for ${tracerId} notice:`, err?.message || err);
      }
    }

    localStorage.setItem(`last_hash_${tracerId}`, csvHashStr);
    const now = new Date().toLocaleString('pt-BR');
    localStorage.setItem(`last_sync_${tracerId}`, now);

    return { success: true, imported, updated: 0, skipped, errors: 0 };
  } catch (err: any) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const isAbort = err?.name === 'AbortError' || (err?.message && String(err.message).toLowerCase().includes('abort'));
    const errorMsg = isAbort 
      ? 'Tempo limite excedido ao buscar dados da planilha (resposta demorou mais de 25s)' 
      : (err?.message || 'Erro de conexão com a planilha');

    console.warn(`[AutoSync] Aviso ao sincronizar ${tracerId}: ${errorMsg}`);
    return { success: false, error: errorMsg, imported: 0, updated: 0, skipped: 0, errors: 1 };
  }
}

export async function runAllSyncs(competencia = 'mai./2026') {
  const promises = TRACER_CONFIGS.map(async (config) => {
    const savedUrl = localStorage.getItem(`url_sync_${config.id}`) || config.defaultUrl;
    try {
      return await syncSingleTracer(config.id, savedUrl, competencia);
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.warn(`[AutoSync] Erro capturado em ${config.id}:`, msg);
      return { success: false, error: msg, imported: 0, updated: 0, skipped: 0, errors: 1 };
    }
  });
  return await Promise.all(promises);
}

