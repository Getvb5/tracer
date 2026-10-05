// Helper for calculating item-by-item compliance for Tracers (T01, T02, T03)
// and Auditor participation & Sector distribution

export interface ItemComplianceResult {
  id: string;
  name: string;
  simCount: number;
  naoCount: number;
  naoSeAplicaCount: number;
  total: number;
  simPct: number;
  naoPct: number;
  naoSeAplicaPct: number;
}

export interface AuditorShareResult {
  auditorId: string;
  auditorName: string;
  professionalCategory: string;
  unitName: string;
  t01Count: number;
  t02Count: number;
  t03Count: number;
  totalCount: number;
  percentage: number;
}

export interface SectorShareResult {
  sectorName: string;
  count: number;
  percentage: number;
  t01Count: number;
  t02Count: number;
  t03Count: number;
}

// Normalizer for "Sim", "Não", "Não se aplica"
export function normalizeAnswer(value: any): 'sim' | 'nao' | 'na' | null {
  if (value === true || value === 1) return 'sim';
  if (value === false || value === 0) return 'nao';
  if (typeof value !== 'string') return null;

  const v = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // 1. Check "Não se aplica" first so phrases with "não" + "aplica" are never marked as "não"
  if (
    v.includes('nao se aplica') || 
    v.includes('nao aplicavel') || 
    v.includes('nao se aplic') || 
    v === 'n/a' || 
    v === 'na' || 
    v === 'dispensado' || 
    v === 'sem indicacao' || 
    v === 'sem indicacao clinica' ||
    v === '-'
  ) {
    return 'na';
  }

  // 2. Check "Sim" / Conforme / Adequado / Realizado
  if (
    v === 'sim' || 
    v === 's' || 
    v === 'true' || 
    v === 'conforme' || 
    v === 'adequado' || 
    v === 'realizado' || 
    v === 'presente' || 
    v === 'simples' || 
    v === 'correto' ||
    v.startsWith('sim ')
  ) {
    return 'sim';
  }

  // 3. Check "Não" / Não Conforme / Inadequado / Não Realizado
  if (
    v === 'nao' || 
    v === 'n' || 
    v === 'false' || 
    v === 'nao conforme' || 
    v === 'inadequado' || 
    v === 'nao realizado' || 
    v === 'ausente' || 
    v === 'incorreto' ||
    v.startsWith('nao ')
  ) {
    return 'nao';
  }

  return null;
}

// Extracts value from audit searching rawData, sourceRowHash, direct fields
function extractAuditValue(audit: any, directKey: string, searchTerms: string[]): 'sim' | 'nao' | 'na' | null {
  // 1. Check rawData FIRST so explicit "Não se aplica" / "Sim" / "Não" from the forms are preserved accurately
  const raw = audit.rawData || (audit.sourceRowHash ? (typeof audit.sourceRowHash === 'string' ? JSON.parse(audit.sourceRowHash) : audit.sourceRowHash) : null);
  if (raw && typeof raw === 'object') {
    for (const term of searchTerms) {
      const lowerTerm = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (const [k, v] of Object.entries(raw)) {
        if (!v) continue;
        const lowerKey = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Ignore justification text fields!
        if (lowerKey.includes('justifique') || lowerKey.includes('se nao') || lowerKey.includes('se nao,')) {
          continue;
        }
        if (lowerKey.includes(lowerTerm)) {
          const ans = normalizeAnswer(v);
          if (ans !== null) return ans;
        }
      }
    }
  }

  // 2. Direct field fallback
  if (audit[directKey] !== undefined && audit[directKey] !== null && audit[directKey] !== '') {
    const directAns = normalizeAnswer(audit[directKey]);
    if (directAns !== null) return directAns;
  }

  return null;
}

