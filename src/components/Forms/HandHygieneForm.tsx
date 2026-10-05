import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { HEALTH_UNITS, TRACER_03_UNITS } from '../../lib/utils';
import { formatBrDate, formatBrTime, formatBrTimestamp, sendAuditToGoogleSheet } from '../../lib/googleSheetWebhook';
import { saveCustomLocalAudit } from '../../lib/fallbackData';
import { Save, ChevronLeft, ChevronRight, AlertCircle, Sparkles, CheckCircle2, ClipboardCheck, Pill, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  user: User;
  onComplete: (sheetResult?: any) => void;
  editingAudit?: any;
  isAdmin?: boolean;
  userUnit?: string | null;
  onDelete?: (audit: any) => void;
}

export default function HandHygieneForm({ user, onComplete, editingAudit, isAdmin = true, userUnit = null, onDelete }: Props) {
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

  // State covering all 64 Questions for Tracer 03 Medication Safety
  const [formData, setFormData] = useState({
    // Section 1: Identificação Coleta
    q1_hospital: '',
    q2_data: getTodayDateStr(),
    q3_horario: getCurrentTimeStr(),
    q4_setor: '',
    q5_auditor: user.displayName || '',
    q6_paciente: '',
    q7_prontuario: '',

    // Section 2: Identificação do Paciente e Alergias
    q8_pulseira_branca: '',
    q9_pulseira_branca_just: '',
    q10_pulseira_legivel: '',
    q11_pulseira_legivel_just: '',
    q12_pulseira_preenchida: '',
    q13_pulseira_preenchida_just: '',
    q14_alergia: '',
    q15_alergia_sinalizada: '',
    q16_alergia_just: '',

    // Section 3: Preparo, Administração e Linhas
    q17_orientacao_paciente: '',
    q18_higienizacao_maos: '',
    q19_higienizacao_maos_just: '',
    q20_acesso_venoso: '',
    q21_acesso_venoso_just: '',
    q22_conferencia_pulseira: '',
    q23_conferencia_pulseira_just: '',
    q24_conferencia_prescricao: '',
    q25_dupla_checagem: '',
    q26_dupla_checagem_just: '',
    q27_rotulo_obrigatorios: '',
    q28_rotulo_obrigatorios_just: '',

    // Section 4: Prescrição Médica e Segurança
    q29_assinatura_medico: '',
    q30_assinatura_medico_just: '',
    q31_assinatura_enfermeiro: '',
    q32_assinatura_enfermeiro_just: '',
    q33_hora_correta: '',
    q34_hora_correta_just: '',
    q35_sem_abreviaturas: '',
    q36_diferenciar_semelhantes: '',
    q37_diferenciar_semelhantes_just: '',
    q38_registro_alergias: '',
    q39_registro_alergias_just: '',
    q40_duracao_especificada: '',
    q41_se_necessario_seguranca: '',
    q42_se_necessario_seguranca_just: '',
    q43_diluente_prescrito: '',
    q44_velocidade_prescrita: '',
    q45_velocidade_prescrita_just: '',
    q46_via_prescrita: '',
    q47_via_prescrita_just: '',

    // Section 5: Administração e Armazenamento / Setor
    q48_nao_administrada: '',
    q49_nao_administrada_just: '',
    q50_dose_checada: '',
    q51_dose_checada_just: '',
    q52_mav_acesso_restrito: '',
    q53_mav_acesso_restrito_just: '',
    q54_lista_mav_disponivel: '',
    q55_lista_mav_disponivel_just: '',
    q56_temperatura_refrigeracao: '',
    q57_temperatura_refrigeracao_just: '',
    q58_lista_refrigerados_disponivel: '',
    q59_lista_refrigerados_disponivel_just: '',
    q60_medicacao_casa_registrada: '',
    q61_medicacao_casa_registrada_just: '',
    q62_amostra_gratis_detectada: '',
    q63_amostra_gratis_detectada_just: '',
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

      // Flexible reader that checks both canonical and numbered keys
      const getVal = (...keys: string[]): string => {
        for (const k of keys) {
          if (rData[k] !== undefined && rData[k] !== null && String(rData[k]).trim() !== '') {
            return String(rData[k]);
          }
        }
        for (const k of keys) {
          const normK = k.replace(/^[0-9]+[\.\-\s]+/g, '').toLowerCase().replace(/[:\?\*\s]/g, '');
          for (const rk in rData) {
            const normRk = rk.replace(/^[0-9]+[\.\-\s]+/g, '').toLowerCase().replace(/[:\?\*\s]/g, '');
            if (normK === normRk && rData[rk]) {
              return String(rData[rk]);
            }
          }
        }
        return '';
      };

      // Pre-fill hospital
      const unitNameVal = getVal('Nome do Hospital/Maternidade:', 'Nome do Hospital/Maternidade', '02- Nome do Hospital/Maternidade:');
      const matchedUnit = HEALTH_UNITS.find(u => u.name === unitNameVal);
      if (matchedUnit) {
        setUnitId(matchedUnit.id);
      } else if (editingAudit.unitId) {
        setUnitId(editingAudit.unitId);
      }

      setFormData({
        q1_hospital: unitNameVal,
        q2_data: getVal('Data do Tracer:', 'Data do Tracer', '03- Data do Tracer:', 'Data') || getTodayDateStr(),
        q3_horario: getVal('Horário do Início do Tracer:', 'Horário do Início do Tracer', '04- Horário do Início do Tracer:', 'Horário') || getCurrentTimeStr(),
        q4_setor: getVal('Setor Auditado:', 'Setor Auditado', '05- Setor Auditado:', 'Setor'),
        q5_auditor: getVal('Nome Completo do Auditor:', 'Nome Completo do Auditor', '06- Nome Completo do Auditor:', 'Auditor'),
        q6_paciente: getVal('Nome Completo do Paciente:', 'Nome Completo do Paciente', '07- Nome Completo do Paciente:', 'Nome do paciente:', '07- Nome do paciente:'),
        q7_prontuario: getVal('Nº do Prontuário do Paciente:', 'Nº do Prontuário do Paciente', '08- Nº do Prontuário do Paciente:'),

        q8_pulseira_branca: getVal('Paciente identificado com pulseira branca?', '09- Paciente identificado com pulseira branca?'),
        q9_pulseira_branca_just: getVal('Se não, justifique:', '10- Se não, justifique:'),
        q10_pulseira_legivel: getVal('A pulseira de identificação está legível?', '11- A pulseira de identificação está legível?'),
        q11_pulseira_legivel_just: getVal('Se não, justifique:_1', '12- Se não, justifique:'),
        q12_pulseira_preenchida: getVal('A pulseira de identificação preenchida adequadamente?', '13- A pulseira de identificação preenchida adequadamente?'),
        q13_pulseira_preenchida_just: getVal('Se não, justifique:_2', '14- Se não, justifique:'),
        q14_alergia: getVal('O paciente tem alergia alimentar/medicamentosa?', '15- O paciente tem alergia alimentar/medicamentosa?'),
        q15_alergia_sinalizada: getVal('Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?', '16- Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?'),
        q16_alergia_just: getVal('Se não, justifique:_3', '17- Se não, justifique:'),

        q17_orientacao_paciente: getVal('Foram fornecidas orientações ao paciente sobre o medicamento administrado e possíveis efeitos?', '18- Foram fornecidas orientações ao paciente sobre o medicamento administrado e possíveis efeitos?'),
        q18_higienizacao_maos: getVal('Houve higienização das mãos imediatamente antes da administração da medicação?', '19- Houve higienização das mãos imediatamente antes da administração da medicação?'),
        q19_higienizacao_maos_just: getVal('Se não, justifique:_4', '20- Se não, justifique:'),
        q20_acesso_venoso: getVal('Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?', '21- Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?'),
        q21_acesso_venoso_just: getVal('Se não, justifique:_5', '22- Se não, justifique:'),
        q22_conferencia_pulseira: getVal('No momento da administração da medicação foi conferida a identificação do paciente com a pulseira?', '23- No momento da administração da medicação foi conferida a identificação do paciente com a pulseira?'),
        q23_conferencia_pulseira_just: getVal('Se não, justifique:_6', '24- Se não, justifique:'),
        q24_conferencia_prescricao: getVal('Houve conferência do medicamento administrado com a prescrição?', '25- Houve conferência do medicamento administrado com a prescrição?'),
        q25_dupla_checagem: getVal('Realizada dupla checagem no momento de administração da MAV?', '26- Realizada dupla checagem no momento de administração da MAV?'),
        q26_dupla_checagem_just: getVal('Se não, justifique:_7', '27- Se não, justifique:'),
        q27_rotulo_obrigatorios: getVal('O rótulo de medicação está com todos os identificadores obrigatórios?', '28- O rótulo de medicação está com todos os identificadores obrigatórios?'),
        q28_rotulo_obrigatorios_just: getVal('Se não, justifique:_8', '29- Se não, justifique:'),

        q29_assinatura_medico: getVal('Prescrição com assinatura do médico?', '30- Prescrição com assinatura do médico?'),
        q30_assinatura_medico_just: getVal('Se não, justifique:_9', '31- Se não, justifique:'),
        q31_assinatura_enfermeiro: getVal('Prescrição com assinatura do Enfermeiro que fez abertura dos horários de medicação?', '32- Prescrição com assinatura do Enfermeiro que fez abertura dos horários de medicação?'),
        q32_assinatura_enfermeiro_just: getVal('Se não, justifique:_10', '33- Se não, justifique:'),
        q33_hora_correta: getVal('A hora da administração da medicação é a mesma da prescrição?', '34- A hora da administração da medicação é a mesma da prescrição?'),
        q34_hora_correta_just: getVal('Se não, justifique:_11', '35- Se não, justifique:'),
        q35_sem_abreviaturas: getVal('A prescrição está SEM USO DE ABREVIATURAS?', '36- A prescrição está SEM USO DE ABREVIATURAS?'),
        q36_diferenciar_semelhantes: getVal('Existe estratégia para diferenciar nomes semelhantes de medicação? (ex: DOPAmina e DOBUTAmina)', '37- Existe estratégia para diferenciar nomes semelhantes de medicação? (ex: DOPAmina e DOBUTAmina)'),
        q37_diferenciar_semelhantes_just: getVal('Se não, justifique:_12', '38- Se não, justifique:'),
        q38_registro_alergias: getVal('Há registros das alergias medicamentosas na prescrição?', '39- Há registros das alergias medicamentosas na prescrição?'),
        q39_registro_alergias_just: getVal('Se não, justifique:_13', '40- Se não, justifique:'),
        q40_duracao_especificada: getVal('A duração do tratamento está especificada?', '41- A duração do tratamento está especificada?'),
        q41_se_necessario_seguranca: getVal('Medicações de uso SE NECESSÁRIO contém informações de segurança (dose, posologia, indicação de situações em que podem ser usadas)?', '42- Medicações de uso SE NECESSÁRIO contém informações de segurança (dose, posologia, indicação de situações em que podem ser usadas)?'),
        q42_se_necessario_seguranca_just: getVal('Se não, justifique:_14', '43- Se não, justifique:'),
        q43_diluente_prescrito: getVal('O diluente da medicação está prescrito?', '44- O diluente da medicação está prescrito?'),
        q44_velocidade_prescrita: getVal('A velocidade de infusão está prescrita?', '45- A velocidade de infusão está prescrita?'),
        q45_velocidade_prescrita_just: getVal('Se não, justifique:_15', '46- Se não, justifique:'),
        q46_via_prescrita: getVal('A via de administração está prescrita?', '47- A via de administração está prescrita?'),
        q47_via_prescrita_just: getVal('Se não, justifique:_16', '48- Se não, justifique:'),

        q48_nao_administrada: getVal('Alguma medicação não administrada conforme prescrição?', '49- Alguma medicação não administrada conforme prescrição?'),
        q49_nao_administrada_just: getVal('Se não, justifique:_17', '50- Se não, justifique:'),
        q50_dose_checada: getVal('A dose administrada foi checada de forma legível após a administração da medicação?', '51- A dose administrada foi checada de forma legível após a administração da medicação?'),
        q51_dose_checada_just: getVal('Se não, justifique:_18', '52- Se não, justifique:'),
        q52_mav_acesso_restrito: getVal('Medicamentos de alta vigilância e controlados estão armazenados em armários com acesso restrito?', '53- Medicamentos de alta vigilância e controlados estão armazenados em armários com acesso restrito?'),
        q53_mav_acesso_restrito_just: getVal('Se não, justifique:_19', '54- Se não, justifique:'),
        q54_lista_mav_disponivel: getVal('Lista de medicações de alta vigilância (MAV) disponível no setor?', '55- Lista de medicações de alta vigilância (MAV) disponível no setor?'),
        q55_lista_mav_disponivel_just: getVal('Se não, justifique:_20', '56- Se não, justifique:'),
        q56_temperatura_refrigeracao: getVal('Temperatura de refrigeração das medicações entre 2 e 8ºC no termohigrômetro?', '57- Temperatura de refrigeração das medicações entre 2 e 8ºC no termohigrômetro?'),
        q57_temperatura_refrigeracao_just: getVal('Se não, justifique:_21', '58- Se não, justifique:'),
        q58_lista_refrigerados_disponivel: getVal('Lista de medicações refrigeradas disponível no setor?', '59- Lista de medicações refrigeradas disponível no setor?'),
        q59_lista_refrigerados_disponivel_just: getVal('Se não, justifique:_22', '60- Se não, justifique:'),
        q60_medicacao_casa_registrada: getVal('Medicação trazida de casa registrada na prescrição do paciente?', '61- Medicação trazida de casa registrada na prescrição do paciente?', 'Medicação trazida de casa registrada na prescrição del paciente?', '61- Medicação trazida de casa registrada na prescrição del paciente?'),
        q61_medicacao_casa_registrada_just: getVal('Se não, justifique:_23', '62- Se não, justifique:'),
        q62_amostra_gratis_detectada: getVal('Alguma amostra grátis detectada no setor?', '63- Alguma amostra grátis detectada no setor?'),
        q63_amostra_gratis_detectada_just: getVal('Se sim, justifique:', '64- Se sim, justifique:'),
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
              q5_auditor: profile.name || prev.q5_auditor
            }));
          } else if (profile.name) {
            setFormData(prev => ({
              ...prev,
              q5_auditor: profile.name || prev.q5_auditor
            }));
          }
        } catch (e) {
          console.error('Error parsing auditor profile for form:', e);
        }
      }
    }
  }, [user.uid, editingAudit, isAdmin, userUnit]);

  const filteredUnits = HEALTH_UNITS.filter(u => TRACER_03_UNITS.includes(u.id));

  const handleUnitSelect = (val: string) => {
    setUnitId(val);
    const found = HEALTH_UNITS.find(u => u.id === val);
    setFormData(prev => ({
      ...prev,
      q1_hospital: found ? found.name : ''
    }));
  };

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      
      // Conditional cleanups matching PDF / User Flow
      if (field === 'q8_pulseira_branca' && value !== 'Não') next.q9_pulseira_branca_just = '';
      if (field === 'q10_pulseira_legivel' && value !== 'Não') next.q11_pulseira_legivel_just = '';
      if (field === 'q12_pulseira_preenchida' && value !== 'Não') next.q13_pulseira_preenchida_just = '';
      if (field === 'q14_alergia' && value !== 'Sim') {
        next.q15_alergia_sinalizada = '';
        next.q16_alergia_just = '';
      }
      if (field === 'q15_alergia_sinalizada' && value !== 'Não') next.q16_alergia_just = '';
      if (field === 'q18_higienizacao_maos' && value !== 'Não') next.q19_higienizacao_maos_just = '';
      if (field === 'q20_acesso_venoso' && value !== 'Não') next.q21_acesso_venoso_just = '';
      if (field === 'q22_conferencia_pulseira' && value !== 'Não') next.q23_conferencia_pulseira_just = '';
      if (field === 'q25_dupla_checagem' && value !== 'Não') next.q26_dupla_checagem_just = '';
      if (field === 'q27_rotulo_obrigatorios' && value !== 'Não') next.q28_rotulo_obrigatorios_just = '';
      if (field === 'q29_assinatura_medico' && value !== 'Não') next.q30_assinatura_medico_just = '';
      if (field === 'q31_assinatura_enfermeiro' && value !== 'Não') next.q32_assinatura_enfermeiro_just = '';
      if (field === 'q33_hora_correta' && value !== 'Não') next.q34_hora_correta_just = '';
      if (field === 'q36_diferenciar_semelhantes' && value !== 'Não') next.q37_diferenciar_semelhantes_just = '';
      if (field === 'q38_registro_alergias' && value !== 'Não') next.q39_registro_alergias_just = '';
      if (field === 'q41_se_necessario_seguranca' && value !== 'Não') next.q42_se_necessario_seguranca_just = '';
      if (field === 'q44_velocidade_prescrita' && value !== 'Não') next.q45_velocidade_prescrita_just = '';
      if (field === 'q46_via_prescrita' && value !== 'Não') next.q47_via_prescrita_just = '';
      if (field === 'q48_nao_administrada' && value !== 'Não') next.q49_nao_administrada_just = '';
      if (field === 'q50_dose_checada' && value !== 'Não') next.q51_dose_checada_just = '';
      if (field === 'q52_mav_acesso_restrito' && value !== 'Não') next.q53_mav_acesso_restrito_just = '';
      if (field === 'q54_lista_mav_disponivel' && value !== 'Não') next.q55_lista_mav_disponivel_just = '';
      if (field === 'q56_temperatura_refrigeracao' && value !== 'Não') next.q57_temperatura_refrigeracao_just = '';
      if (field === 'q58_lista_refrigerados_disponivel' && value !== 'Não') next.q59_lista_refrigerados_disponivel_just = '';
      if (field === 'q60_medicacao_casa_registrada' && value !== 'Não') next.q61_medicacao_casa_registrada_just = '';
      if (field === 'q62_amostra_gratis_detectada' && value !== 'Sim') next.q63_amostra_gratis_detectada_just = '';

      return next;
    });
  };

  const steps = [
    { id: 1, title: 'Identificação' },
    { id: 2, title: 'Pulseiras & Alergias' },
    { id: 3, title: 'Administração & Linhas' },
    { id: 4, title: 'Prescrição & Tratamento' },
    { id: 5, title: 'Estocagem & Setor' }
  ];

  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!unitId) return 'Selecione o Hospital/Maternidade.';
      if (!formData.q2_data) return 'Preencha a data do Tracer.';
      if (!formData.q3_horario) return 'Preencha o horário de início.';
      if (!formData.q4_setor.trim()) return 'Informe o setor auditado.';
      if (!formData.q5_auditor.trim()) return 'Identifique o auditor.';
      if (!formData.q6_paciente.trim()) return 'Informe o nome do paciente.';
      if (!formData.q7_prontuario.trim()) return 'Informe o número do prontuário do paciente.';
    }
    if (step === 2) {
      if (!formData.q8_pulseira_branca) return 'Selecione se o paciente possui pulseira branca.';
      if (formData.q8_pulseira_branca === 'Não' && !formData.q9_pulseira_branca_just.trim()) return 'Justifique a falta de pulseira branca.';
      if (!formData.q10_pulseira_legivel) return 'Selecione se a pulseira está legível.';
      if (formData.q10_pulseira_legivel === 'Não' && !formData.q11_pulseira_legivel_just.trim()) return 'Justifique a ilegibilidade da pulseira.';
      if (!formData.q12_pulseira_preenchida) return 'Selecione se está preenchida adequadamente.';
      if (formData.q12_pulseira_preenchida === 'Não' && !formData.q13_pulseira_preenchida_just.trim()) return 'Justifique pulseira de identificação preenchida inadequadamente.';
      if (!formData.q14_alergia) return 'Informe se o paciente tem alergias.';
      if (formData.q14_alergia === 'Sim') {
        if (!formData.q15_alergia_sinalizada) return 'Selecione se está sinalizado com pulseira rosa.';
        if (formData.q15_alergia_sinalizada === 'Não' && !formData.q16_alergia_just.trim()) return 'Justifique alergia não sinalizada com pulseira rosa.';
      }
    }
    if (step === 3) {
      if (!formData.q17_orientacao_paciente) return 'Preencha se foram fornecidas orientações ao paciente.';
      if (!formData.q18_higienizacao_maos) return 'Preencha se houve a higienização das mãos.';
      if (formData.q18_higienizacao_maos === 'Não' && !formData.q19_higienizacao_maos_just.trim()) return 'Justifique a falta de higienização das mãos.';
      if (!formData.q20_acesso_venoso) return 'Preencha se o acesso venoso foi identificado adequadamente.';
      if (formData.q20_acesso_venoso === 'Não' && !formData.q21_acesso_venoso_just.trim()) return 'Justifique a falha no acesso venoso.';
      if (!formData.q22_conferencia_pulseira) return 'Preencha se foi conferida a identificação no momento da administração.';
      if (formData.q22_conferencia_pulseira === 'Não' && !formData.q23_conferencia_pulseira_just.trim()) return 'Justifique por que não houve conferência com a pulseira.';
      if (!formData.q24_conferencia_prescricao) return 'Preencha se houve conferência com a prescrição.';
      if (!formData.q25_dupla_checagem) return 'Preencha se foi realizada a dupla checagem da MAV.';
      if (formData.q25_dupla_checagem === 'Não' && !formData.q26_dupla_checagem_just.trim()) return 'Justifique a falta de dupla checagem.';
      if (!formData.q27_rotulo_obrigatorios) return 'Preencha sobre os identificadores obrigatórios no rótulo.';
      if (formData.q27_rotulo_obrigatorios === 'Não' && !formData.q28_rotulo_obrigatorios_just.trim()) return 'Justifique por que faltam rótulos ideais.';
    }
    if (step === 4) {
      if (!formData.q29_assinatura_medico) return 'Preencha sobre a assinatura do Médico.';
      if (formData.q29_assinatura_medico === 'Não' && !formData.q30_assinatura_medico_just.trim()) return 'Justifique ausência de assinatura do médico.';
      if (!formData.q31_assinatura_enfermeiro) return 'Preencha sobre a assinatura do Enfermeiro que abriu os horários.';
      if (formData.q31_assinatura_enfermeiro === 'Não' && !formData.q32_assinatura_enfermeiro_just.trim()) return 'Justifique ausência de assinatura do enfermeiro.';
      if (!formData.q33_hora_correta) return 'Preencha se a hora de administração confere com o prescrito.';
      if (formData.q33_hora_correta === 'Não' && !formData.q34_hora_correta_just.trim()) return 'Justifique divergência de horário.';
      if (!formData.q35_sem_abreviaturas) return 'Preencha se as prescrições estão sem abreviações.';
      if (!formData.q36_diferenciar_semelhantes) return 'Preencha se há estratégia para diferenciar nomes de medicamentos semelhantes.';
      if (formData.q36_diferenciar_semelhantes === 'Não' && !formData.q37_diferenciar_semelhantes_just.trim()) return 'Justifique a falta de estratégia de medicamentos semelhantes.';
      if (!formData.q38_registro_alergias) return 'Preencha se há registro das alergias na prescrição.';
      if (formData.q38_registro_alergias === 'Não' && !formData.q39_registro_alergias_just.trim()) return 'Justifique falta de alergia registrada na prescrição.';
      if (!formData.q40_duracao_especificada) return 'Preencha se a duração do tratamento está especificada.';
      if (!formData.q41_se_necessario_seguranca) return 'Preencha se medicação ACM/se necessário contêm dados de segurança.';
      if (formData.q41_se_necessario_seguranca === 'Não' && !formData.q42_se_necessario_seguranca_just.trim()) return 'Justifique falta de segurança para medicamentos "se necessário".';
      if (!formData.q43_diluente_prescrito) return 'Preencha se o diluente está prescrito.';
      if (!formData.q44_velocidade_prescrita) return 'Preencha se a velocidade de infusão está descrita.';
      if (formData.q44_velocidade_prescrita === 'Não' && !formData.q45_velocidade_prescrita_just.trim()) return 'Justifique ausência de velocidade transcrita.';
      if (!formData.q46_via_prescrita) return 'Preencha se a via administrativa está prescrita.';
      if (formData.q46_via_prescrita === 'Não' && !formData.q47_via_prescrita_just.trim()) return 'Justifique ausência de via descrita.';
    }
    if (step === 5) {
      if (!formData.q48_nao_administrada) return 'Preencha se alguma medicação do horário não foi administrada.';
      if (formData.q48_nao_administrada === 'Não' && !formData.q49_nao_administrada_just.trim()) return 'Justifique medicação não administrada.';
      if (!formData.q50_dose_checada) return 'Preencha se a dose administrada foi checada de forma legível.';
      if (formData.q50_dose_checada === 'Não' && !formData.q51_dose_checada_just.trim()) return 'Justifique a falta de checagem.';
      if (!formData.q52_mav_acesso_restrito) return 'Preencha se medicamentos MAV estão em acesso restrito.';
      if (formData.q52_mav_acesso_restrito === 'Não' && !formData.q53_mav_acesso_restrito_just.trim()) return 'Justifique e descreva estocagem insegura.';
      if (!formData.q54_lista_mav_disponivel) return 'Preencha se o setor dispõe de lista de MAV facilitadora.';
      if (formData.q54_lista_mav_disponivel === 'Não' && !formData.q55_lista_mav_disponivel_just.trim()) return 'Justifique a falta da lista de MAV.';
      if (!formData.q56_temperatura_refrigeracao) return 'Preencha sobre a conservação térmica da geladeira (2 a 8ºC).';
      if (formData.q56_temperatura_refrigeracao === 'Não' && !formData.q57_temperatura_refrigeracao_just.trim()) return 'Justifique a temperatura fora do padrão de refrigeração.';
      if (!formData.q58_lista_refrigerados_disponivel) return 'Preencha se há lista visível de medicamentos refrigerados.';
      if (formData.q58_lista_refrigerados_disponivel === 'Não' && !formData.q59_lista_refrigerados_disponivel_just.trim()) return 'Justifique a ausência da lista refrigerada.';
      if (!formData.q60_medicacao_casa_registrada) return 'Preencha se há e se está registrada a medicação vinda do domicílio.';
      if (formData.q60_medicacao_casa_registrada === 'Não' && !formData.q61_medicacao_casa_registrada_just.trim()) return 'Justifique medicamento de casa de paciente sem prontuário.';
      if (!formData.q62_amostra_gratis_detectada) return 'Preencha sobre a existência de amostras grátis no posto.';
      if (formData.q62_amostra_gratis_detectada === 'Sim' && !formData.q63_amostra_gratis_detectada_just.trim()) return 'Justifique por que existem amostras grátis no setor.';
    }
    return null;
  };

  const handleNext = () => {
    const validationError = validateStep(currentStep);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setCurrentStep(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setError('');
    setCurrentStep(prev => prev - 1);
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
      const validationError = validateStep(s);
      if (validationError) {
        setError(validationError);
        setCurrentStep(s);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    setSubmitting(true);
    setError('');

    try {
      // Format unit and construct final rawData dictionary matching utility arrays & Google Sheet columns
      const unitName = HEALTH_UNITS.find(u => u.id === unitId)?.name || '';
      const rawData: Record<string, string> = {
        'Carimbo de data/hora': formatBrTimestamp(new Date()),
        'Nome do Hospital/Maternidade': unitName,
        'Nome do Hospital/Maternidade:': unitName,
        '02- Nome do Hospital/Maternidade:': unitName,
        'Data do Tracer:': formatBrDate(formData.q2_data),
        '03- Data do Tracer:': formData.q2_data,
        'Horário do Início do Tracer:': formatBrTime(formData.q3_horario),
        '04- Horário do Início do Tracer:': formData.q3_horario,
        'Setor Auditado:': formData.q4_setor,
        '05- Setor Auditado:': formData.q4_setor,
        'Nome Completo do Auditor:': formData.q5_auditor,
        '06- Nome Completo do Auditor:': formData.q5_auditor,
        'Nome Completo do Paciente:': formData.q6_paciente,
        'Nome do paciente:': formData.q6_paciente,
        '07- Nome Completo do Paciente:': formData.q6_paciente,
        'Nº do Prontuário do Paciente:': formData.q7_prontuario,
        '08- Nº do Prontuário do Paciente:': formData.q7_prontuario,

        'Paciente identificado com pulseira branca?': formData.q8_pulseira_branca,
        '09- Paciente identificado com pulseira branca?': formData.q8_pulseira_branca,
        ...(formData.q8_pulseira_branca === 'Não' && { 
          'Se não, justifique:': formData.q9_pulseira_branca_just,
          '10- Se não, justifique:': formData.q9_pulseira_branca_just 
        }),
        'A pulseira de identificação está legível?': formData.q10_pulseira_legivel,
        '11- A pulseira de identificação está legível?': formData.q10_pulseira_legivel,
        ...(formData.q10_pulseira_legivel === 'Não' && { 
          'Se não, justifique:_1': formData.q11_pulseira_legivel_just,
          '12- Se não, justifique:': formData.q11_pulseira_legivel_just 
        }),
        'A pulseira de identificação preenchida adequadamente?': formData.q12_pulseira_preenchida,
        '13- A pulseira de identificação preenchida adequadamente?': formData.q12_pulseira_preenchida,
        ...(formData.q12_pulseira_preenchida === 'Não' && { 
          'Se não, justifique:_2': formData.q13_pulseira_preenchida_just,
          '14- Se não, justifique:': formData.q13_pulseira_preenchida_just 
        }),
        'O paciente tem alergia alimentar/medicamentosa?': formData.q14_alergia,
        '15- O paciente tem alergia alimentar/medicamentosa?': formData.q14_alergia,
        ...(formData.q14_alergia === 'Sim' && { 
          'Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?': formData.q15_alergia_sinalizada,
          '16- Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?': formData.q15_alergia_sinalizada 
        }),
        ...(formData.q15_alergia_sinalizada === 'Não' && { 
          'Se não, justifique:_3': formData.q16_alergia_just,
          '17- Se não, justifique:': formData.q16_alergia_just 
        }),

        'Foram fornecidas orientações ao paciente sobre o medicamento administrado e possíveis efeitos?': formData.q17_orientacao_paciente,
        '18- Foram fornecidas orientações ao paciente sobre o medicamento administrado e possíveis efeitos?': formData.q17_orientacao_paciente,
        'Houve higienização das mãos imediatamente antes da administração da medicação?': formData.q18_higienizacao_maos,
        '19- Houve higienização das mãos imediatamente antes da administração da medicação?': formData.q18_higienizacao_maos,
        ...(formData.q18_higienizacao_maos === 'Não' && { 
          'Se não, justifique:_4': formData.q19_higienizacao_maos_just,
          '20- Se não, justifique:': formData.q19_higienizacao_maos_just 
        }),
        'Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?': formData.q20_acesso_venoso,
        '21- Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?': formData.q20_acesso_venoso,
        ...(formData.q20_acesso_venoso === 'Não' && { 
          'Se não, justifique:_5': formData.q21_acesso_venoso_just,
          '22- Se não, justifique:': formData.q21_acesso_venoso_just 
        }),
        'No momento da administração da medicação foi conferida a identificação do paciente com a pulseira?': formData.q22_conferencia_pulseira,
        '23- No momento da administração da medicação foi conferida a identificação do paciente com a pulseira?': formData.q22_conferencia_pulseira,
        ...(formData.q22_conferencia_pulseira === 'Não' && { 
          'Se não, justifique:_6': formData.q23_conferencia_pulseira_just,
          '24- Se não, justifique:': formData.q23_conferencia_pulseira_just 
        }),
        'Houve conferência do medicamento administrado com a prescrição?': formData.q24_conferencia_prescricao,
        '25- Houve conferência do medicamento administrado com a prescrição?': formData.q24_conferencia_prescricao,
        'Realizada dupla checagem no momento de administração da MAV?': formData.q25_dupla_checagem,
        '26- Realizada dupla checagem no momento de administração da MAV?': formData.q25_dupla_checagem,
        ...(formData.q25_dupla_checagem === 'Não' && { 
          'Se não, justifique:_7': formData.q26_dupla_checagem_just,
          '27- Se não, justifique:': formData.q26_dupla_checagem_just 
        }),
        'O rótulo de medicação está com todos os identificadores obrigatórios?': formData.q27_rotulo_obrigatorios,
        '28- O rótulo de medicação está com todos os identificadores obrigatórios?': formData.q27_rotulo_obrigatorios,
        ...(formData.q27_rotulo_obrigatorios === 'Não' && { 
          'Se não, justifique:_8': formData.q28_rotulo_obrigatorios_just,
          '29- Se não, justifique:': formData.q28_rotulo_obrigatorios_just 
        }),

        'Prescrição com assinatura do médico?': formData.q29_assinatura_medico,
        '30- Prescrição com assinatura do médico?': formData.q29_assinatura_medico,
        ...(formData.q29_assinatura_medico === 'Não' && { 
          'Se não, justifique:_9': formData.q30_assinatura_medico_just,
          '31- Se não, justifique:': formData.q30_assinatura_medico_just 
        }),
        'Prescrição com assinatura do Enfermeiro que fez abertura dos horários de medicação?': formData.q31_assinatura_enfermeiro,
        '32- Prescrição com assinatura do Enfermeiro que fez abertura dos horários de medicação?': formData.q31_assinatura_enfermeiro,
        ...(formData.q31_assinatura_enfermeiro === 'Não' && { 
          'Se não, justifique:_10': formData.q32_assinatura_enfermeiro_just,
          '33- Se não, justifique:': formData.q32_assinatura_enfermeiro_just 
        }),
        'A hora da administração da medicação é a mesma da prescrição?': formData.q33_hora_correta,
        '34- A hora da administração da medicação é a mesma da prescrição?': formData.q33_hora_correta,
        ...(formData.q33_hora_correta === 'Não' && { 
          'Se não, justifique:_11': formData.q34_hora_correta_just,
          '35- Se não, justifique:': formData.q34_hora_correta_just 
        }),
        'A prescrição está SEM USO DE ABREVIATURAS?': formData.q35_sem_abreviaturas,
        '36- A prescrição está SEM USO DE ABREVIATURAS?': formData.q35_sem_abreviaturas,
        'Existe estratégia para diferenciar nomes semelhantes de medicação? (ex: DOPAmina e DOBUTAmina)': formData.q36_diferenciar_semelhantes,
        '37- Existe estratégia para diferenciar nomes semelhantes de medicação? (ex: DOPAmina e DOBUTAmina)': formData.q36_diferenciar_semelhantes,
        ...(formData.q36_diferenciar_semelhantes === 'Não' && { 
          'Se não, justifique:_12': formData.q37_diferenciar_semelhantes_just,
          '38- Se não, justifique:': formData.q37_diferenciar_semelhantes_just 
        }),
        'Há registros das alergias medicamentosas na prescrição?': formData.q38_registro_alergias,
        '39- Há registros das alergias medicamentosas na prescrição?': formData.q38_registro_alergias,
        ...(formData.q38_registro_alergias === 'Não' && { 
          'Se não, justifique:_13': formData.q39_registro_alergias_just,
          '40- Se não, justifique:': formData.q39_registro_alergias_just 
        }),
        'A duração do tratamento está especificada?': formData.q40_duracao_especificada,
        '41- A duração do tratamento está especificada?': formData.q40_duracao_especificada,
        'Medicações de uso SE NECESSÁRIO contém informações de segurança (dose, posologia, indicação de situações em que podem ser usadas)?': formData.q41_se_necessario_seguranca,
        '42- Medicações de uso SE NECESSÁRIO contém informações de segurança (dose, posologia, indicação de situações em que podem ser usadas)?': formData.q41_se_necessario_seguranca,
        ...(formData.q41_se_necessario_seguranca === 'Não' && { 
          'Se não, justifique:_14': formData.q42_se_necessario_seguranca_just,
          '43- Se não, justifique:': formData.q42_se_necessario_seguranca_just 
        }),
        'O diluente da medicação está prescrito?': formData.q43_diluente_prescrito,
        '44- O diluente da medicação está prescrito?': formData.q43_diluente_prescrito,
        'A velocidade de infusão está prescrita?': formData.q44_velocidade_prescrita,
        '45- A velocidade de infusão está prescrita?': formData.q44_velocidade_prescrita,
        ...(formData.q44_velocidade_prescrita === 'Não' && { 
          'Se não, justifique:_15': formData.q45_velocidade_prescrita_just,
          '46- Se não, justifique:': formData.q45_velocidade_prescrita_just 
        }),
        'A via de administração está prescrita?': formData.q46_via_prescrita,
        '47- A via de administração está prescrita?': formData.q46_via_prescrita,
        ...(formData.q46_via_prescrita === 'Não' && { 
          'Se não, justifique:_16': formData.q47_via_prescrita_just,
          '48- Se não, justifique:': formData.q47_via_prescrita_just 
        }),

        'Alguma medicação não administrada conforme prescrição?': formData.q48_nao_administrada,
        '49- Alguma medicação não administrada conforme prescrição?': formData.q48_nao_administrada,
        ...(formData.q48_nao_administrada === 'Não' && { 
          'Se não, justifique:_17': formData.q49_nao_administrada_just,
          '50- Se não, justifique:': formData.q49_nao_administrada_just 
        }),
        'A dose administrada foi checada de forma legível após a administração da medicação?': formData.q50_dose_checada,
        '51- A dose administrada foi checada de forma legível após a administração da medicação?': formData.q50_dose_checada,
        ...(formData.q50_dose_checada === 'Não' && { 
          'Se não, justifique:_18': formData.q51_dose_checada_just,
          '52- Se não, justifique:': formData.q51_dose_checada_just 
        }),
        'Medicamentos de alta vigilância e controlados estão armazenados em armários com acesso restrito?': formData.q52_mav_acesso_restrito,
        '53- Medicamentos de alta vigilância e controlados estão armazenados em armários com acesso restrito?': formData.q52_mav_acesso_restrito,
        ...(formData.q52_mav_acesso_restrito === 'Não' && { 
          'Se não, justifique:_19': formData.q53_mav_acesso_restrito_just,
          '54- Se não, justifique:': formData.q53_mav_acesso_restrito_just 
        }),
        'Lista de medicações de alta vigilância (MAV) disponível no setor?': formData.q54_lista_mav_disponivel,
        '55- Lista de medicações de alta vigilância (MAV) disponível no setor?': formData.q54_lista_mav_disponivel,
        ...(formData.q54_lista_mav_disponivel === 'Não' && { 
          'Se não, justifique:_20': formData.q55_lista_mav_disponivel_just,
          '56- Se não, justifique:': formData.q55_lista_mav_disponivel_just 
        }),
        'Temperatura de refrigeração das medicações entre 2 e 8ºC no termohigrômetro?': formData.q56_temperatura_refrigeracao,
        '57- Temperatura de refrigeração das medicações entre 2 e 8ºC no termohigrômetro?': formData.q56_temperatura_refrigeracao,
        ...(formData.q56_temperatura_refrigeracao === 'Não' && { 
          'Se não, justifique:_21': formData.q57_temperatura_refrigeracao_just,
          '58- Se não, justifique:': formData.q57_temperatura_refrigeracao_just 
        }),
        'Lista de medicações refrigeradas disponível no setor?': formData.q58_lista_refrigerados_disponivel,
        '59- Lista de medicações refrigeradas disponível no setor?': formData.q58_lista_refrigerados_disponivel,
        ...(formData.q58_lista_refrigerados_disponivel === 'Não' && { 
          'Se não, justifique:_22': formData.q59_lista_refrigerados_disponivel_just,
          '60- Se não, justifique:': formData.q59_lista_refrigerados_disponivel_just 
        }),
        'Medicação trazida de casa registrada na prescrição do paciente?': formData.q60_medicacao_casa_registrada,
        '61- Medicação trazida de casa registrada na prescrição do paciente?': formData.q60_medicacao_casa_registrada,
        ...(formData.q60_medicacao_casa_registrada === 'Não' && { 
          'Se não, justifique:_23': formData.q61_medicacao_casa_registrada_just,
          '62- Se não, justifique:': formData.q61_medicacao_casa_registrada_just 
        }),
        'Alguma amostra grátis detectada no setor?': formData.q62_amostra_gratis_detectada,
        '63- Alguma amostra grátis detectada no setor?': formData.q62_amostra_gratis_detectada,
        ...(formData.q62_amostra_gratis_detectada === 'Sim' && { 
          'Se sim, justifique:': formData.q63_amostra_gratis_detectada_just,
          '64- Se sim, justifique:': formData.q63_amostra_gratis_detectada_just 
        }),
      };

      // Compliance is strictly tied to Hand Hygiene check (Yes)
      const compliantBool = formData.q18_higienizacao_maos === 'Sim';
      const activeDocId = editingAudit?.id || ('aud_h_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));

      const dateObj = formData.q2_data ? new Date(formData.q2_data + 'T12:00:00') : new Date();
      const dynamicCompetencia = editingAudit?.competencia || `${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(dateObj).replace('.', '')}/${dateObj.getFullYear()}`;

      const auditorName = formData.q5_auditor || formData.q5_nome_auditor || formData.q6_nome_auditor || user.displayName || user.email || 'Auditor de Campo';
      const patientName = formData.q6_paciente || '';
      const medicalRecordNumber = formData.q7_prontuario || '-';
      const sector = formData.q4_setor || '-';

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
          compliant: compliantBool,
          rawData,
          sourceRowHash: JSON.stringify(rawData),
          tracerNumber: '03',
          tracerName: 'Processos Seguros de Medicação',
          type: 'T03',
          competencia: dynamicCompetencia,
          timestampStr: editingAudit?.timestampStr || dateObj.toISOString()
        });
      } catch (saveLocalErr) {
        console.error("Local shadow save failed", saveLocalErr);
      }

      // 2. Synchronize to Firestore with real network sync
      try {
        await Promise.race([
          setDoc(doc(db, 'audits_hand_hygiene', activeDocId), {
            unitId,
            unitName,
            auditorId: user.uid,
            auditorName,
            patientName,
            medicalRecordNumber,
            sector,
            compliant: compliantBool,
            rawData,
            sourceRowHash: JSON.stringify(rawData),
            tracerNumber: '03',
            tracerName: 'Processos Seguros de Medicação',
            type: 'T03',
            competencia: dynamicCompetencia,
            timestampStr: editingAudit?.timestampStr || dateObj.toISOString(),
            timestamp: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ]);
      } catch (syncErr: any) {
        if (syncErr?.message === 'timeout') {
          console.warn('[HandHygieneForm] Firestore sync timed out (persisted locally).');
        } else {
          console.warn('[HandHygieneForm] Firestore save notice:', syncErr?.message || syncErr);
        }
      }

      // 3. Dispatch to destination Google Sheet Webhook if configured
      let sheetRes: any = null;
      try {
        sheetRes = await sendAuditToGoogleSheet({
          id: activeDocId,
          tracerId: 'tracer_03',
          type: 'T03',
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
        console.warn('[HandHygieneForm] Google Sheet webhook notice:', sheetErr);
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

  const renderTripleToggle = (
    field: keyof typeof formData,
    label: string,
    conditionalFieldName?: keyof typeof formData,
    conditionalLabel?: string,
    triggerValue: 'Sim' | 'Não' = 'Não'
  ) => {
    const value = formData[field];
    const isTriggerMatch = conditionalLabel?.toLowerCase().includes('se sim')
      ? value === 'Sim'
      : triggerValue === 'Sim'
      ? value === 'Sim'
      : value === 'Não';

    return (
      <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100 transition-all hover:bg-slate-50">
        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">{label}</label>
        <div className="flex gap-2">
          {['Sim', 'Não', 'Não se aplica'].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleFieldChange(field, option)}
              className={`flex-1 py-2 px-3 text-[10px] font-bold uppercase rounded-lg border transition-all ${
                value === option
                  ? option === 'Sim'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-50'
                    : option === 'Não'
                    ? 'bg-red-600 border-red-600 text-white shadow-md shadow-red-50'
                    : 'bg-slate-600 border-slate-600 text-white shadow-md shadow-slate-50'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {conditionalFieldName && isTriggerMatch && field !== 'q14_alergia' && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5 mt-3">
            <span className="text-[9px] font-extrabold uppercase text-amber-600 tracking-widest block">
              {conditionalLabel || (value === 'Sim' ? 'Se sim, justifique:' : 'Se não, justifique:')}
            </span>
            <input
              type="text"
              value={(formData[conditionalFieldName] as string) || ''}
              onChange={(e) => handleFieldChange(conditionalFieldName, e.target.value)}
              placeholder="Digite a justificativa detalhada..."
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </motion.div>
        )}

        {conditionalFieldName && field === 'q14_alergia' && value === 'Sim' && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 mt-3 pt-3 border-t border-slate-100">
            {renderTripleToggle('q15_alergia_sinalizada', '16- Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?', 'q16_alergia_just', '17- Se não, justifique:')}
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-12">
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

      <header className="mb-8 p-6 bg-white border-l-4 border-indigo-600 shadow-sm rounded-r-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
            <Pill className="w-5 h-5 text-indigo-600" />
            Tracer 03 • Coleta Digital Medicação
          </h1>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider leading-relaxed">
            Processos Seguros de Medicação: Fortalecendo a Qualidade e Segurança do Paciente
          </p>
        </div>
        <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-100/50 px-3 py-1 text-[9px] text-indigo-700 font-extrabold uppercase tracking-widest rounded-full shrink-0 h-fit self-start">
          <Sparkles className="w-3.5 h-3.5" />
          Passo {currentStep} de 5
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 w-full bg-slate-100 rounded-full mb-8 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 transition-all duration-300"
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
                    if (validateStep(check)) {
                      setError(validateStep(check));
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
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100'
                  : s.id < currentStep
                  ? 'bg-white border-emerald-100 text-emerald-600 hover:bg-emerald-50/50'
                  : 'bg-white border-slate-100 text-slate-400 opacity-60'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${
                  s.id === currentStep 
                    ? 'bg-white text-indigo-600' 
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

        {/* Form panel */}
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="flex-1 theme-card border-none ring-1 ring-slate-200 p-6 sm:p-8 space-y-6"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* STEP 1: IDENTIFICATION */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-indigo-500" />
                      Section 01 - Identificação da Coleta
                    </h2>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">
                      02- Nome do Hospital/Maternidade: * {!isAdmin && userUnit && <span className="text-blue-600 font-black">(Vinculado ao seu perfil)</span>}
                    </label>
                    <select 
                      value={unitId} 
                      onChange={(e) => handleUnitSelect(e.target.value)}
                      disabled={!isAdmin && !!userUnit}
                      className={`w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none transition-all ${!isAdmin && userUnit ? 'bg-slate-100 cursor-not-allowed opacity-90 text-blue-900 font-black' : 'focus:ring-2 focus:ring-blue-500 focus:bg-white'}`}
                    >
                      <option value="">Selecione uma unidade...</option>
                      {filteredUnits.filter(u => isAdmin || !userUnit || u.id === userUnit).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">03- Data do Tracer: *</label>
                      <input 
                        type="date"
                        value={formData.q2_data}
                        onChange={(e) => handleFieldChange('q2_data', e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">04- Horário do Início: *</label>
                      <input 
                        type="time"
                        value={formData.q3_horario}
                        onChange={(e) => handleFieldChange('q3_horario', e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">05- Setor Auditado: *</label>
                    <input 
                      type="text"
                      value={formData.q4_setor}
                      onChange={(e) => handleFieldChange('q4_setor', e.target.value)}
                      placeholder="Ex: Enfermaria Pediatria, UTI Geral..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">06- Nome Completo do Auditor: *</label>
                    <input 
                      type="text"
                      value={formData.q5_auditor}
                      onChange={(e) => handleFieldChange('q5_auditor', e.target.value)}
                      placeholder="Nome do Auditor..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">07- Nome Completo do Paciente: *</label>
                    <input 
                      type="text"
                      value={formData.q6_paciente}
                      onChange={(e) => handleFieldChange('q6_paciente', e.target.value)}
                      placeholder="Nome do paciente..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">08- Nº do Prontuário do Paciente: *</label>
                    <input 
                      type="text"
                      value={formData.q7_prontuario}
                      onChange={(e) => handleFieldChange('q7_prontuario', e.target.value)}
                      placeholder="Ex: 12345/2026..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: PULSEIRAS & ALERGIAS */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Section 02 - Identificação do Paciente e Alergias
                    </h2>
                  </div>

                  {renderTripleToggle('q8_pulseira_branca', '09- Paciente identificado com pulseira branca?', 'q9_pulseira_branca_just', '10- Se não, justifique:')}
                  
                  {renderTripleToggle('q10_pulseira_legivel', '11- A pulseira de identificação está legível?', 'q11_pulseira_legivel_just', '12- Se não, justifique:')}

                  {renderTripleToggle('q12_pulseira_preenchida', '13- A pulseira de identificação preenchida adequadamente?', 'q13_pulseira_preenchida_just', '14- Se não, justifique:')}

                  {renderTripleToggle('q14_alergia', '15- O paciente tem alergia alimentar/medicamentosa?', 'q16_alergia_just', '17- Se não, justifique:')}
                </div>
              )}

              {/* STEP 3: PREPARO, ADMINISTRAÇÃO E LINHAS */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Section 03 - Segurança no Preparo e Administração
                    </h2>
                  </div>

                  {renderTripleToggle('q17_orientacao_paciente', '18- Foram fornecidas orientações ao paciente sobre o medicamento administrado e possíveis efeitos?')}

                  {renderTripleToggle('q18_higienizacao_maos', '19- Houve higienização das mãos imediatamente antes da administração da medicação?', 'q19_higienizacao_maos_just', '20- Se não, justifique:')}

                  {renderTripleToggle('q20_acesso_venoso', '21- Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?', 'q21_acesso_venoso_just', '22- Se não, justifique:')}

                  {renderTripleToggle('q22_conferencia_pulseira', '23- No momento da administração da medicação foi conferida a identificação do paciente com a pulseira?', 'q23_conferencia_pulseira_just', '24- Se não, justifique:')}

                  {renderTripleToggle('q24_conferencia_prescricao', '25- Houve conferência do medicamento administrado com a prescrição?')}

                  {renderTripleToggle('q25_dupla_checagem', '26- Realizada dupla checagem no momento de administração da MAV?', 'q26_dupla_checagem_just', '27- Se não, justifique:')}

                  {renderTripleToggle('q27_rotulo_obrigatorios', '28- O rótulo de medicação está com todos os identificadores obrigatórios?', 'q28_rotulo_obrigatorios_just', '29- Se não, justifique:')}
                </div>
              )}

              {/* STEP 4: PRESCRIÇÃO E TRATAMENTO */}
              {currentStep === 4 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Section 04 - Prescrição e Tratamento Seguro
                    </h2>
                  </div>

                  {renderTripleToggle('q29_assinatura_medico', '30- Prescrição com assinatura do médico?', 'q30_assinatura_medico_just', '31- Se não, justifique:')}

                  {renderTripleToggle('q31_assinatura_enfermeiro', '32- Prescrição com assinatura do Enfermeiro que fez abertura dos horários de medicação?', 'q32_assinatura_enfermeiro_just', '33- Se não, justifique:')}

                  {renderTripleToggle('q33_hora_correta', '34- A hora da administração da medicação é a mesma da prescrição?', 'q34_hora_correta_just', '35- Se não, justifique:')}

                  {renderTripleToggle('q35_sem_abreviaturas', '36- A prescrição está SEM USO DE ABREVIATURAS?')}

                  {renderTripleToggle('q36_diferenciar_semelhantes', '37- Existe estratégia para diferenciar nomes semelhantes de medicação? (ex: DOPAmina e DOBUTAmina)', 'q37_diferenciar_semelhantes_just', '38- Se não, justifique:')}

                  {renderTripleToggle('q38_registro_alergias', '39- Há registros das alergias medicamentosas na prescrição?', 'q39_registro_alergias_just', '40- Se não, justifique:')}

                  {renderTripleToggle('q40_duracao_especificada', '41- A duração do tratamento está especificada?')}

                  {renderTripleToggle('q41_se_necessario_seguranca', '42- Medicações de uso SE NECESSÁRIO contém informações de segurança (dose, posologia, indicação de situações em que podem ser usadas)?', 'q42_se_necessario_seguranca_just', '43- Se não, justifique:')}

                  {renderTripleToggle('q43_diluente_prescrito', '44- O diluente da medicação está prescrito?')}

                  {renderTripleToggle('q44_velocidade_prescrita', '45- A velocidade de infusão está prescrita?', 'q45_velocidade_prescrita_just', '46- Se não, justifique:')}

                  {renderTripleToggle('q46_via_prescrita', '47- A via de administração está prescrita?', 'q47_via_prescrita_just', '48- Se não, justifique:')}
                </div>
              )}

              {/* STEP 5: ESTOCAGEM E AMBIENTE */}
              {currentStep === 5 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Section 05 - Administração Avançada, Armazenamento e Setor
                    </h2>
                  </div>

                  {renderTripleToggle('q48_nao_administrada', '49- Alguma medicação não administrada conforme prescrição?', 'q49_nao_administrada_just', '50- Se não, justifique:')}

                  {renderTripleToggle('q50_dose_checada', '51- A dose administrada foi checada de forma legível após a administração da medicação?', 'q51_dose_checada_just', '52- Se não, justifique:')}

                  {renderTripleToggle('q52_mav_acesso_restrito', '53- Medicamentos de alta vigilância e controlados estão armazenados em armários com acesso restrito?', 'q53_mav_acesso_restrito_just', '54- Se não, justifique:')}

                  {renderTripleToggle('q54_lista_mav_disponivel', '55- Lista de medicações de alta vigilância (MAV) disponível no setor?', 'q55_lista_mav_disponivel_just', '56- Se não, justifique:')}

                  {renderTripleToggle('q56_temperatura_refrigeracao', '57- Temperatura de refrigeração das medicações entre 2 e 8ºC no termohigrômetro?', 'q57_temperatura_refrigeracao_just', '58- Se não, justifique:')}

                  {renderTripleToggle('q58_lista_refrigerados_disponivel', '59- Lista de medicações refrigeradas disponível no setor?', 'q59_lista_refrigerados_disponivel_just', '60- Se não, justifique:')}

                  {renderTripleToggle('q60_medicacao_casa_registrada', '61- Medicação trazida de casa registrada na prescrição do paciente?', 'q61_medicacao_casa_registrada_just', '62- Se não, justifique:')}

                  {renderTripleToggle('q62_amostra_gratis_detectada', '63- Alguma amostra grátis detectada no setor?', 'q63_amostra_gratis_detectada_just', '64- Se sim, justifique:')}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Validation & Submit Warnings */}
          {error && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold uppercase tracking-wide">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Nav Controls */}
          <div className="flex gap-4 pt-4 border-t border-slate-100 shrink-0">
            {currentStep > 1 && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleBack}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 font-extrabold text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
            )}

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-950 text-white hover:bg-slate-800 font-extrabold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-slate-100 cursor-pointer"
              >
                Avançar
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex-1 flex items-center gap-2">
                {editingAudit && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(editingAudit)}
                    disabled={submitting}
                    className="px-4 py-3.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer rounded-xl"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Excluir</span>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-4 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shrink-0 cursor-pointer ${
                    submitting
                      ? 'bg-indigo-400 text-white opacity-90 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>{editingAudit ? 'Salvar Alterações' : 'Enviar Coleta do Tracer'}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
