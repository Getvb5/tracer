const fetch = globalThis.fetch;
const Papa = require('papaparse');
const fs = require('fs');

const HEALTH_UNITS = [
  { id: 'hosp_helena_moura', name: 'Hospital de Pediatria Helena Moura', type: 'Hospital', district: 'Recife', aliases: ['Helena Moura', 'HPHM', 'Hospital Helena Moura', 'Hospital de Pediatria Helena Moura'] },
  { id: 'hosp_maria_cravo', name: 'Hospital de Pediatria Maria Cravo Gama', type: 'Hospital', district: 'Recife', aliases: ['Maria Cravo', 'HPMCG', 'Maria Cravo Gama', 'Hospital Maria Cravo', 'Hospital de Pediatria Maria Cravo Gama'] },
  { id: 'policlinica_barros_lima', name: 'Policlínica e Maternidade Prof. Barros Lima', type: 'Hospital', district: 'Recife', aliases: ['Barros Lima', 'PMBL', 'Prof. Barros Lima', 'Policlinica Barros Lima', 'Policlínica Barros Lima'] },
  { id: 'policlinica_arnaldo_marques', name: 'Policlínica e Maternidade Arnaldo Marques', type: 'Hospital', district: 'Recife', aliases: ['Arnaldo Marques', 'PMAM', 'Policlinica Arnaldo Marques', 'Policlínica Arnaldo Marques'] },
  { id: 'maternidade_bandeira_filho', name: 'Maternidade Bandeira Filho', type: 'Hospital', district: 'Recife', aliases: ['Bandeira Filho', 'MBF', 'Maternidade Bandeira Filho'] },
  { id: 'policlinica_amaury_coutinho', name: 'Policlínica Amaury Coutinho', type: 'Hospital', district: 'Recife', aliases: ['Amaury Coutinho', 'PAC', 'Policlinica Amaury Coutinho', 'Policlínica Amaury Coutinho'] },
  { id: 'policlinica_agamenon_magalhaes', name: 'Policlínica Agamenon Magalhães', type: 'Hospital', district: 'Recife', aliases: ['Agamenon Magalhães', 'PAM', 'Agamenon Magalhaes', 'Policlinica Agamenon Magalhaes', 'Policlínica Agamenon Magalhães'] },
];