// Definition of items for T01 - Beira Leito (Identificação do Paciente)
export const T01_ITEMS_CONFIG = [
  {
    id: 't01_compreende_plano',
    name: 'Compreensão do plano terapêutico',
    directKey: 'compreendePlano',
    searchTerms: ['compreende o plano', 'plano terapeutico', 'q8_compreende_plano', '09- paciente ou responsavel compreende']
  },
  {
    id: 't01_pulseira_branca',
    name: 'Identificado com pulseira branca',
    directKey: 'hasWristband',
    searchTerms: ['paciente identificado com pulseira branca', 'pulseira branca', 'q10_pulseira_branca']
  },
  {
    id: 't01_pulseira_legivel',
    name: 'Pulseira legível',
    directKey: 'wristbandLegible',
    searchTerms: ['pulseira de identificacao esta legivel', 'pulseira legivel', 'q12_pulseira_legivel']
  },
  {
    id: 't01_pulseira_preenchida',
    name: 'Pulseira preenchida adequadamente',
    directKey: 'correctData',
    searchTerms: ['pulseira de identificacao preenchida adequadamente', 'preenchida adequadamente', 'q14_pulseira_preenchida']
  },
  {
    id: 't01_alergia_alimentar',
    name: 'Identificação de alergia alimentar/medicamentosa',
    directKey: 'alergiaAlimentar',
    searchTerms: ['tem alergia alimentar/medicamentosa', 'alergia alimentar']
  },
  {
    id: 't01_alergia_sinalizada',
    name: 'Alergia sinalizada com pulseira rosa',
    directKey: 'alergiaSinalizada',
    searchTerms: ['pulseira especifica (cor rosa)', 'pulseira rosa', 'alergia sinalizada', 'q17_alergia_sinalizada']
  },
  {
    id: 't01_placa_leito',
    name: 'Placa de identificação do leito afixada',
    directKey: 'placaLeito',
    searchTerms: ['placa de identificacao do leito afixada', 'placa afixada', 'q19_placa_leito']
  },
  {
    id: 't01_placa_preenchida',
    name: 'Placa de identificação preenchida adequadamente',
    directKey: 'placaPreenchida',
    searchTerms: ['placa de identificacao preenchida adequadamente', 'placa de identificacao preenchida', 'q21_placa_preenchida']
  },
  {
    id: 't01_placa_riscos',
    name: 'Placa do leito com riscos sinalizados',
    directKey: 'placaRiscos',
    searchTerms: ['placa de identificacao do leito com os riscos sinalizados', 'riscos sinalizados', 'q23_placa_riscos']
  },
  {
    id: 't01_rotulos_dieta',
    name: 'Rótulos da dieta com identificadores obrigatórios',
    directKey: 'rotulosDieta',
    searchTerms: ['rotulos da dieta estao com todos os identificadores', 'rotulos da dieta', 'q25_rotulos_dieta']
  },
  {
    id: 't01_rotulos_medicamento',
    name: 'Rótulo de medicamentos com identificadores obrigatórios',
    directKey: 'rotulosMedicamento',
    searchTerms: ['rotulo de medicamentos esta com todos os identificadores', 'rotulo de medicamentos', 'q27_rotulo_medicamento']
  },
  {
    id: 't01_higiene_maos',
    name: 'Higienização das mãos realizada',
    directKey: 'higieneMaos',
    searchTerms: ['higienizacao das maos foi realizada', 'higienizacao das maos', 'q28_higienizacao_maos']
  },
  {
    id: 't01_acesso_venoso',
    name: 'Acesso venoso identificado adequadamente',
    directKey: 'acessoVenoso',
    searchTerms: ['acesso venoso foi identificado adequadamente', 'acesso venoso', 'q30_acesso_venoso']
  },
  {
    id: 't01_curativo',
    name: 'Curativo da ferida identificado, válido e íntegro',
    directKey: 'curativoFerida',
    searchTerms: ['curativo da ferida identificado, valido e integro', 'curativo da ferida', 'q32_curativo_ferida']
  },
  {
    id: 't01_decubito',
    name: 'Paciente no decúbito correto (relógio da pele)',
    directKey: 'decubitoCorreto',
    searchTerms: ['decubito correto de acordo com o relogio da pele', 'decubito correto', 'relogio da pele', 'q34_decubito_correto']
  },
  {
    id: 't01_orientacao_lesao',
    name: 'Orientação de prevenção de lesão por pressão',
    directKey: 'orientacaoLesao',
    searchTerms: ['orientacao de prevencao de lesao por pressao']
  },
  {
    id: 't01_grades',
    name: 'Grades do leito elevadas',
    directKey: 'gradesElevadas',
    searchTerms: ['grades do leito elevadas', 'grades elevadas', 'q37_grades_elevadas']
  },
  {
    id: 't01_orientacao_queda',
    name: 'Orientação sobre prevenção de quedas',
    directKey: 'orientacaoQueda',
    searchTerms: ['orientacao sobre as medidas de prevencao de queda']
  },
  {
    id: 't01_passagem_plantao',
    name: 'Passagem de plantão com formulário padrão',
    directKey: 'sbar',
    searchTerms: ['passagem de plantao da enfermagem com formulario padrao']
  },
  {
    id: 't01_transferencia_sbar',
    name: 'Transferência com formulário SBAR',
    directKey: 'transferenciaSbar',
    searchTerms: ['formulario de transferencia/sbar preenchido', 'q42_SBAR']
  }
];

