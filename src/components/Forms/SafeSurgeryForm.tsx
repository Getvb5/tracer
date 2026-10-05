import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { HEALTH_UNITS, TRACER_02_UNITS } from '../../lib/utils';
import { sendAuditToGoogleSheet } from '../../lib/googleSheetWebhook';
import { saveCustomLocalAudit } from '../../lib/fallbackData';
import { Save, ChevronLeft, ChevronRight, AlertCircle, ShieldCheck, Sparkles, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  user: User;
  onComplete: (sheetResult?: any) => void;
  editingAudit?: any;
  isAdmin?: boolean;
  userUnit?: string | null;
  onDelete?: (audit: any) => void;
}

export default function SafeSurgeryForm({ user, onComplete, editingAudit, isAdmin = true, userUnit = null, onDelete }: Props) {
  const [unitId, setUnitId] = useState(userUnit || '');
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getTodayDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getCurrentTimeStr = () => {
    const d = new Date();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // State mapping ALL Tracer 02 questions
  const [formData, setFormData] = useState({
    // Step 1: Identificação
    q1_hospital: '',
    q2_data: getTodayDateStr(),
    q3_horario: getCurrentTimeStr(),
    q4_auditor: user.displayName || '',
    q5_paciente: '',
    q6_prontuario: '',
    q7_procedimento: '',

    // Step 2: Admissão & Consentimento
    q8_pulseira_branca: '',
    q8_pulseira_branca_justificativa: '',
    q9_pulseira_legivel: '',
    q9_pulseira_legivel_justificativa: '',
    q10_pulseira_preenchida: '',
    q10_pulseira_preenchida_justificativa: '',
    q11_alergia: '',
    q11_alergia_sinalizada: '',
    q11_alergia_justificativa: '',
    q12_termo_cirurgico: '',
    q12_termo_cirurgico_justificativa: '',
    q13_termo_anestesico: '',
    q13_termo_anestesico_justificativa: '',
    q14_visita_pre_anestesica: '',
    q14_visita_pre_anestesica_justificativa: '',

    // Step 3: Pré & Intraoperatório
    q15_confirma_identificacao: '',
    q16_SBAR: '',
    q16_SBAR_justificativa: '',
    q17_informado_riscos: '',
    q17_informado_riscos_justificativa: '',
    q18_retirou_adornos: '',
    q18_retirou_adornos_justificativa: '',
    q19_banho_clorexidina: '',
    q19_banho_clorexidina_justificativa: '',
    q20_degermacao: '',
    q21_equipe_completa: '',
    q21_equipe_completa_justificativa: '',
    q22_sem_adorno: '',
    q22_sem_adorno_justificativa: '',
    q23_paramentada: '',

    // Step 4: Cirurgia Segura
    q24_checklist_inducao: '',
    q24_checklist_inducao_justificativa: '',
    q25_contagem_instrumentais_antes: '',
    q25_contagem_instrumentais_antes_justificativa: '',
    q26_antibiotico: '',
    q26_antibiotico_justificativa: '',
    q27_compressas_antes: '',
    q28_checklist_incisao: '',
    q28_checklist_incisao_justificativa: '',
    q29_material_biologico: '',
    q29_material_biologico_justificativa: '',
    q30_compressas_fechamento: '',
    q30_compressas_fechamento_justificativa: '',
    q31_instrumentais_fechamento: '',
    q31_instrumentais_fechamento_justificativa: '',

    // Step 5: Pós-Operatório & RN
    q32_MORSE: '',
    q32_MORSE_justificativa: '',
    q33_dor: '',
    q33_dor_justificativa: '',
    q34_sinais_vitais: '',
    q34_sinais_vitais_justificativa: '',
    q35_checklist_saida: '',
    q35_checklist_saida_justificativa: '',
    q36_equipamentos: '',
    q36_equipamentos_justificativa: '',
    q37_RN_identificado: '',
    q37_RN_identificado_justificativa: '',
    q38_vitamina_K: '',
    q38_vitamina_K_justificativa: '',
    q39_SR: '',
    q39_SR_justificativa: '',
  });

  useEffect(() => {
    if (editingAudit) {
      let rData: Record<string, string> = editingAudit.rawData || {};
      if (!editingAudit.rawData && editingAudit.sourceRowHash) {
        try {
          rData = JSON.parse(editingAudit.sourceRowHash);
        } catch (e) {
          console.error("Failed to parse sourceRowHash in form", e);
        }
      }

      setUnitId(editingAudit.unitId || '');
      setFormData({
        q1_hospital: rData['Nome do Hospital/Maternidade'] || '',
        q2_data: rData['Data do Tracer:'] || getTodayDateStr(),
        q3_horario: rData['Horário do Início do Tracer:'] || getCurrentTimeStr(),
        q4_auditor: rData['Nome Completo do Auditor: '] || user.displayName || '',
        q5_paciente: rData['Nome Completo do Paciente:'] || '',
        q6_prontuario: rData['Nº do Prontuário do Paciente:'] || '',
        q7_procedimento: rData['Tipo de procedimento:'] || '',

        q8_pulseira_branca: rData['Paciente identificado com pulseira branca?'] || '',
        q8_pulseira_branca_justificativa: rData['Se não, justifique:'] || '',
        q9_pulseira_legivel: rData['A pulseira de identificação está legível?'] || '',
        q9_pulseira_legivel_justificativa: rData['Se não, justifique:_1'] || '',
        q10_pulseira_preenchida: rData['A pulseira de identificação preenchida adequadamente?'] || '',
        q10_pulseira_preenchida_justificativa: rData['Se não, justifique:_2'] || '',
        q11_alergia: rData['O paciente tem alergia alimentar/medicamentosa? '] || '',
        q11_alergia_sinalizada: rData['Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?'] || '',
        q11_alergia_justificativa: rData['Se não, justifique:_3'] || '',
        q12_termo_cirurgico: rData['Paciente tem termo de consentimento cirúrgico assinado e no prontuário ?'] || '',
        q12_termo_cirurgico_justificativa: rData['Se não, justifique:_4'] || '',
        q13_termo_anestesico: rData['Paciente tem termo de consentimento anestésico assinado e no prontuário?'] || '',
        q13_termo_anestesico_justificativa: rData['Se não, justifique:_5'] || '',
        q14_visita_pre_anestesica: rData['A visita pré anestésica foi realizada e registrada?'] || '',
        q14_visita_pre_anestesica_justificativa: rData['Se não, justifique:_6'] || '',

        q15_confirma_identificacao: rData['A equipe confirma a identificação do paciente antes de procedimentos ou\ncuidados (medicação, dieta, exames, transferência)?'] || '',
        q16_SBAR: rData['Formulário de transição de cuidados (SBAR) em transferência interna/externa preenchido?'] || '',
        q16_SBAR_justificativa: rData['Se não, justifique:_7'] || '',
        q17_informado_riscos: rData['Paciente foi informado sobre tipo de cirurgia, riscos e benefícios ?'] || '',
        q17_informado_riscos_justificativa: rData['Se não, justifique:_8'] || '',
        q18_retirou_adornos: rData['Paciente teve suas próteses, órteses e adornos retirado?'] || '',
        q18_retirou_adornos_justificativa: rData['Se não, justifique:_9'] || '',
        q19_banho_clorexidina: rData['Paciente fez banho com clorexidina degermante em até 6 horas antes da cirurgia?'] || '',
        q19_banho_clorexidina_justificativa: rData['Se não, justifique:_10'] || '',
        q20_degermacao: rData['A 1º degermação cirúrgica da equipe ocorreu entre 2-5 minutos?'] || '',
        q21_equipe_completa: rData['Equipe cirúrgica encontrava-se completa na sala de cirurgia?'] || '',
        q21_equipe_completa_justificativa: rData['Se não, justifique:_11'] || '',
        q22_sem_adorno: rData['A equipe estava sem adorno?'] || '',
        q22_sem_adorno_justificativa: rData['Se não, justifique:_12'] || '',
        q23_paramentada: rData['A equipe estava paramentada adequadamente?  '] || '',

        q24_checklist_inducao: rData['Check list de cirurgia segura aplicado antes da indução anestésica?'] || '',
        q24_checklist_inducao_justificativa: rData['Se não, justifique:_13'] || '',
        q25_contagem_instrumentais_antes: rData['Realizada contagem e conferência do quantitativo de instrumentais antes da incisão cirúrgica?'] || '',
        q25_contagem_instrumentais_antes_justificativa: rData['Se não, justifique:_14'] || '',
        q26_antibiotico: rData['O antibiótico profilático foi administrado 60 minutos antes da incisão\ncirúrgica?'] || '',
        q26_antibiotico_justificativa: rData['Se não, justifique:_15'] || '',
        q27_compressas_antes: rData['Houve conferência do número de compressas usadas antes da incisão cirúrgica?   ?'] || '',
        q28_checklist_incisao: rData['Check list de cirurgia segura aplicado antes da incisão cirúrgica?'] || '',
        q28_checklist_incisao_justificativa: rData['Se não, justifique:_16'] || '',
        q29_material_biologico: rData['O material biológico foi identificado adequadamente após cirurgia ?'] || '',
        q29_material_biologico_justificativa: rData['Se não, justifique:_17'] || '',
        q30_compressas_fechamento: rData[' Houve conferência do número de compressas utilizadas antes do fechamento da cavidade?  '] || '',
        q30_compressas_fechamento_justificativa: rData['Se não, justifique:_18'] || '',
        q31_instrumentais_fechamento: rData['Houve conferência do número de instrumentais utilizadas antes do fechamento da cavidade?  '] || '',
        q31_instrumentais_fechamento_justificativa: rData['Se não, justifique:_19'] || '',

        q32_MORSE: rData['Paciente com escala de MORSE realizada nas primeiras 24 horas de admissão ?'] || '',
        q32_MORSE_justificativa: rData['Se não, justifique:_20'] || '',
        q33_dor: rData['Paciente com escala de dor realizada após a cirurgia ?'] || '',
        q33_dor_justificativa: rData['Se não, justifique:_21'] || '',
        q34_sinais_vitais: rData['Sinais Vitais registrados de forma adequada no pós-operatório?'] || '',
        q34_sinais_vitais_justificativa: rData['Se não, justifique:_22'] || '',
        q35_checklist_saida: rData['Check list de cirurgia segura aplicado antes de sair da sala?'] || '',
        q35_checklist_saida_justificativa: rData['Se não, justifique:_23'] || '',
        q36_equipamentos: rData['Equipamentos funcionantes e calibrados?'] || '',
        q36_equipamentos_justificativa: rData['Se não, justifique:_24'] || '',
        q37_RN_identificado: rData['O(A) RN foi identificado(a) em sala?'] || '',
        q37_RN_identificado_justificativa: rData['Se não, justifique:_25'] || '',
        q38_vitamina_K: rData['Foi administrada a vitamina K no(a) RN?'] || '',
        q38_vitamina_K_justificativa: rData['Se não, justifique:_26'] || '',
        q39_SR: rData['A paciente (mãe) foi encaminhada para a SR?'] || '',
        q39_SR_justificativa: rData['Se não, justifique:_27'] || '',
      });
    } else {
      const effectiveUnit = !isAdmin && userUnit ? userUnit : null;
      if (effectiveUnit) {
        setUnitId(effectiveUnit);
        const found = HEALTH_UNITS.find(u => u.id === effectiveUnit);
        setFormData(prev => ({
          ...prev,
          q1_hospital: found ? found.name : ''
        }));
      }

      const savedProfileStr = localStorage.getItem(`auditor_profile_${user.uid}`);
      if (savedProfileStr) {
        try {
          const profile = JSON.parse(savedProfileStr);
          if (profile.defaultUnitId && !effectiveUnit) {
            setUnitId(profile.defaultUnitId);
            const found = HEALTH_UNITS.find(u => u.id === profile.defaultUnitId);
            setFormData(prev => ({
              ...prev,
              q1_hospital: found ? found.name : '',
              q4_auditor: profile.name || prev.q4_auditor
            }));
          } else if (profile.name) {
            setFormData(prev => ({
              ...prev,
              q4_auditor: profile.name || prev.q4_auditor
            }));
          }
        } catch (e) {
          console.error('Error parsing auditor profile for form:', e);
        }
      }
    }
  }, [user.uid, editingAudit, isAdmin, userUnit]);

  const filteredUnits = HEALTH_UNITS.filter(u => TRACER_02_UNITS.includes(u.id));

  const handleUnitSelect = (selectedId: string) => {
    setUnitId(selectedId);
    if (selectedId) {
      const found = HEALTH_UNITS.find(u => u.id === selectedId);
      setFormData(prev => ({
        ...prev,
        q1_hospital: found ? found.name : ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        q1_hospital: ''
      }));
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateStep = (stepNum: number) => {
    if (stepNum === 1) {
      if (!unitId) return 'Selecione a Unidade de Saúde.';
      if (!formData.q2_data) return 'Preencha a data do Tracer.';
      if (!formData.q3_horario) return 'Preencha o horário de início.';
      if (!formData.q4_auditor.trim()) return 'Insira o nome do auditor.';
      if (!formData.q5_paciente.trim()) return 'Insira o nome completo do paciente.';
      if (!formData.q6_prontuario.trim()) return 'Insira o prontuário do paciente.';
      if (!formData.q7_procedimento.trim()) return 'Insira o tipo de procedimento.';
    }
    if (stepNum === 2) {
      if (!formData.q8_pulseira_branca) return 'Responda se o paciente está identificado com pulseira branca.';
      if (formData.q8_pulseira_branca === 'Não' && !formData.q8_pulseira_branca_justificativa.trim()) return 'Justifique a pulseira branca.';
      if (!formData.q9_pulseira_legivel) return 'Responda se a pulseira de identificação está legível.';
      if (formData.q9_pulseira_legivel === 'Não' && !formData.q9_pulseira_legivel_justificativa.trim()) return 'Justifique a legibilidade da pulseira.';
      if (!formData.q10_pulseira_preenchida) return 'Responda se a pulseira está preenchida adequadamente.';
      if (formData.q10_pulseira_preenchida === 'Não' && !formData.q10_pulseira_preenchida_justificativa.trim()) return 'Justifique o preenchimento da pulseira.';
      if (!formData.q11_alergia) return 'Responda se o paciente tem alguma alergia.';
      if (formData.q11_alergia === 'Sim') {
        if (!formData.q11_alergia_sinalizada) return 'Responda se a alergia está sinalizada com pulseira rosa.';
        if (formData.q11_alergia_sinalizada === 'Não' && !formData.q11_alergia_justificativa.trim()) return 'Justifique a falta de pulseira rosa.';
      }
      if (!formData.q12_termo_cirurgico) return 'Responda sobre o termo de consentimento cirúrgico.';
      if (formData.q12_termo_cirurgico === 'Não' && !formData.q12_termo_cirurgico_justificativa.trim()) return 'Justifique ausência do termo cirúrgico.';
      if (!formData.q13_termo_anestesico) return 'Responda sobre o termo de consentimento anestésico.';
      if (formData.q13_termo_anestesico === 'Não' && !formData.q13_termo_anestesico_justificativa.trim()) return 'Justifique ausência do termo anestésico.';
      if (!formData.q14_visita_pre_anestesica) return 'Responda sobre a visita pré-anestésica.';
      if (formData.q14_visita_pre_anestesica === 'Não' && !formData.q14_visita_pre_anestesica_justificativa.trim()) return 'Justifique a ausência da visita pré-anestésica.';
    }
    if (stepNum === 3) {
      if (!formData.q15_confirma_identificacao) return 'Responda se a equipe confirma a identificação antes de procedimentos.';
      if (!formData.q16_SBAR) return 'Responda sobre o formulário de transição (SBAR).';
      if (formData.q16_SBAR === 'Não' && !formData.q16_SBAR_justificativa.trim()) return 'Justifique sobre o formulário SBAR.';
      if (!formData.q17_informado_riscos) return 'Responda se o paciente foi informado sobre a cirurgia e riscos.';
      if (formData.q17_informado_riscos === 'Não' && !formData.q17_informado_riscos_justificativa.trim()) return 'Justifique informações sobre a cirurgia.';
      if (!formData.q18_retirou_adornos) return 'Responda sobre a retirada de adornos/próteses.';
      if (formData.q18_retirou_adornos === 'Não' && !formData.q18_retirou_adornos_justificativa.trim()) return 'Justifique a não retirada de adornos.';
      if (!formData.q19_banho_clorexidina) return 'Responda sobre o banho com clorexidina degermante.';
      if (formData.q19_banho_clorexidina === 'Não' && !formData.q19_banho_clorexidina_justificativa.trim()) return 'Justifique ausência do banho de clorexidina.';
      if (!formData.q20_degermacao) return 'Responda sobre a 1ª degermação cirúrgica.';
      if (!formData.q21_equipe_completa) return 'Responda se a equipe estava completa na sala.';
      if (formData.q21_equipe_completa === 'Não' && !formData.q21_equipe_completa_justificativa.trim()) return 'Justifique ausência de membros da equipe.';
      if (!formData.q22_sem_adorno) return 'Responda se a equipe estava sem adornos.';
      if (formData.q22_sem_adorno === 'Não' && !formData.q22_sem_adorno_justificativa.trim()) return 'Justifique o uso de adornos pela equipe.';
      if (!formData.q23_paramentada) return 'Responda se a equipe estava paramentada adequadamente.';
    }
    if (stepNum === 4) {
      if (!formData.q24_checklist_inducao) return 'Responda sobre o checklist antes da indução (Sign In).';
      if (formData.q24_checklist_inducao === 'Não' && !formData.q24_checklist_inducao_justificativa.trim()) return 'Justifique ausência do Sign In.';
      if (!formData.q25_contagem_instrumentais_antes) return 'Responda sobre contagem de instrumentais antes da incisão.';
      if (formData.q25_contagem_instrumentais_antes === 'Não' && !formData.q25_contagem_instrumentais_antes_justificativa.trim()) return 'Justifique a contagem de instrumentais antes.';
      if (!formData.q26_antibiotico) return 'Responda sobre antibiótico profilático.';
      if (formData.q26_antibiotico === 'Não' && !formData.q26_antibiotico_justificativa.trim()) return 'Justifique administração do antibiótico.';
      if (!formData.q27_compressas_antes) return 'Responda sobre a conferência de compressas antes da incisão.';
      if (!formData.q28_checklist_incisao) return 'Responda sobre o checklist antes da incisão (Time Out).';
      if (formData.q28_checklist_incisao === 'Não' && !formData.q28_checklist_incisao_justificativa.trim()) return 'Justifique ausência do Time Out.';
      if (!formData.q29_material_biologico) return 'Responda sobre a identificação de material biológico.';
      if (formData.q29_material_biologico === 'Não' && !formData.q29_material_biologico_justificativa.trim()) return 'Justifique sobre o material biológico.';
      if (!formData.q30_compressas_fechamento) return 'Responda sobre conferência de compressas antes do fechamento.';
      if (formData.q30_compressas_fechamento === 'Não' && !formData.q30_compressas_fechamento_justificativa.trim()) return 'Justifique a conferência de compressas no fechamento.';
      if (!formData.q31_instrumentais_fechamento) return 'Responda sobre conferência de instrumentais antes do fechamento.';
      if (formData.q31_instrumentais_fechamento === 'Não' && !formData.q31_instrumentais_fechamento_justificativa.trim()) return 'Justifique a conferência de instrumentais no fechamento.';
    }
    if (stepNum === 5) {
      if (!formData.q32_MORSE) return 'Responda sobre a escala de MORSE.';
      if (formData.q32_MORSE === 'Não' && !formData.q32_MORSE_justificativa.trim()) return 'Justifique a falta da escala de MORSE.';
      if (!formData.q33_dor) return 'Responda sobre a escala de dor no pós-operatório.';
      if (formData.q33_dor === 'Não' && !formData.q33_dor_justificativa.trim()) return 'Justifique a falta de escala de dor.';
      if (!formData.q34_sinais_vitais) return 'Responda sobre sinais vitais no pós-operatório.';
      if (formData.q34_sinais_vitais === 'Não' && !formData.q34_sinais_vitais_justificativa.trim()) return 'Justifique registro de sinais vitais.';
      if (!formData.q35_checklist_saida) return 'Responda sobre o checklist antes de sair da sala (Sign Out).';
      if (formData.q35_checklist_saida === 'Não' && !formData.q35_checklist_saida_justificativa.trim()) return 'Justifique ausência do Sign Out.';
      if (!formData.q36_equipamentos) return 'Responda sobre os equipamentos funcionantes e calibrados.';
      if (formData.q36_equipamentos === 'Não' && !formData.q36_equipamentos_justificativa.trim()) return 'Justifique sobre os equipamentos.';
      if (!formData.q37_RN_identificado) return 'Responda sobre a identificação do RN em sala.';
      if (formData.q37_RN_identificado === 'Não' && !formData.q37_RN_identificado_justificativa.trim()) return 'Justifique sobre a identificação do RN.';
      if (!formData.q38_vitamina_K) return 'Responda sobre a administração da vitamina K.';
      if (formData.q38_vitamina_K === 'Não' && !formData.q38_vitamina_K_justificativa.trim()) return 'Justifique sobre a vitamina K.';
      if (!formData.q39_SR) return 'Responda sobre o encaminhamento para a Sala de Recuperação.';
      if (formData.q39_SR === 'Não' && !formData.q39_SR_justificativa.trim()) return 'Justifique sobre o encaminhamento para a SR.';
    }
    return '';
  };

  const handleNext = () => {
    const err = validateStep(currentStep);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setCurrentStep(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrev = () => {
    setError('');
    setCurrentStep(prev => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    // Prevent submission if not on final step
    if (currentStep !== 5) {
      handleNext();
      return;
    }

    // Validate all steps from 1 to 5
    for (let s = 1; s <= 5; s++) {
      const stepErr = validateStep(s);
      if (stepErr) {
        setError(stepErr);
        setCurrentStep(s);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    setSubmitting(true);
    setError('');

    const unitName = HEALTH_UNITS.find(u => u.id === unitId)?.name || '';
    
    // Construct robust rawData object matching the spreadsheet headers exactly
    const rawData: Record<string, string> = {
      'Nome do Hospital/Maternidade': unitName,
      'Data do Tracer:': formData.q2_data,
      'Horário do Início do Tracer:': formData.q3_horario,
      'Nome Completo do Auditor: ': formData.q4_auditor,
      'Nome Completo do Paciente:': formData.q5_paciente,
      'Nº do Prontuário do Paciente:': formData.q6_prontuario,
      'Tipo de procedimento:': formData.q7_procedimento,

      'Paciente identificado com pulseira branca?': formData.q8_pulseira_branca,
      ...(formData.q8_pulseira_branca === 'Não' && { 'Se não, justifique:': formData.q8_pulseira_branca_justificativa }),
      'A pulseira de identificação está legível?': formData.q9_pulseira_legivel,
      ...(formData.q9_pulseira_legivel === 'Não' && { 'Se não, justifique:_1': formData.q9_pulseira_legivel_justificativa }),
      'A pulseira de identificação preenchida adequadamente?': formData.q10_pulseira_preenchida,
      ...(formData.q10_pulseira_preenchida === 'Não' && { 'Se não, justifique:_2': formData.q10_pulseira_preenchida_justificativa }),
      'O paciente tem alergia alimentar/medicamentosa? ': formData.q11_alergia,
      ...(formData.q11_alergia === 'Sim' && { 'Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?': formData.q11_alergia_sinalizada }),
      ...(formData.q11_alergia_sinalizada === 'Não' && { 'Se não, justifique:_3': formData.q11_alergia_justificativa }),
      'Paciente tem termo de consentimento cirúrgico assinado e no prontuário ?': formData.q12_termo_cirurgico,
      ...(formData.q12_termo_cirurgico === 'Não' && { 'Se não, justifique:_4': formData.q12_termo_cirurgico_justificativa }),
      'Paciente tem termo de consentimento anestésico assinado e no prontuário?': formData.q13_termo_anestesico,
      ...(formData.q13_termo_anestesico === 'Não' && { 'Se não, justifique:_5': formData.q13_termo_anestesico_justificativa }),
      'A visita pré anestésica foi realizada e registrada?': formData.q14_visita_pre_anestesica,
      ...(formData.q14_visita_pre_anestesica === 'Não' && { 'Se não, justifique:_6': formData.q14_visita_pre_anestesica_justificativa }),

      'A equipe confirma a identificação do paciente antes de procedimentos ou\ncuidados (medicação, dieta, exames, transferência)?': formData.q15_confirma_identificacao,
      'Formulário de transição de cuidados (SBAR) em transferência interna/externa preenchido?': formData.q16_SBAR,
      ...(formData.q16_SBAR === 'Não' && { 'Se não, justifique:_7': formData.q16_SBAR_justificativa }),
      'Paciente foi informado sobre tipo de cirurgia, riscos e benefícios ?': formData.q17_informado_riscos,
      ...(formData.q17_informado_riscos === 'Não' && { 'Se não, justifique:_8': formData.q17_informado_riscos_justificativa }),
      'Paciente teve suas próteses, órteses e adornos retirado?': formData.q18_retirou_adornos,
      ...(formData.q18_retirou_adornos === 'Não' && { 'Se não, justifique:_9': formData.q18_retirou_adornos_justificativa }),
      'Paciente fez banho com clorexidina degermante em até 6 horas antes da cirurgia?': formData.q19_banho_clorexidina,
      ...(formData.q19_banho_clorexidina === 'Não' && { 'Se não, justifique:_10': formData.q19_banho_clorexidina_justificativa }),
      'A 1º degermação cirúrgica da equipe ocorreu entre 2-5 minutos?': formData.q20_degermacao,
      'Equipe cirúrgica encontrava-se completa na sala de cirurgia?': formData.q21_equipe_completa,
      ...(formData.q21_equipe_completa === 'Não' && { 'Se não, justifique:_11': formData.q21_equipe_completa_justificativa }),
      'A equipe estava sem adorno?': formData.q22_sem_adorno,
      ...(formData.q22_sem_adorno === 'Não' && { 'Se não, justifique:_12': formData.q22_sem_adorno_justificativa }),
      'A equipe estava paramentada adequadamente?  ': formData.q23_paramentada,

      'Check list de cirurgia segura aplicado antes da indução anestésica?': formData.q24_checklist_inducao,
      ...(formData.q24_checklist_inducao === 'Não' && { 'Se não, justifique:_13': formData.q24_checklist_inducao_justificativa }),
      'Realizada contagem e conferência do quantitativo de instrumentais antes da incisão cirúrgica?': formData.q25_contagem_instrumentais_antes,
      ...(formData.q25_contagem_instrumentais_antes === 'Não' && { 'Se não, justifique:_14': formData.q25_contagem_instrumentais_antes_justificativa }),
      'O antibiótico profilático foi administrado 60 minutos antes da incisão\ncirúrgica?': formData.q26_antibiotico,
      ...(formData.q26_antibiotico === 'Não' && { 'Se não, justifique:_15': formData.q26_antibiotico_justificativa }),
      'Houve conferência do número de compressas usadas antes da incisão cirúrgica?   ?': formData.q27_compressas_antes,
      'Check list de cirurgia segura aplicado antes da incisão cirúrgica?': formData.q28_checklist_incisao,
      ...(formData.q28_checklist_incisao === 'Não' && { 'Se não, justifique:_16': formData.q28_checklist_incisao_justificativa }),
      'O material biológico foi identificado adequadamente após cirurgia ?': formData.q29_material_biologico,
      ...(formData.q29_material_biologico === 'Não' && { 'Se não, justifique:_17': formData.q29_material_biologico_justificativa }),
      ' Houve conferência do número de compressas utilizadas antes do fechamento da cavidade?  ': formData.q30_compressas_fechamento,
      ...(formData.q30_compressas_fechamento === 'Não' && { 'Se não, justifique:_18': formData.q30_compressas_fechamento_justificativa }),
      'Houve conferência do número de instrumentais utilizadas antes do fechamento da cavidade?  ': formData.q31_instrumentais_fechamento,
      ...(formData.q31_instrumentais_fechamento === 'Não' && { 'Se não, justifique:_19': formData.q31_instrumentais_fechamento_justificativa }),

      'Paciente com escala de MORSE realizada nas primeiras 24 horas de admissão ?': formData.q32_MORSE,
      ...(formData.q32_MORSE === 'Não' && { 'Se não, justifique:_20': formData.q32_MORSE_justificativa }),
      'Paciente com escala de dor realizada após a cirurgia ?': formData.q33_dor,
      ...(formData.q33_dor === 'Não' && { 'Se não, justifique:_21': formData.q33_dor_justificativa }),
      'Sinais Vitais registrados de forma adequada no pós-operatório?': formData.q34_sinais_vitais,
      ...(formData.q34_sinais_vitais === 'Não' && { 'Se não, justifique:_22': formData.q34_sinais_vitais_justificativa }),
      'Check list de cirurgia segura aplicado antes de sair da sala?': formData.q35_checklist_saida,
      ...(formData.q35_checklist_saida === 'Não' && { 'Se não, justifique:_23': formData.q35_checklist_saida_justificativa }),
      'Equipamentos funcionantes e calibrados?': formData.q36_equipamentos,
      ...(formData.q36_equipamentos === 'Não' && { 'Se não, justifique:_24': formData.q36_equipamentos_justificativa }),
      'O(A) RN foi identificado(a) em sala?': formData.q37_RN_identificado,
      ...(formData.q37_RN_identificado === 'Não' && { 'Se não, justifique:_25': formData.q37_RN_identificado_justificativa }),
      'Foi administrada a vitamina K no(a) RN?': formData.q38_vitamina_K,
      ...(formData.q38_vitamina_K === 'Não' && { 'Se não, justifique:_26': formData.q38_vitamina_K_justificativa }),
      'A paciente (mãe) foi encaminhada para a SR?': formData.q39_SR,
      ...(formData.q39_SR === 'Não' && { 'Se não, justifique:_27': formData.q39_SR_justificativa }),
    };

    const scorePayload = {
      signIIn: formData.q24_checklist_inducao === 'Sim',
      timeOut: formData.q28_checklist_incisao === 'Sim',
      signOut: formData.q35_checklist_saida === 'Sim',
    };

    try {
      const activeDocId = editingAudit?.id || ('aud_s_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));

      const dateObj = formData.q2_data ? new Date(formData.q2_data + 'T12:00:00') : new Date();
      const dynamicCompetencia = editingAudit?.competencia || `${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(dateObj).replace('.', '')}/${dateObj.getFullYear()}`;

      const unitName = HEALTH_UNITS.find(u => u.id === unitId)?.name || '';
      const auditorName = formData.q4_auditor || formData.q6_nome_auditor || formData.q5_nome_auditor || user.displayName || user.email || 'Auditor de Campo';
      const patientName = formData.q5_paciente || '';
      const medicalRecordNumber = formData.q6_prontuario || '-';
      const sector = formData.q7_procedimento || 'Centro Cirúrgico / Maternidade';

      // 1. Immediately persist locally
      try {
        saveCustomLocalAudit({
          id: activeDocId,
          unitId,
          unitName,
          auditorId: user.uid,
          auditorName,
          patientName,
          medicalRecordNumber,
          sector,
          tracerNumber: '02',
          tracerName: 'Maternidades - Processos Seguros em Procedimentos Cirúrgicos',
          type: 'T02',
          ...scorePayload,
          rawData,
          sourceRowHash: JSON.stringify(rawData),
          timestampStr: editingAudit?.timestampStr || dateObj.toISOString(),
          competencia: dynamicCompetencia
        });
      } catch (saveLocalErr) {
        console.error("Local shadow save failed", saveLocalErr);
      }

      // 2. Synchronize to Firestore with real network sync
      try {
        await Promise.race([
          setDoc(doc(db, 'audits_safe_surgery', activeDocId), {
            unitId,
            unitName,
            auditorId: user.uid,
            auditorName,
            patientName,
            medicalRecordNumber,
            sector,
            type: 'T02',
            competencia: dynamicCompetencia,
            timestampStr: editingAudit?.timestampStr || dateObj.toISOString(),
            ...scorePayload,
            rawData,
            sourceRowHash: JSON.stringify(rawData),
            tracerNumber: '02',
            tracerName: 'Maternidades - Processos Seguros em Procedimentos Cirúrgicos',
            timestamp: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ]);
      } catch (syncErr: any) {
        if (syncErr?.message === 'timeout') {
          console.warn('[SafeSurgeryForm] Firestore sync timed out (persisted locally).');
        } else {
          console.warn('[SafeSurgeryForm] Firestore save notice:', syncErr?.message || syncErr);
        }
      }

      // 3. Dispatch to destination Google Sheet Webhook if configured
      let sheetRes: any = null;
      try {
        sheetRes = await sendAuditToGoogleSheet({
          id: activeDocId,
          tracerId: 'tracer_02',
          type: 'T02',
          rawData,
          patientName,
          unitName,
          auditorName,
          medicalRecordNumber,
          tracerDate: formData.q2_data,
          tracerTime: formData.q3_horario,
          sector
        });
      } catch (sheetErr: any) {
        console.warn('[SafeSurgeryForm] Google Sheet webhook notice:', sheetErr);
        sheetRes = {
          success: false,
          message: `Não foi possível enviar para a planilha: ${sheetErr?.message || 'Falha de rede ou configuração'}. A coleta foi salva com sucesso no sistema.`,
          queued: true
        };
      }

      window.dispatchEvent(new Event('local-data-updated'));
      onComplete(sheetRes);
    } catch (err: any) {
      console.error('Error in save:', err);
      window.dispatchEvent(new Event('local-data-updated'));
      onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { id: 1, title: 'Identificação' },
    { id: 2, title: 'Admissão & Termos' },
    { id: 3, title: 'Operatório' },
    { id: 4, title: 'Cirurgia Segura' },
    { id: 5, title: 'Pós-op & RN' }
  ];

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Stepper Header in style of Tracer 03 */}
      {editingAudit && (
        <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-500 text-white rounded-lg text-xs font-black">EDITANDO</span>
            <span className="text-xs font-bold text-amber-900">
              Você está alterando os dados desta coleta gravada.
            </span>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(editingAudit)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0"
              title="Excluir esta coleta permanentemente"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Coleta</span>
            </button>
          )}
        </div>
      )}

      <header className="mb-8 p-6 bg-white border-l-4 border-amber-500 shadow-sm rounded-r-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            Tracer 02 • Processos Cirúrgicos
          </h1>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider leading-relaxed">
            Maternidades & Cirurgia Segura
          </p>
        </div>
        <div className="flex items-center gap-1 bg-amber-50 border border-amber-100/50 px-3 py-1 text-[9px] text-amber-700 font-extrabold uppercase tracking-widest rounded-full shrink-0 h-fit self-start">
          <Sparkles className="w-3.5 h-3.5" />
          Passo {currentStep} de 5
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 w-full bg-slate-100 rounded-full mb-8 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-amber-500 to-yellow-600 transition-all duration-300"
          style={{ width: `${(currentStep / 5) * 100}%` }}
        />
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Navigation Sidebar Drawer */}
        <div className="w-full md:w-56 shrink-0 space-y-1">
          {steps.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={submitting}
              onClick={() => {
                if (s.id < currentStep) setCurrentStep(s.id);
                else if (s.id > currentStep) {
                  let canGo = true;
                  for (let check = currentStep; check < s.id; check++) {
                    const validationErr = validateStep(check);
                    if (validationErr) {
                      setError(validationErr);
                      canGo = false;
                      break;
                    }
                  }
                  if (canGo) {
                    setError('');
                    setCurrentStep(s.id);
                  }
                }
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                s.id === currentStep
                  ? 'bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100'
                  : s.id < currentStep
                  ? 'bg-white border-emerald-100 text-emerald-600 hover:bg-emerald-50/50'
                  : 'bg-white border-slate-100 text-slate-400 opacity-60'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${
                  s.id === currentStep 
                    ? 'bg-white text-amber-600' 
                    : s.id < currentStep 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {s.id < currentStep ? '✓' : s.id}
                </span>
                {s.title}
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>
          ))}
        </div>

        {/* Main Panel Form */}
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[460px] flex flex-col justify-between p-6 sm:p-8 space-y-6"
        >
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {/* STEP 1: IDENTIFICATION */}
              {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Informações de Identificação (Q1 - Q7)</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Defina a unidade operacional e preencha as referências de prontuário e cirurgião.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                      01. Nome do Hospital/Maternidade * {!isAdmin && userUnit && <span className="text-blue-600 font-black">(Vinculado ao seu perfil)</span>}
                    </label>
                    <select
                      value={unitId}
                      onChange={(e) => handleUnitSelect(e.target.value)}
                      disabled={!isAdmin && !!userUnit}
                      className={`w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md outline-none text-slate-800 transition-all ${!isAdmin && userUnit ? 'bg-slate-100 cursor-not-allowed opacity-90 text-blue-900 font-black' : 'focus:ring-2 focus:ring-blue-500'}`}
                    >
                      <option value="">Selecione uma unidade...</option>
                      {filteredUnits.length > 0 ? (
                        filteredUnits.filter(u => isAdmin || !userUnit || u.id === userUnit).map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                      ) : (
                        HEALTH_UNITS.filter(u => isAdmin || !userUnit || u.id === userUnit).map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">02. Data do Tracer *</label>
                    <input
                      type="date"
                      value={formData.q2_data}
                      onChange={(e) => handleFieldChange('q2_data', e.target.value)}
                      className="w-full text-xs font-bold p-2 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">03. Horário do Início *</label>
                    <input
                      type="time"
                      value={formData.q3_horario}
                      onChange={(e) => handleFieldChange('q3_horario', e.target.value)}
                      className="w-full text-xs font-bold p-2 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">04. Nome Completo do Auditor *</label>
                    <input
                      type="text"
                      placeholder="Nome do profissional coletor"
                      value={formData.q4_auditor}
                      onChange={(e) => handleFieldChange('q4_auditor', e.target.value)}
                      className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">05. Nome Completo do Paciente *</label>
                    <input
                      type="text"
                      placeholder="Nome do paciente"
                      value={formData.q5_paciente}
                      onChange={(e) => handleFieldChange('q5_paciente', e.target.value)}
                      className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">06. Nº do Prontuário do Paciente *</label>
                    <input
                      type="text"
                      placeholder="Código do prontuário"
                      value={formData.q6_prontuario}
                      onChange={(e) => handleFieldChange('q6_prontuario', e.target.value)}
                      className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">07. Tipo de procedimento *</label>
                    <input
                      type="text"
                      placeholder="Ex: Cesária, Curetagem, Histerectomia..."
                      value={formData.q7_procedimento}
                      onChange={(e) => handleFieldChange('q7_procedimento', e.target.value)}
                      className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: ADMISSION & CONSENT */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Identificação do Paciente & Consentimento (Q8 - Q14)</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Avalie os termos assinados e o padrão das pulseiras fornecidas.</p>
                </div>

                <div className="space-y-4">
                  <ChoiceRow
                    index="08"
                    label="Paciente identificado com pulseira branca?"
                    value={formData.q8_pulseira_branca}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q8_pulseira_branca', val)}
                  />
                  {formData.q8_pulseira_branca === 'Não' && (
                    <TextJustifyField
                      index="08"
                      value={formData.q8_pulseira_branca_justificativa}
                      onChange={(val) => handleFieldChange('q8_pulseira_branca_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="09"
                    label="A pulseira de identificação está legível?"
                    value={formData.q9_pulseira_legivel}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q9_pulseira_legivel', val)}
                  />
                  {formData.q9_pulseira_legivel === 'Não' && (
                    <TextJustifyField
                      index="09"
                      value={formData.q9_pulseira_legivel_justificativa}
                      onChange={(val) => handleFieldChange('q9_pulseira_legivel_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="10"
                    label="A pulseira de identificação preenchida adequadamente?"
                    value={formData.q10_pulseira_preenchida}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q10_pulseira_preenchida', val)}
                  />
                  {formData.q10_pulseira_preenchida === 'Não' && (
                    <TextJustifyField
                      index="10"
                      value={formData.q10_pulseira_preenchida_justificativa}
                      onChange={(val) => handleFieldChange('q10_pulseira_preenchida_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="11"
                    label="O paciente tem alergia alimentar/medicamentosa?"
                    value={formData.q11_alergia}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q11_alergia', val)}
                  />
                  {formData.q11_alergia === 'Sim' && (
                    <div className="pl-4 border-l-2 border-amber-200 space-y-4 pt-1">
                      <ChoiceRow
                        index="11-a"
                        label="Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?"
                        value={formData.q11_alergia_sinalizada}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q11_alergia_sinalizada', val)}
                      />
                      {formData.q11_alergia_sinalizada === 'Não' && (
                        <TextJustifyField
                          index="11-a"
                          value={formData.q11_alergia_justificativa}
                          onChange={(val) => handleFieldChange('q11_alergia_justificativa', val)}
                        />
                      )}
                    </div>
                  )}

                  <ChoiceRow
                    index="12"
                    label="Paciente tem termo de consentimento cirúrgico assinado e no prontuário?"
                    value={formData.q12_termo_cirurgico}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q12_termo_cirurgico', val)}
                  />
                  {formData.q12_termo_cirurgico === 'Não' && (
                    <TextJustifyField
                      index="12"
                      value={formData.q12_termo_cirurgico_justificativa}
                      onChange={(val) => handleFieldChange('q12_termo_cirurgico_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="13"
                    label="Paciente tem termo de consentimento anestésico assinado e no prontuário?"
                    value={formData.q13_termo_anestesico}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q13_termo_anestesico', val)}
                  />
                  {formData.q13_termo_anestesico === 'Não' && (
                    <TextJustifyField
                      index="13"
                      value={formData.q13_termo_anestesico_justificativa}
                      onChange={(val) => handleFieldChange('q13_termo_anestesico_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="14"
                    label="A visita pré anestésica foi realizada e registrada?"
                    value={formData.q14_visita_pre_anestesica}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q14_visita_pre_anestesica', val)}
                  />
                  {formData.q14_visita_pre_anestesica === 'Não' && (
                    <TextJustifyField
                      index="14"
                      value={formData.q14_visita_pre_anestesica_justificativa}
                      onChange={(val) => handleFieldChange('q14_visita_pre_anestesica_justificativa', val)}
                    />
                  )}
                </div>
              </motion.div>
            )}

            {/* STEP 3: PRE & INTRAOPERATIVE */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Pré & Intraoperatório (Q15 - Q23)</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Procedimentos prévios de higiene, paramentação e retirada de adornos.</p>
                </div>

                <div className="space-y-4">
                  <ChoiceRow
                    index="15"
                    label="A equipe confirma a identificação do paciente antes de procedimentos ou cuidados (medicação, dieta, exames, transferência)?"
                    value={formData.q15_confirma_identificacao}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q15_confirma_identificacao', val)}
                  />

                  <ChoiceRow
                    index="16"
                    label="Formulário de transição de cuidados (SBAR) em transferência interna/externa preenchido?"
                    value={formData.q16_SBAR}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q16_SBAR', val)}
                  />
                  {formData.q16_SBAR === 'Não' && (
                    <TextJustifyField
                      index="16"
                      value={formData.q16_SBAR_justificativa}
                      onChange={(val) => handleFieldChange('q16_SBAR_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="17"
                    label="Paciente foi informado sobre tipo de cirurgia, riscos e benefícios?"
                    value={formData.q17_informado_riscos}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q17_informado_riscos', val)}
                  />
                  {formData.q17_informado_riscos === 'Não' && (
                    <TextJustifyField
                      index="17"
                      value={formData.q17_informado_riscos_justificativa}
                      onChange={(val) => handleFieldChange('q17_informado_riscos_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="18"
                    label="Paciente teve suas próteses, órteses e adornos retirados?"
                    value={formData.q18_retirou_adornos}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q18_retirou_adornos', val)}
                  />
                  {formData.q18_retirou_adornos === 'Não' && (
                    <TextJustifyField
                      index="18"
                      value={formData.q18_retirou_adornos_justificativa}
                      onChange={(val) => handleFieldChange('q18_retirou_adornos_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="19"
                    label="Paciente fez banho com clorexidina degermante em até 6 horas antes da cirurgia?"
                    value={formData.q19_banho_clorexidina}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q19_banho_clorexidina', val)}
                  />
                  {formData.q19_banho_clorexidina === 'Não' && (
                    <TextJustifyField
                      index="19"
                      value={formData.q19_banho_clorexidina_justificativa}
                      onChange={(val) => handleFieldChange('q19_banho_clorexidina_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="20"
                    label="A 1º degermação cirúrgica da equipe ocorreu entre 2-5 minutos?"
                    value={formData.q20_degermacao}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q20_degermacao', val)}
                  />

                  <ChoiceRow
                    index="21"
                    label="Equipe cirúrgica encontrava-se completa na sala de cirurgia?"
                    value={formData.q21_equipe_completa}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q21_equipe_completa', val)}
                  />
                  {formData.q21_equipe_completa === 'Não' && (
                    <TextJustifyField
                      index="21"
                      value={formData.q21_equipe_completa_justificativa}
                      onChange={(val) => handleFieldChange('q21_equipe_completa_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="22"
                    label="A equipe estava sem adorno?"
                    value={formData.q22_sem_adorno}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q22_sem_adorno', val)}
                  />
                  {formData.q22_sem_adorno === 'Não' && (
                    <TextJustifyField
                      index="22"
                      value={formData.q22_sem_adorno_justificativa}
                      onChange={(val) => handleFieldChange('q22_sem_adorno_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="23"
                    label="A equipe estava paramentada adequadamente?"
                    value={formData.q23_paramentada}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q23_paramentada', val)}
                  />
                </div>
              </motion.div>
            )}

            {/* STEP 4: SAFE SURGERY (CHECKLIST INTERVENTIONS) */}
            {currentStep === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Segurança Cirúrgica • Checklist do Paciente (Q24 - Q31)</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Pontos críticos de controle: indução anestésica, incisão de segurança e fechamento cortical.</p>
                </div>

                <div className="space-y-4">
                  <ChoiceRow
                    index="24"
                    label="Check list de cirurgia segura aplicado antes da indução anestésica? (Sign In)"
                    value={formData.q24_checklist_inducao}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q24_checklist_inducao', val)}
                  />
                  {formData.q24_checklist_inducao === 'Não' && (
                    <TextJustifyField
                      index="24"
                      value={formData.q24_checklist_inducao_justificativa}
                      onChange={(val) => handleFieldChange('q24_checklist_inducao_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="25"
                    label="Realizada contagem e conferência do quantitativo de instrumentais antes da incisão cirúrgica?"
                    value={formData.q25_contagem_instrumentais_antes}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q25_contagem_instrumentais_antes', val)}
                  />
                  {formData.q25_contagem_instrumentais_antes === 'Não' && (
                    <TextJustifyField
                      index="25"
                      value={formData.q25_contagem_instrumentais_antes_justificativa}
                      onChange={(val) => handleFieldChange('q25_contagem_instrumentais_antes_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="26"
                    label="O antibiótico profilático foi administrado 60 minutos antes da incisão cirúrgica?"
                    value={formData.q26_antibiotico}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q26_antibiotico', val)}
                  />
                  {formData.q26_antibiotico === 'Não' && (
                    <TextJustifyField
                      index="26"
                      value={formData.q26_antibiotico_justificativa}
                      onChange={(val) => handleFieldChange('q26_antibiotico_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="27"
                    label="Houve conferência do número de compressas usadas antes da incisão cirúrgica?"
                    value={formData.q27_compressas_antes}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q27_compressas_antes', val)}
                  />

                  <ChoiceRow
                    index="28"
                    label="Check list de cirurgia segura aplicado antes da incisão cirúrgica? (Time Out)"
                    value={formData.q28_checklist_incisao}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q28_checklist_incisao', val)}
                  />
                  {formData.q28_checklist_incisao === 'Não' && (
                    <TextJustifyField
                      index="28"
                      value={formData.q28_checklist_incisao_justificativa}
                      onChange={(val) => handleFieldChange('q28_checklist_incisao_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="29"
                    label="O material biológico foi identificado adequadamente após cirurgia?"
                    value={formData.q29_material_biologico}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q29_material_biologico', val)}
                  />
                  {formData.q29_material_biologico === 'Não' && (
                    <TextJustifyField
                      index="29"
                      value={formData.q29_material_biologico_justificativa}
                      onChange={(val) => handleFieldChange('q29_material_biologico_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="30"
                    label="Houve conferência do número de compressas utilizadas antes do fechamento da cavidade?"
                    value={formData.q30_compressas_fechamento}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q30_compressas_fechamento', val)}
                  />
                  {formData.q30_compressas_fechamento === 'Não' && (
                    <TextJustifyField
                      index="30"
                      value={formData.q30_compressas_fechamento_justificativa}
                      onChange={(val) => handleFieldChange('q30_compressas_fechamento_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="31"
                    label="Houve conferência do número de instrumentais utilizadas antes do fechamento da cavidade?"
                    value={formData.q31_instrumentais_fechamento}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q31_instrumentais_fechamento', val)}
                  />
                  {formData.q31_instrumentais_fechamento === 'Não' && (
                    <TextJustifyField
                      index="31"
                      value={formData.q31_instrumentais_fechamento_justificativa}
                      onChange={(val) => handleFieldChange('q31_instrumentais_fechamento_justificativa', val)}
                    />
                  )}
                </div>
              </motion.div>
            )}

            {/* STEP 5: POSTOPERATIVE, NEONATAL & SIGN OUT */}
            {currentStep === 5 && (
              <motion.div
                key="step-5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Pós-Operatório & Recém-Nascido (Q32 - Q39)</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Escalas de risco, checklist de saída e cuidados específicos com RN em sala.</p>
                </div>

                <div className="space-y-4">
                  <ChoiceRow
                    index="32"
                    label="Paciente com escala de MORSE realizada nas primeiras 24 horas de admissão?"
                    value={formData.q32_MORSE}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q32_MORSE', val)}
                  />
                  {formData.q32_MORSE === 'Não' && (
                    <TextJustifyField
                      index="32"
                      value={formData.q32_MORSE_justificativa}
                      onChange={(val) => handleFieldChange('q32_MORSE_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="33"
                    label="Paciente com escala de dor realizada após a cirurgia?"
                    value={formData.q33_dor}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q33_dor', val)}
                  />
                  {formData.q33_dor === 'Não' && (
                    <TextJustifyField
                      index="33"
                      value={formData.q33_dor_justificativa}
                      onChange={(val) => handleFieldChange('q33_dor_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="34"
                    label="Sinais Vitais registrados de forma adequada no pós-operatório?"
                    value={formData.q34_sinais_vitais}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q34_sinais_vitais', val)}
                  />
                  {formData.q34_sinais_vitais === 'Não' && (
                    <TextJustifyField
                      index="34"
                      value={formData.q34_sinais_vitais_justificativa}
                      onChange={(val) => handleFieldChange('q34_sinais_vitais_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="35"
                    label="Check list de cirurgia segura aplicado antes de sair da sala? (Sign Out)"
                    value={formData.q35_checklist_saida}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q35_checklist_saida', val)}
                  />
                  {formData.q35_checklist_saida === 'Não' && (
                    <TextJustifyField
                      index="35"
                      value={formData.q35_checklist_saida_justificativa}
                      onChange={(val) => handleFieldChange('q35_checklist_saida_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="36"
                    label="Equipamentos funcionantes e calibrados?"
                    value={formData.q36_equipamentos}
                    options={['Sim', 'Não']}
                    onChange={(val) => handleFieldChange('q36_equipamentos', val)}
                  />
                  {formData.q36_equipamentos === 'Não' && (
                    <TextJustifyField
                      index="36"
                      value={formData.q36_equipamentos_justificativa}
                      onChange={(val) => handleFieldChange('q36_equipamentos_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="37"
                    label="O(A) RN foi identificado(a) em sala?"
                    value={formData.q37_RN_identificado}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q37_RN_identificado', val)}
                  />
                  {formData.q37_RN_identificado === 'Não' && (
                    <TextJustifyField
                      index="37"
                      value={formData.q37_RN_identificado_justificativa}
                      onChange={(val) => handleFieldChange('q37_RN_identificado_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="38"
                    label="Foi administrada a vitamina K no(a) RN?"
                    value={formData.q38_vitamina_K}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q38_vitamina_K', val)}
                  />
                  {formData.q38_vitamina_K === 'Não' && (
                    <TextJustifyField
                      index="38"
                      value={formData.q38_vitamina_K_justificativa}
                      onChange={(val) => handleFieldChange('q38_vitamina_K_justificativa', val)}
                    />
                  )}

                  <ChoiceRow
                    index="39"
                    label="A paciente (mãe) foi encaminhada para a SR?"
                    value={formData.q39_SR}
                    options={['Sim', 'Não', 'Não se aplica']}
                    onChange={(val) => handleFieldChange('q39_SR', val)}
                  />
                  {formData.q39_SR === 'Não' && (
                    <TextJustifyField
                      index="39"
                      value={formData.q39_SR_justificativa}
                      onChange={(val) => handleFieldChange('q39_SR_justificativa', val)}
                    />
                  )}
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* Validation Error Banner */}
          {error && (
            <div className="flex items-center gap-2 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-bold uppercase tracking-wide animate-pulse">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {/* Footer Navigation Bar */}
          <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <div className="hidden sm:flex items-center gap-1.5 text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              Preenchimento assistido inteligente
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end sm:ml-auto">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={submitting}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-black uppercase rounded-lg tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </button>
              )}

              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 sm:flex-initial px-6 py-2.5 bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 text-xs font-black uppercase rounded-lg tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer ml-auto sm:ml-0"
                >
                  Próximo
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {editingAudit && onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(editingAudit)}
                      disabled={submitting}
                      className="px-4 py-2.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-black uppercase rounded-lg tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Excluir</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`flex-1 sm:flex-initial px-6 py-2.5 text-white text-xs font-black uppercase rounded-lg tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ml-auto sm:ml-0 ${
                      submitting
                        ? 'bg-amber-400 cursor-not-allowed opacity-90'
                        : 'bg-amber-600 hover:bg-amber-700 active:scale-[0.98]'
                    }`}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white shrink-0" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 shrink-0" />
                        <span>{editingAudit ? 'Salvar Alterações' : 'Registrar Auditoria'}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Custom internal components to maintain stellar design standards */

interface ChoiceRowProps {
  index: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function ChoiceRow({ index, label, value, options, onChange }: ChoiceRowProps) {
  return (
    <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-100 space-y-3 hover:border-slate-200 hover:bg-slate-50/70 transition-all">
      <div className="flex gap-2">
        <span className="text-[10px] font-black text-amber-500 shrink-0 mt-0.5">{index}.</span>
        <span className="text-xs font-bold text-slate-700 leading-relaxed uppercase tracking-tight">{label} *</span>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {options.map((opt) => {
          const isSelected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3.5 py-2 text-[10.5px] font-black uppercase tracking-wider rounded-md border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 border-amber-500 text-white shadow-sm scale-[1.02]'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TextJustifyFieldProps {
  index: string;
  value: string;
  onChange: (value: string) => void;
}

function TextJustifyField({ index, value, onChange }: TextJustifyFieldProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="pl-4 border-l-2 border-amber-200 space-y-1.5"
    >
      <label className="text-[10px] font-black uppercase text-amber-500 tracking-wider">
        {index}. Se não, justifique *
      </label>
      <textarea
        placeholder="Descreva detalhadamente a não conformidade para melhoria..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 focus:border-amber-400 rounded-md outline-none text-slate-800 transition-colors"
      />
    </motion.div>
  );
}