const configs = [
  { id: 'tracer_01', type: 'T01', name: 'Tracer 01 - Beira Leito', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSC60psAKcfv3iaypiyAh5jGoNKQJE0VgsZyLnAiWqeJrJEMrTHqel-Y4UWw2XUmWKfn8fxrQDZDXhK/pub?gid=322028166&single=true&output=csv' },
  { id: 'tracer_02', type: 'T02', name: 'Tracer 02 - Cirurgia Segura', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQPHGA77UVgNeDPZtg_7YXqLKFJE3Fezfr2Oy2Xl02eXwLr0ZbdkqjxPdhJv0AXFI8DJWJQoMTRpgQw/pub?gid=836928129&single=true&output=csv' },
  { id: 'tracer_03', type: 'T03', name: 'Tracer 03 - Segurança Medicamentosa', url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8pDmvLv8C5Ikqj4-5O8XBOax4YUUliyh8IlyuHM8UugyGUN8URqSs7V-BH7BPwmFzFsrUZQvPGXBw/pub?gid=842761097&single=true&output=csv' }
];

const removeAccents = (str) => 
  str ? str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';

const sanitizeStr = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    .trim();
};

const checkYes = (val) => {
  if (!val) return false;
  const s = removeAccents(val.toString().trim());
  return s === 'sim' || s === 'conforme' || s === 'adequado' || s === 'presente' || s === 'realizado' || s === '1' || s.startsWith('sim');
};

async function generateAll() {
  const allAudits = [];
  const stats = {};

  for (const config of configs) {
    console.log('Fetching', config.id, '...');
    const res = await fetch(config.url);
    const csvText = await res.text();
    const parseResult = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const data = parseResult.data || [];
    let imported = 0;
    let skipped = 0;

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const keys = Object.keys(row);

      const findValue = (keywords) => {
        const cleanKeywords = keywords.map(kw => removeAccents(kw));
        const key = keys.find(k => {
          const cleanKey = removeAccents(k);
          return cleanKeywords.some(kw => cleanKey.includes(kw));
        });
        return key ? row[key] : null;
      };

      const findSpecificValue = (includesAll, excludesAny = []) => {
        const cleanExcludes = excludesAny.map(e => removeAccents(e));
        const cleanIncludes = includesAll.map(i => removeAccents(i));
        const key = keys.find(k => {
          const cleanKey = removeAccents(k);
          if (cleanKey.includes('justifique')) return false;
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
        const hasAliasMatch = u.aliases && u.aliases.some(alias => {
          const aliasClean = removeAccents(alias);
          return hNameClean.includes(aliasClean) || aliasClean.includes(hNameClean);
        });
        return uNameClean.includes(hNameClean) || hNameClean.includes(uNameClean) || hasAliasMatch;
      });

      if (!unit) {
        console.warn('Unmatched unit name:', hospitalName);
        skipped++;
        continue;
      }

      const rowId = row['ID'] || row['Carimbo de data/hora'] || row['CARIMBO DE DATA/HORA'] || ('row_' + rowIndex);
      let hashNum = 0;
      const strRowId = String(rowId);
      for (let i = 0; i < strRowId.length; i++) {
        hashNum = ((hashNum << 5) - hashNum) + strRowId.charCodeAt(i);
        hashNum = hashNum & hashNum;
      }
      const deterministicId = 'sync_' + config.id + '_' + unit.id + '_' + rowIndex + '_' + Math.abs(hashNum).toString(16);

      let derivedCompetencia = 'mai./2026';
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

      let rowDateISO = new Date().toISOString();
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
            derivedCompetencia = monthsAbbr[mIdx] + '/' + year;
            rowDateISO = new Date(Date.UTC(year, mIdx, day, 12, 0, 0)).toISOString();
          }
        }
      }

      const cleanRow = {};
      for (const [k, v] of Object.entries(row)) {
        if (k && v !== undefined && v !== null) {
          const cleanK = sanitizeStr(k);
          const strVal = sanitizeStr(v);
          if (cleanK && strVal && strVal !== '-') {
            cleanRow[cleanK] = strVal;
          }
        }
      }

      const auditorRaw = row['Nome Completo do Auditor:'] || row['Nome Completo do Auditor'] || row['Nome do Auditor:'] || row['Nome do Auditor'] || row['Auditor'] || 'Auditor Sincronizado';
      const patientRaw = row['Nome Completo do Paciente:'] || row['Nome Completo do Paciente'] || row['Paciente:'] || row['Paciente'] || 'Paciente Auditado';
      const mrnRaw = row['Nº do Prontuário do Paciente:'] || row['Nº do Prontuário do Paciente'] || row['Prontuário:'] || row['Prontuário'] || '-';
      const sectorRaw = row['Setor Auditado:'] || row['Setor Auditado'] || row['Setor:'] || row['Setor'] || row['Tipo de procedimento:'] || '-';

      const auditData = {
        id: deterministicId,
        unitId: unit.id,
        unitName: unit.name,
        auditorId: 'sync_bot',
        auditorName: sanitizeStr(auditorRaw.toString()),
        patientName: sanitizeStr(patientRaw.toString()),
        medicalRecordNumber: sanitizeStr(mrnRaw.toString()),
        sector: sanitizeStr(sectorRaw.toString()),
        tracerNumber: config.type,
        tracerName: config.name.split(' - ')[1],
        type: config.type,
        externalSource: true,
        competencia: derivedCompetencia,
        timestampStr: rowDateISO,
        rawData: cleanRow
      };

      if (config.type === 'T01') {
        auditData.hasWristband = checkYes(
          cleanRow['Paciente identificado com pulseira branca?'] ||
          cleanRow['Paciente identificado com pulseira branca'] ||
          findSpecificValue(['identificado', 'pulseira', 'branca']) ||
          findSpecificValue(['presenca', 'pulseira']) ||
          findSpecificValue(['possui', 'pulseira'])
        );
        auditData.wristbandLegible = checkYes(
          cleanRow['A pulseira de identificação está legível?'] ||
          cleanRow['A pulseira de identificação está legível'] ||
          findSpecificValue(['pulseira', 'legivel']) ||
          findSpecificValue(['legibilidade'])
        );
        auditData.correctData = checkYes(
          cleanRow['A pulseira de identificação preenchida adequadamente?'] ||
          cleanRow['A pulseira de identificação preenchida adequadamente'] ||
          findSpecificValue(['pulseira', 'preenchida', 'adequadamente']) ||
          findSpecificValue(['dados', 'corretos'])
        );
      } else if (config.type === 'T02') {
        auditData.signIIn = checkYes(
          cleanRow['Check list de cirurgia segura aplicado antes da indução anestésica?'] ||
          findSpecificValue(['check', 'inducao', 'anestesica']) ||
          findSpecificValue(['antes', 'inducao'])
        );
        auditData.timeOut = checkYes(
          cleanRow['Check list de cirurgia segura aplicado antes da incisão cirúrgica?'] ||
          findSpecificValue(['check', 'incisao', 'cirurgica']) ||
          findSpecificValue(['antes', 'incisao'], ['antibiotico', 'compressas', 'instrumentais'])
        );
        auditData.signOut = checkYes(
          cleanRow['Check list de cirurgia segura aplicado antes de sair da sala?'] ||
          findSpecificValue(['check', 'sair', 'sala']) ||
          findSpecificValue(['antes', 'sair'])
        );
      } else if (config.type === 'T03') {
        auditData.compliant = checkYes(
          cleanRow['Houve higienização das mãos imediatamente antes da administração da medicação ?'] ||
          cleanRow['Houve higienização das mãos imediatamente antes da administração da medicação'] ||
          findSpecificValue(['higienizacao', 'maos']) ||
          findSpecificValue(['higiene', 'maos'])
        );
        auditData.handHygiene = auditData.compliant;
      }

      allAudits.push(auditData);
      imported++;
    }

    stats[config.id] = { imported, skipped, total: data.length };
  }

  console.log('Stats per config:', stats);
  console.log('Total audits generated:', allAudits.length);

  const jsonStr = JSON.stringify(allAudits, null, 2);
  const parsedBack = JSON.parse(jsonStr);
  console.log('Parsed back successfully! Total items:', parsedBack.length);

  fs.writeFileSync('src/lib/preloadedAudits.json', jsonStr, 'utf8');
  console.log('preloadedAudits.json successfully saved!');
}

generateAll();