// Definition of items for T02 - Cirurgia Segura
export const T02_ITEMS_CONFIG = [
  {
    id: 't02_pulseira_branca',
    name: 'Identificado com pulseira branca',
    directKey: 'hasWristband',
    searchTerms: ['paciente identificado com pulseira branca', 'pulseira branca', 'q8_pulseira_branca']
  },
  {
    id: 't02_pulseira_legivel',
    name: 'Pulseira legível',
    directKey: 'wristbandLegible',
    searchTerms: ['pulseira de identificacao esta legivel', 'pulseira legivel', 'q9_pulseira_legivel']
  },
  {
    id: 't02_pulseira_preenchida',
    name: 'Pulseira preenchida adequadamente',
    directKey: 'correctData',
    searchTerms: ['pulseira de identificacao preenchida adequadamente', 'preenchida adequadamente', 'q10_pulseira_preenchida']
  },
  {
    id: 't02_alergia_sinalizada',
    name: 'Alergia sinalizada com pulseira rosa',
    directKey: 'alergiaSinalizada',
    searchTerms: ['pulseira especifica (cor rosa)', 'pulseira rosa', 'alergia sinalizada', 'q11_alergia_sinalizada']
  },
  {
    id: 't02_termo_cirurgico',
    name: 'Termo de consentimento cirúrgico assinado',
    directKey: 'termoCirurgico',
    searchTerms: ['termo de consentimento cirurgico assinado', 'termo de consentimento cirurgico', 'q12_termo_cirurgico']
  },
  {
    id: 't02_termo_anestesico',
    name: 'Termo de consentimento anestésico assinado',
    directKey: 'termoAnestesico',
    searchTerms: ['termo de consentimento anestesico assinado', 'termo de consentimento anestesico', 'q13_termo_anestesico']
  },
  {
    id: 't02_visita_pre_anestesica',
    name: 'Visita pré-anestésica realizada e registrada',
    directKey: 'visitaPreAnestesica',
    searchTerms: ['visita pre anestesica foi realizada', 'visita pre anestesica', 'q14_visita_pre_anestesica']
  },
  {
    id: 't02_confirma_identificacao',
    name: 'Confirmação da identificação antes de procedimentos',
    directKey: 'confirmaIdentificacao',
    searchTerms: ['equipe confirma a identificacao do paciente', 'confirmacao de identificacao', 'q15_confirma_identificacao']
  },
  {
    id: 't02_sbar',
    name: 'Formulário de transição (SBAR) preenchido',
    directKey: 'sbar',
    searchTerms: ['formulario de transicao de cuidados (sbar)', 'sbar', 'q16_SBAR']
  },
  {
    id: 't02_informado_cirurgia',
    name: 'Paciente informado sobre tipo, riscos e benefícios',
    directKey: 'informadoCirurgia',
    searchTerms: ['paciente foi informado sobre tipo de cirurgia', 'informado sobre os riscos', 'q17_informado_riscos']
  },
  {
    id: 't02_retirada_adornos',
    name: 'Retirada de próteses, órteses e adornos do paciente',
    directKey: 'retiradaAdornos',
    searchTerms: ['proteses, orteses e adornos retirado', 'retirada de adornos', 'q18_retirou_adornos']
  },
  {
    id: 't02_banho_clorexidina',
    name: 'Banho com clorexidina até 6h antes',
    directKey: 'banhoClorexidina',
    searchTerms: ['banho com clorexidina', 'banho pre-operatorio', 'q19_banho_clorexidina']
  },
  {
    id: 't02_degermacao_equipe',
    name: '1ª degermação da equipe entre 2-5 min',
    directKey: 'degermacaoEquipe',
    searchTerms: ['1 degermacao cirurgica da equipe', 'degermacao cirurgica', 'q20_degermacao']
  },
  {
    id: 't02_equipe_completa',
    name: 'Equipe cirúrgica completa na sala',
    directKey: 'equipeCompleta',
    searchTerms: ['equipe cirurgica encontrava-se completa', 'equipe completa', 'q21_equipe_completa']
  },
  {
    id: 't02_equipe_sem_adorno',
    name: 'Equipe sem adornos',
    directKey: 'equipeSemAdorno',
    searchTerms: ['equipe estava sem adorno', 'sem adorno', 'q22_sem_adorno']
  },
  {
    id: 't02_equipe_paramentada',
    name: 'Equipe paramentada adequadamente',
    directKey: 'equipeParamentada',
    searchTerms: ['equipe estava paramentada adequadamente', 'paramentada', 'q23_paramentada']
  },
  {
    id: 't02_signin',
    name: 'Sign In (antes da indução anestésica)',
    directKey: 'signIIn',
    searchTerms: ['antes da inducao anestesica', 'sign in', 'q24_checklist_inducao']
  },
  {
    id: 't02_contagem_instrumentais_antes',
    name: 'Contagem de instrumentais antes da incisão',
    directKey: 'contagemInstrumentaisAntes',
    searchTerms: ['contagem e conferencia do quantitativo de instrumentais antes da incisao', 'instrumentais antes', 'q25_contagem_instrumentais_antes']
  },
  {
    id: 't02_antibiotico_profilatico',
    name: 'Antibiótico profilático até 60 min antes da incisão',
    directKey: 'antibioticoProfilatico',
    searchTerms: ['antibiotico profilatico foi administrado 60 minutos antes', 'antibiotico profilatico', 'q26_antibiotico']
  },
  {
    id: 't02_contagem_compressas_antes',
    name: 'Contagem de compressas antes da incisão',
    directKey: 'contagemCompressasAntes',
    searchTerms: ['conferencia do numero de compressas usadas antes da incisao', 'compressas antes', 'q27_compressas_antes']
  },
  {
    id: 't02_timeout',
    name: 'Time Out (antes da incisão cirúrgica)',
    directKey: 'timeOut',
    searchTerms: ['antes da incisao cirurgica', 'time out', 'pausa cirurgica', 'q28_checklist_incisao']
  },
  {
    id: 't02_material_biologico',
    name: 'Material biológico identificado adequadamente',
    directKey: 'materialBiologico',
    searchTerms: ['material biologico foi identificado', 'material biologico', 'q29_material_biologico']
  },
  {
    id: 't02_contagem_compressas_fechamento',
    name: 'Contagem de compressas antes do fechamento',
    directKey: 'contagemCompressasFechamento',
    searchTerms: ['conferencia do numero de compressas utilizadas antes do fechamento', 'compressas fechamento', 'q30_compressas_fechamento']
  },
  {
    id: 't02_contagem_instrumentais_fechamento',
    name: 'Contagem de instrumentais antes do fechamento',
    directKey: 'contagemInstrumentaisFechamento',
    searchTerms: ['conferencia do numero de instrumentais utilizadas antes do fechamento', 'instrumentais fechamento', 'q31_instrumentais_fechamento']
  },
  {
    id: 't02_escala_morse',
    name: 'Escala de Morse nas primeiras 24h',
    directKey: 'escalaMorse',
    searchTerms: ['escala de morse realizada', 'escala de morse', 'q32_MORSE']
  },
  {
    id: 't02_escala_dor',
    name: 'Escala de dor realizada no pós-operatório',
    directKey: 'escalaDor',
    searchTerms: ['escala de dor realizada apos a cirurgia', 'escala de dor', 'q33_dor']
  },
  {
    id: 't02_sinais_vitais',
    name: 'Sinais vitais registrados adequadamente no pós-op',
    directKey: 'sinaisVitais',
    searchTerms: ['sinais vitais registrados de forma adequada', 'sinais vitais', 'q34_sinais_vitais']
  },
  {
    id: 't02_signout',
    name: 'Sign Out (antes de sair da sala)',
    directKey: 'signOut',
    searchTerms: ['antes de sair da sala', 'sign out', 'q35_checklist_saida']
  },
  {
    id: 't02_equipamentos_calibrados',
    name: 'Equipamentos funcionantes e calibrados',
    directKey: 'equipamentosCalibrados',
    searchTerms: ['equipamentos funcionantes e calibrados']
  },
  {
    id: 't02_rn_identificado',
    name: 'RN identificado em sala',
    directKey: 'rnIdentificado',
    searchTerms: ['o(a) rn foi identificado(a) em sala', 'rn identificado', 'q37_RN_identificado']
  },
  {
    id: 't02_vitamina_k',
    name: 'Administrada vitamina K no RN',
    directKey: 'vitaminaK',
    searchTerms: ['administrada a vitamina k no(a) rn', 'vitamina k', 'q38_vitamina_K']
  },
  {
    id: 't02_mae_sr',
    name: 'Paciente (mãe) encaminhada para a SR',
    directKey: 'maeSR',
    searchTerms: ['paciente (mae) foi encaminhada para a sr']
  }
];

// Definition of items for T03 - Processos de Medicação / Higienização das Mãos
export const T03_ITEMS_CONFIG = [
  {
    id: 't03_pulseira_branca',
    name: 'Identificado com pulseira branca',
    directKey: 'hasWristband',
    searchTerms: ['paciente identificado com pulseira branca', 'pulseira branca', 'q8_pulseira_branca']
  },
  {
    id: 't03_pulseira_legivel',
    name: 'Pulseira de identificação legível',
    directKey: 'wristbandLegible',
    searchTerms: ['pulseira de identificacao esta legivel', 'pulseira legivel', 'q10_pulseira_legivel']
  },
  {
    id: 't03_pulseira_preenchida',
    name: 'Pulseira preenchida adequadamente',
    directKey: 'correctData',
    searchTerms: ['pulseira de identificacao preenchida adequadamente', 'preenchida adequadamente', 'q12_pulseira_preenchida']
  },
  {
    id: 't03_alergia_alimentar',
    name: 'Identificação de alergia alimentar/medicamentosa',
    directKey: 'alergiaAlimentar',
    searchTerms: ['paciente tem alergia alimentar/medicamentosa', 'alergia alimentar']
  },
  {
    id: 't03_alergia_sinalizada',
    name: 'Alergia sinalizada com pulseira rosa',
    directKey: 'alergiaSinalizada',
    searchTerms: ['pulseira especifica (cor rosa)', 'pulseira rosa', 'q15_alergia_sinalizada']
  },
  {
    id: 't03_orientacao_paciente',
    name: 'Orientação ao paciente sobre o medicamento',
    directKey: 'orientacaoPaciente',
    searchTerms: ['orientacoes ao paciente sobre o medicamento administrado', 'orientacao ao paciente', 'q17_orientacao_paciente']
  },
  {
    id: 't03_higiene_maos',
    name: 'Higienização das mãos antes da administração',
    directKey: 'compliant',
    searchTerms: ['houve higienizacao das maos imediatamente antes', 'higienizacao das maos', 'compliant', 'q18_higienizacao_maos']
  },
  {
    id: 't03_acesso_venoso',
    name: 'Acesso venoso identificado adequadamente',
    directKey: 'acessoVenoso',
    searchTerms: ['acesso venoso foi identificado adequadamente', 'acesso venoso', 'q20_acesso_venoso']
  },
  {
    id: 't03_conferencia_pulseira',
    name: 'Conferência de identificação na pulseira antes de medicar',
    directKey: 'conferenciaPulseira',
    searchTerms: ['conferida a identificacao do paciente com a pulseira', 'conferida a identificacao', 'q22_conferencia_pulseira']
  },
  {
    id: 't03_conferencia_prescricao',
    name: 'Conferência do medicamento com a prescrição',
    directKey: 'conferenciaPrescricao',
    searchTerms: ['conferencia do medicamento administrado com a prescricao', 'conferencia com a prescricao', 'q24_conferencia_prescricao']
  },
  {
    id: 't03_dupla_checagem',
    name: 'Dupla checagem na administração de MAV',
    directKey: 'duplaChecagem',
    searchTerms: ['realizada dupla checagem no momento de administracao da mav', 'dupla checagem', 'q25_dupla_checagem']
  },
  {
    id: 't03_rotulo_obrigatorio',
    name: 'Rótulo de medicação com identificadores obrigatórios',
    directKey: 'rotuloMedicamento',
    searchTerms: ['rotulo de medicacao esta com todos os identificadores', 'rotulo de medicacao', 'rotulo de medicamentos', 'q27_rotulo_obrigatorios']
  },
  {
    id: 't03_assinatura_medico',
    name: 'Prescrição com assinatura do médico',
    directKey: 'assinaturaMedico',
    searchTerms: ['prescricao com assinatura do medico', 'assinatura do medico', 'q29_assinatura_medico']
  },
  {
    id: 't03_assinatura_enfermeiro',
    name: 'Prescrição com assinatura do enfermeiro (abertura)',
    directKey: 'assinaturaEnfermeiro',
    searchTerms: ['prescricao com assinatura do enfermeiro que fez abertura', 'assinatura do enfermeiro', 'q31_assinatura_enfermeiro']
  },
  {
    id: 't03_hora_correta',
    name: 'Horário de administração conforme a prescrição',
    directKey: 'horaCorreta',
    searchTerms: ['hora da administracao  medicacao e a mesma da prescricao', 'hora da administracao', 'mesma da prescricao', 'q33_hora_correta']
  },
  {
    id: 't03_sem_abreviaturas',
    name: 'Prescrição sem abreviaturas proibidas',
    directKey: 'semAbreviaturas',
    searchTerms: ['prescricao esta sem uso de abreviaturas', 'sem uso de abreviaturas', 'sem abreviaturas', 'q35_sem_abreviaturas']
  },
  {
    id: 't03_diferenciar_semelhantes',
    name: 'Estratégia para nomes semelhantes (Tall Man/Look-Alike)',
    directKey: 'diferenciarSemelhantes',
    searchTerms: ['diferenciar nomes semelhantes de medicacao', 'nomes semelhantes', 'tall man', 'q36_diferenciar_semelhantes']
  },
  {
    id: 't03_registro_alergias',
    name: 'Registro de alergias na prescrição médica',
    directKey: 'registroAlergias',
    searchTerms: ['registros das alergias medicamentosas na prescricao', 'registro de alergias', 'q38_registro_alergias']
  },
  {
    id: 't03_duracao_tratamento',
    name: 'Duração do tratamento especificada',
    directKey: 'duracaoTratamento',
    searchTerms: ['duracao do tratamento esta especificada', 'duracao do tratamento', 'q40_duracao_especificada']
  },
  {
    id: 't03_se_necessario',
    name: 'Medicações "se necessário" com informações de segurança',
    directKey: 'seNecessario',
    searchTerms: ['medicacoes de uso se necessario contem informacoes de seguranca', 'se necessario', 'q41_se_necessario_seguranca']
  },
  {
    id: 't03_diluente_prescrito',
    name: 'Diluente da medicação prescrito',
    directKey: 'diluentePrescrito',
    searchTerms: ['diluente da medicacao esta prescrito', 'diluente prescrito', 'q43_diluente_prescrito']
  },
  {
    id: 't03_velocidade_infusao',
    name: 'Velocidade de infusão prescrita',
    directKey: 'velocidadePrescrita',
    searchTerms: ['velocidade de infusao esta prescrita', 'velocidade de infusao', 'q44_velocidade_prescrita']
  },
  {
    id: 't03_via_prescrita',
    name: 'Via de administração prescrita',
    directKey: 'viaPrescrita',
    searchTerms: ['via de administracao esta prescrita', 'via de administracao', 'q46_via_prescrita']
  },
  {
    id: 't03_dose_checada',
    name: 'Dose checada de forma legível após administração',
    directKey: 'doseChecada',
    searchTerms: ['dose administrada foi checada de forma legivel', 'dose checada', 'q50_dose_checada']
  },
  {
    id: 't03_mav_acesso_restrito',
    name: 'Medicamentos de alta vigilância (MAV) em acesso restrito',
    directKey: 'mavAcessoRestrito',
    searchTerms: ['medicamentos de alta vigilancia e controlados estao armazenados', 'mav restrito', 'q52_mav_acesso_restrito']
  },
  {
    id: 't03_temperatura_refrigeracao',
    name: 'Temperatura de refrigeração no termohigrômetro (2ºC a 8ºC)',
    directKey: 'temperaturaRefrigeracao',
    searchTerms: ['temperatura de refrigeracao das medicacoes entre 2 e 8', '2 a 8', '2ºc a 8ºc', 'q56_temperatura_refrigeracao']
  },
  {
    id: 't03_medicacao_casa',
    name: 'Medicação trazida de casa registrada na prescrição',
    directKey: 'medicacaoCasa',
    searchTerms: ['medicacao trazida de casa registrada na prescricao']
  }
];

// Calculation function for a specific list of audits and item configs
export function calculateItemsCompliance(audits: any[], itemsConfig: typeof T01_ITEMS_CONFIG): ItemComplianceResult[] {
  const totalAudits = audits.length;
  if (totalAudits === 0) {
    return itemsConfig.map(cfg => ({
      id: cfg.id,
      name: cfg.name,
      simCount: 0,
      naoCount: 0,
      naoSeAplicaCount: 0,
      total: 0,
      simPct: 0,
      naoPct: 0,
      naoSeAplicaPct: 0
    }));
  }

  return itemsConfig.map(cfg => {
    let sim = 0;
    let nao = 0;
    let na = 0;

    audits.forEach(audit => {
      const ans = extractAuditValue(audit, cfg.directKey, cfg.searchTerms);
      if (ans === 'sim') {
        sim++;
      } else if (ans === 'nao') {
        nao++;
      } else if (ans === 'na') {
        na++;
      } else {
        // Fallback: If no explicit answer was captured, look if this is a primary question that was evaluated
        // Default to "Não se aplica" or infer from general compliance
        if (cfg.directKey === 'hasWristband' && audit.hasWristband !== undefined) {
          if (audit.hasWristband) sim++; else nao++;
        } else if (cfg.directKey === 'wristbandLegible' && audit.wristbandLegible !== undefined) {
          if (audit.wristbandLegible) sim++; else nao++;
        } else if (cfg.directKey === 'correctData' && audit.correctData !== undefined) {
          if (audit.correctData) sim++; else nao++;
        } else if (cfg.directKey === 'signIIn' && audit.signIIn !== undefined) {
          if (audit.signIIn) sim++; else nao++;
        } else if (cfg.directKey === 'timeOut' && audit.timeOut !== undefined) {
          if (audit.timeOut) sim++; else nao++;
        } else if (cfg.directKey === 'signOut' && audit.signOut !== undefined) {
          if (audit.signOut) sim++; else nao++;
        } else if (cfg.directKey === 'compliant' && audit.compliant !== undefined) {
          if (audit.compliant) sim++; else nao++;
        } else {
          // If not answered/tested in this specific audit form, count as "Não se aplica"
          na++;
        }
      }
    });

    const evaluatedTotal = sim + nao + na;
    const baseTotal = evaluatedTotal > 0 ? evaluatedTotal : totalAudits;

    const simPct = baseTotal > 0 ? Number(((sim / baseTotal) * 100).toFixed(1)) : 0;
    const naoPct = baseTotal > 0 ? Number(((nao / baseTotal) * 100).toFixed(1)) : 0;
    // Ensure exact sum to 100.0 if there are items
    let naoSeAplicaPct = baseTotal > 0 ? Number((100 - simPct - naoPct).toFixed(1)) : 0;
    if (naoSeAplicaPct < 0) naoSeAplicaPct = 0;

    return {
      id: cfg.id,
      name: cfg.name,
      simCount: sim,
      naoCount: nao,
      naoSeAplicaCount: na,
      total: baseTotal,
      simPct,
      naoPct,
      naoSeAplicaPct
    };
  });
}

// Calculate auditor participation across tracers
export function calculateAuditorsParticipation(
  patientAudits: any[],
  surgeryAudits: any[],
  handAudits: any[],
  healthUnitsMap: Record<string, string>
): AuditorShareResult[] {
  const auditorMap = new Map<string, AuditorShareResult & { unitCounts: Record<string, number> }>();

  const processAudit = (audit: any, type: 't01' | 't02' | 't03') => {
    const raw = audit.rawData || (audit.sourceRowHash ? (typeof audit.sourceRowHash === 'string' ? (() => { try { return JSON.parse(audit.sourceRowHash); } catch { return {}; } })() : audit.sourceRowHash) : {}) || {};
    
    let auditorName = audit.auditorName;
    if (!auditorName || auditorName === 'Auditor Sincronizado' || auditorName.trim() === '' || auditorName === '-') {
      const candidates = [
        raw['Nome Completo do Auditor:'],
        raw['Nome Completo do Auditor'],
        raw['06- Nome Completo do Auditor:'],
        raw['06- Nome Completo do Auditor'],
        raw['05- Nome Completo do Auditor:'],
        raw['05- Nome Completo do Auditor'],
        raw['04- Nome Completo do Auditor:'],
        raw['04- Nome Completo do Auditor'],
        raw['Nome Completo do Auditor: '],
        raw['Nome do Auditor:'],
        raw['Nome do Auditor'],
        raw['Auditor:'],
        raw['Auditor']
      ];
      for (const c of candidates) {
        if (c && typeof c === 'string' && c.trim() && c.trim() !== '-' && c.trim() !== 'Auditor Sincronizado') {
          auditorName = c.trim();
          break;
        }
      }
      if (!auditorName || auditorName === 'Auditor Sincronizado') {
        for (const [k, v] of Object.entries(raw)) {
          const kLow = k.toLowerCase();
          if (kLow.includes('auditor') && !kLow.includes('setor') && !kLow.includes('unidade')) {
            if (v && typeof v === 'string' && v.trim() && v.trim() !== '-' && v.trim() !== 'Auditor Sincronizado') {
              auditorName = v.trim();
              break;
            }
          }
        }
      }
      if (!auditorName || auditorName === 'Auditor Sincronizado') {
        auditorName = audit.auditor || (audit.auditorId && !audit.auditorId.startsWith('sync_') && audit.auditorId !== 'SYSTEM_SYNC' ? audit.auditorId : 'Auditor Não Identificado');
      }
    }

    const key = auditorName.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    
    let prof = audit.professionalCategory || raw['CATEGORIA PROFISSIONAL'] || raw['CATEGORIA'] || 'Enfermagem';
    if (typeof prof === 'string') {
      const pLow = prof.toLowerCase();
      if (pLow.includes('enf') || pLow.includes('obstet')) prof = 'Enfermeiro(a)';
      else if (pLow.includes('med') || pLow.includes('cirur')) prof = 'Médico(a)';
      else if (pLow.includes('tecn') || pLow.includes('aux')) prof = 'Téc. Enfermagem';
      else if (pLow.includes('fisio')) prof = 'Fisioterapeuta';
      else prof = prof.charAt(0).toUpperCase() + prof.slice(1);
    } else {
      prof = 'Enfermeiro(a)';
    }

    const unitId = audit.unitId || audit.hospitalId || audit.unidadeId || '';
    const unitName = healthUnitsMap[unitId] || audit.unitName || unitId || 'Unidade Geral';

    if (!auditorMap.has(key)) {
      auditorMap.set(key, {
        auditorId: audit.auditorId || key,
        auditorName: auditorName.trim(),
        professionalCategory: prof,
        unitName,
        unitCounts: { [unitName]: 1 },
        t01Count: 0,
        t02Count: 0,
        t03Count: 0,
        totalCount: 0,
        percentage: 0
      });
    } else {
      const entry = auditorMap.get(key)!;
      entry.unitCounts[unitName] = (entry.unitCounts[unitName] || 0) + 1;
      // If current display name is ALL-CAPS and incoming has mixed case, improve display readability
      if (entry.auditorName === entry.auditorName.toUpperCase() && auditorName !== auditorName.toUpperCase()) {
        entry.auditorName = auditorName.trim();
      }
    }

    const existing = auditorMap.get(key)!;
    if (type === 't01') existing.t01Count++;
    if (type === 't02') existing.t02Count++;
    if (type === 't03') existing.t03Count++;
    existing.totalCount++;
  };

  patientAudits.forEach(a => processAudit(a, 't01'));
  surgeryAudits.forEach(a => processAudit(a, 't02'));
  handAudits.forEach(a => processAudit(a, 't03'));

  const totalAllAudits = patientAudits.length + surgeryAudits.length + handAudits.length;

  const results = Array.from(auditorMap.values()).map(a => {
    // Pick the primary unit name where the auditor has the highest audit count
    let topUnit = a.unitName;
    let maxUnitCount = 0;
    for (const [u, count] of Object.entries(a.unitCounts || {})) {
      if (count > maxUnitCount) {
        maxUnitCount = count;
        topUnit = u;
      }
    }

    const { unitCounts, ...rest } = a;
    return {
      ...rest,
      unitName: topUnit,
      percentage: totalAllAudits > 0 ? Number(((a.totalCount / totalAllAudits) * 100).toFixed(1)) : 0
    };
  });

  return results.sort((a, b) => b.totalCount - a.totalCount);
}

const INVALID_SECTOR_VALUES = new Set([
  'nao', 'não', 'sim', 'n/a', 'na', 'null', 'undefined', '-', '--', '---', '.', '..', 'nenhum', 'nenhuma', 'outro', 'outros',
  'não se aplica', 'nao se aplica', 'dispensa', 'dispensado', 'sem indicação', 'sem indicacao', 'conforme', 'inconforme',
  'adequado', 'inadequado', 'true', 'false', '0', '1', 'ok', 'nok', 'se não, justifique', 'se nao, justifique', 'justificativa',
  'se não justifique', 'se nao justifique', 'nao conforme', 'não conforme'
]);

export function isValidSectorValue(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  const t = val.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!t || t === '-' || t === '--' || t.length < 2) return false;
  if (INVALID_SECTOR_VALUES.has(t)) return false;
  if (t.startsWith('se nao') || t.startsWith('se não') || t.startsWith('justifique') || t.includes('?')) return false;
  return true;
}

// Normalizes sector names with standard casing and accents
export function cleanSectorName(sector: string): string {
  if (!isValidSectorValue(sector)) return 'Setor Não Informado';
  const trimmed = sector.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'n/a') return 'Setor Não Informado';

  const sLower = trimmed.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove accents for matching

  if (INVALID_SECTOR_VALUES.has(sLower) || sLower.startsWith('se nao') || sLower.startsWith('se não') || sLower.startsWith('justifique') || sLower.includes('?')) {
    return 'Setor Não Informado';
  }

  // 1. Sala de Transferência
  if (sLower.includes('transferencia') || sLower.includes('transfer')) {
    return 'Sala de Transferência';
  }

  // 2. RPA (Recuperação Pós-Anestésica)
  if (sLower.includes('rpa') || sLower.includes('pos-anestes') || sLower.includes('pos anestes') || sLower.includes('recuperacao')) {
    return 'Sala de Recuperação Pós-Anestésica (RPA)';
  }

  // 3. Sala de Observação
  if (sLower.includes('observacao') || sLower.includes('obs')) {
    return 'Sala de Observação';
  }

  // 4. Centro Obstétrico / Sala de Parto / Pré-parto / PPP
  if (sLower.includes('parto') || sLower.includes('obstetr') || sLower.includes('pre-parto') || sLower.includes('ppp')) {
    return 'Centro Obstétrico / Sala de Parto';
  }

  // 5. Bloco Cirúrgico / Centro Cirúrgico
  if (sLower.includes('cirurg') || sLower.includes('bloco') || sLower === 'cc' || sLower.includes('centro cirurg')) {
    return 'Bloco Cirúrgico';
  }

  // 6. Maternidade / Alojamento Conjunto
  if (sLower.includes('matern') || sLower.includes('alojamento') || sLower.includes('alcon')) {
    return 'Maternidade / Alojamento Conjunto';
  }

  // 7. UTI Neonatal / UCIN
  if (sLower.includes('neo') || sLower.includes('ucin') || sLower.includes('ucinca')) {
    return 'UTI Neonatal / UCIN';
  }

  // 8. UTI / Terapia Intensiva
  if (sLower.includes('uti') || sLower.includes('cti') || sLower.includes('terapia intensiva')) {
    return 'UTI / Terapia Intensiva';
  }

  // 9. Emergência / Pronto Atendimento / SPA / Acolhimento
  if (sLower.includes('emerg') || sLower.includes('urgenc') || sLower.includes('acolhimento') || sLower.includes('spa') || sLower.includes('pronto atendimento') || sLower === 'pa') {
    return 'Emergência / Pronto Atendimento';
  }

  // 10. Enfermaria Pediátrica / Pediatria
  if (sLower.includes('pediat') || sLower.includes('ped')) {
    return 'Enfermaria Pediátrica';
  }

  // 11. Enfermaria Clínica / Enfermarias
  if (sLower.includes('clinica') || sLower.includes('clinico') || sLower.includes('enfermaria') || sLower.includes('posto') || sLower.includes('internamento')) {
    return 'Enfermaria Clínica';
  }

  // 12. Ambulatório / Consultórios
  if (sLower.includes('ambulator') || sLower.includes('consultorio')) {
    return 'Ambulatório';
  }

  // 13. Default format Title Case
  return trimmed.split(' ').map(w => {
    if (['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'com'].includes(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

// Universal sector extractor from audit record (checking direct fields and raw spreadsheet entries)
export function extractAuditSector(audit: any): string {
  if (!audit) return 'Setor Não Informado';

  // 1. Direct fields check
  let direct = audit.sector || audit.setor || audit.sectorName || audit.setorAuditado;
  let sector: string | null = null;
  if (isValidSectorValue(direct)) {
    sector = String(direct).trim();
  }

  // 2. Parse from rawData / sourceRowHash
  if (!sector) {
    const raw = audit.rawData || (audit.sourceRowHash ? (typeof audit.sourceRowHash === 'string' ? JSON.parse(audit.sourceRowHash) : audit.sourceRowHash) : null);
    if (raw && typeof raw === 'object') {
      // 1st pass: Exact sector column headers
      for (const [k, v] of Object.entries(raw)) {
        if (!isValidSectorValue(v)) continue;
        const normalizedKey = k.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/^[0-9]+[-\s]+/, '')
          .replace(/:$/, '')
          .trim();

        if (
          normalizedKey === 'setor auditado' ||
          normalizedKey === 'setor' ||
          normalizedKey === 'nome do setor' ||
          normalizedKey === 'setor / enfermaria' ||
          normalizedKey === 'setor ou enfermaria' ||
          normalizedKey === 'setor/enfermaria' ||
          normalizedKey === 'setor/leito' ||
          normalizedKey === 'qual o setor auditado' ||
          normalizedKey === 'qual setor' ||
          normalizedKey === 'setor da auditoria' ||
          normalizedKey === 'local auditado' ||
          normalizedKey === 'local da auditoria' ||
          normalizedKey === 'unidade/setor' ||
          normalizedKey === 'posto / setor' ||
          normalizedKey === 'posto/setor'
        ) {
          sector = (v as string).trim();
          break;
        }
      }

      // 2nd pass: Specific sector-starting keys (excluding question phrases with ?, possui, etc.)
      if (!sector) {
        for (const [k, v] of Object.entries(raw)) {
          if (!isValidSectorValue(v)) continue;
          const normalizedKey = k.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/^[0-9]+[-\s]+/, '')
            .replace(/:$/, '')
            .trim();

          if (
            (normalizedKey.startsWith('setor auditado') || normalizedKey.startsWith('nome do setor') || normalizedKey.startsWith('setor:')) &&
            !normalizedKey.includes('?') &&
            !normalizedKey.includes('responsavel') &&
            !normalizedKey.includes('possui') &&
            !normalizedKey.includes('identifica')
          ) {
            sector = (v as string).trim();
            break;
          }
        }
      }
    }
  }

  if (!sector || !isValidSectorValue(sector)) {
    const tType = audit.type || audit.tracerType || audit.tracerNumber;
    if (tType === 'T02' || tType === '02' || tType === 'tracer_02') {
      return 'Bloco Cirúrgico';
    }
    return 'Setor Não Informado';
  }

  return cleanSectorName(sector);
}

// Calculate Sector Distribution
export function calculateSectorDistribution(
  patientAudits: any[],
  surgeryAudits: any[],
  handAudits: any[]
): SectorShareResult[] {
  const sectorMap = new Map<string, { count: number; t01: number; t02: number; t03: number }>();

  const processAudit = (audit: any, type: 't01' | 't02' | 't03') => {
    const cleanSector = extractAuditSector(audit);
    if (!cleanSector || cleanSector === 'Setor Não Informado') return;

    if (!sectorMap.has(cleanSector)) {
      sectorMap.set(cleanSector, { count: 0, t01: 0, t02: 0, t03: 0 });
    }

    const item = sectorMap.get(cleanSector)!;
    item.count++;
    if (type === 't01') item.t01++;
    if (type === 't02') item.t02++;
    if (type === 't03') item.t03++;
  };

  patientAudits.forEach(a => processAudit(a, 't01'));
  surgeryAudits.forEach(a => processAudit(a, 't02'));
  handAudits.forEach(a => processAudit(a, 't03'));

  let totalMappedAudits = 0;
  sectorMap.forEach(v => { totalMappedAudits += v.count; });

  const results: SectorShareResult[] = Array.from(sectorMap.entries()).map(([sectorName, data]) => ({
    sectorName,
    count: data.count,
    percentage: totalMappedAudits > 0 ? Number(((data.count / totalMappedAudits) * 100).toFixed(1)) : 0,
    t01Count: data.t01,
    t02Count: data.t02,
    t03Count: data.t03
  }));

  return results.sort((a, b) => b.count - a.count);
}
