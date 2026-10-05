import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { HEALTH_UNITS, TRACER_01_UNITS } from '../../lib/utils';
import { formatBrDate, formatBrTime, formatBrTimestamp, sendAuditToGoogleSheet } from '../../lib/googleSheetWebhook';
import { saveCustomLocalAudit } from '../../lib/fallbackData';
import { Save, ChevronLeft, ChevronRight, AlertCircle, Sparkles, CheckCircle2, ClipboardCheck, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  user: User;
  onComplete: (sheetResult?: any) => void;
  editingAudit?: any;
  isAdmin?: boolean;
  userUnit?: string | null;
  onDelete?: (audit: any) => void;
}

export default function PatientIdForm({ user, onComplete, editingAudit, isAdmin = true, userUnit = null, onDelete }: Props) {
  const [unitId, setUnitId] = useState(userUnit || '');
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [errorFieldId, setErrorFieldId] = useState('');
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

  // State mimicking ALL 43 questions of the PDF
  const [formData, setFormData] = useState({
    // Section 1: Identificação
    q1_hospital: '',
    q2_data: getTodayDateStr(),
    q3_horario: getCurrentTimeStr(),
    q4_setor: '',
    q5_auditor: user.displayName || '',
    q6_paciente: '',
    q7_prontuario: '',

    // Section 2: Plano Terapêutico e Pulseiras
    q8_compreende_plano: '',
    q9_compreende_plano_justificativa: '',
    q10_pulseira_branca: '',
    q11_pulseira_branca_justificativa: '',
    q12_pulseira_legivel: '',
    q13_pulseira_legivel_justificativa: '',
    q14_pulseira_preenchida: '',
    q15_pulseira_preenchida_justificativa: '',
    q16_alergia: '',
    q17_alergia_sinalizada: '',
    q18_alergia_justificativa: '',

    // Section 3: Identificação do Leito e Dietas
    q19_placa_leito: '',
    q20_placa_leito_justificativa: '',
    q21_placa_preenchida: '',
    q22_placa_preenchida_justificativa: '',
    q23_placa_riscos: '',
    q24_placa_riscos_justificativa: '',
    q25_rotulos_dieta: '',
    q26_rotulos_dieta_justificativa: '',
    q27_rotulo_medicamento: '',

    // Section 4: Higienização e Acessos
    q28_higienizacao_maos: '',
    q29_higienizacao_maos_justificativa: '',
    q30_acesso_venoso: '',
    q31_acesso_venoso_justificativa: '',
    q32_curativo_ferida: '',
    q33_curativo_ferida_justificativa: '',

    // Section 5: Decúbito, Quedas, Passagem de Plantão e Transferências
    q34_decubito_correto: '',
    q35_decubito_correto_justificativa: '',
    q36_orientacao_lesao: '',
    q37_grades_elevadas: '',
    q38_grades_elevadas_justificativa: '',
    q39_orientacao_queda: '',
    q40_passagem_plantao: '',
    q41_passagem_plantao_justificativa: '',
    q42_SBAR: '',
    q43_SBAR_justificativa: '',
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
      
      setUnitId(editingAudit.unitId || '');
      setFormData({
        q1_hospital: getVal('Nome do Hospital/Maternidade:', 'Nome do Hospital/Maternidade', '02- Nome do Hospital/Maternidade:'),
        q2_data: getVal('Data do Tracer:', 'Data do Tracer', '03- Data do Tracer:', 'Data') || getTodayDateStr(),
        q3_horario: getVal('Horário do Início do Tracer:', 'Horário do Início do Tracer', '04- Horário do Início do Tracer:', 'Horário') || getCurrentTimeStr(),
        q4_setor: getVal('Setor Auditado:', 'Setor Auditado', '05- Setor Auditado:', 'Setor'),
        q5_auditor: getVal('Nome Completo do Auditor:', 'Nome Completo do Auditor', '06- Nome Completo do Auditor:', 'Auditor') || user.displayName || '',
        q6_paciente: getVal('Nome Completo do Paciente:', 'Nome Completo do Paciente', 'Nome do paciente:', '07- Nome do paciente:', '07- Nome Completo do Paciente:'),
        q7_prontuario: getVal('Nº do Prontuário do Paciente:', 'Nº do Prontuário do Paciente', '08- Nº do Prontuário do Paciente:'),
        q8_compreende_plano: getVal('Paciente ou responsável compreende o plano terapêutico?', '09- Paciente ou responsável compreende o plano terapêutico?'),
        q9_compreende_plano_justificativa: getVal('Se não, justifique:', '09- Se não, justifique:'),
        q10_pulseira_branca: getVal('Paciente identificado com pulseira branca?', '10- Paciente identificado com pulseira branca?'),
        q11_pulseira_branca_justificativa: getVal('Se não, justifique:_1', '11- Se não, justifique:'),
        q12_pulseira_legivel: getVal('A pulseira de identificação está legível?', '12- A pulseira de identificação está legível?'),
        q13_pulseira_legivel_justificativa: getVal('Se não, justifique:_2', '13- Se não, justifique:'),
        q14_pulseira_preenchida: getVal('A pulseira de identificação preenchida adequadamente?', '14- A pulseira de identificação preenchida adequadamente?'),
        q15_pulseira_preenchida_justificativa: getVal('Se não, justifique:_3', '15- Se não, justifique:'),
        q16_alergia: getVal('O paciente tem alergia alimentar/medicamentosa?', '16- O paciente tem alergia alimentar/medicamentosa?'),
        q17_alergia_sinalizada: getVal('Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?', '17- Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?'),
        q18_alergia_justificativa: getVal('Se não, justifique:_4', '18- Se não, justifique:'),
        q19_placa_leito: getVal('Placa de identificação do leito afixada?', '19- Placa de identificação do leito afixada?'),
        q20_placa_leito_justificativa: getVal('Se não, justifique:_5', '20- Se não, justifique:'),
        q21_placa_preenchida: getVal('Placa de identificação preenchida adequadamente?', '21- Placa de identificação preenchida adequadamente?'),
        q22_placa_preenchida_justificativa: getVal('Se não, justifique:_6', '22- Se não, justifique:'),
        q23_placa_riscos: getVal('Placa de identificação do leito com os riscos sinalizados?', '23- Placa de identificação do leito com os riscos sinalizados?'),
        q24_placa_riscos_justificativa: getVal('Se não, justifique:_7', '24- Se não, justifique:'),
        q25_rotulos_dieta: getVal('Os rótulos da dieta estão com todos os identificadores obrigatórios?', '25- Os rótulos da dieta estão com todos os identificadores obrigatórios?'),
        q26_rotulos_dieta_justificativa: getVal('Se não, justifique:_8', '26- Se não, justifique:'),
        q27_rotulo_medicamento: getVal('O rótulo de medicamentos está com todos os identificadores obrigatórios?', '27- O rótulo de medicamentos está com todos os identificadores obrigatórios?'),
        q28_higienizacao_maos: getVal('A higienização das mãos foi realizada?', '28- A higienização das mãos foi realizada?'),
        q29_higienizacao_maos_justificativa: getVal('Se não, justifique:_9', '29- Se não, justifique:'),
        q30_acesso_venoso: getVal('Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?', '30- Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?'),
        q31_acesso_venoso_justificativa: getVal('Se não, justifique:_10', '31- Se não, justifique:'),
        q32_curativo_ferida: getVal('Curativo da ferida identificado, válido e íntegro? (Cirurgias, Lesões, Drenos..)', '32- Curativo da ferida identificado, válido e íntegro? (Cirurgias, Lesões, Drenos..)'),
        q33_curativo_ferida_justificativa: getVal('Se não, justifique:_11', '33- Se não, justifique:'),
        q34_decubito_correto: getVal('Paciente está no decúbito correto de acordo com o relógio da pele no momento da visita?', '34- Paciente está no decúbito correto de acordo com o relógio da pele no momento da visita?'),
        q35_decubito_correto_justificativa: getVal('Se não, justifique:_12', '35- Se não, justifique:'),
        q36_orientacao_lesao: getVal('Paciente recebeu orientação de prevenção de lesão por pressão?', '36- Paciente recebeu orientação de prevenção de lesão por pressão?'),
        q37_grades_elevadas: getVal('Grades do leito elevadas?', '37- Grades do leito elevadas?'),
        q38_grades_elevadas_justificativa: getVal('Se não, justifique:_13', '38- Se não, justifique:'),
        q39_orientacao_queda: getVal('O paciente recebeu orientação sobre as medidas de prevenção de queda?', '39- O paciente recebeu orientação sobre as medidas de prevenção de queda?'),
        q40_passagem_plantao: getVal('Passagem de plantão da enfermagem com formulário padrão preenchido?', '40- Passagem de plantão da enfermagem com formulário padrão preenchido?'),
        q41_passagem_plantao_justificativa: getVal('Se não, justifique:_14', '41- Se não, justifique:'),
        q42_SBAR: getVal('Em caso de transferência (interna/externa) o formulário de transferência/SBAR preenchido adequadamente?', '42- Em caso de transferência (interna/externa) o formulário de transferência/SBAR preenchido adequadamente?'),
        q43_SBAR_justificativa: getVal('Se não, justifique:_15', '43- Se não, justifique:'),
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

  const filteredUnits = HEALTH_UNITS.filter(u => TRACER_01_UNITS.includes(u.id));

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
      
      // Clear secondary conditional question fields if parent choice changes
      if (field === 'q8_compreende_plano' && value === 'Sim') next.q9_compreende_plano_justificativa = '';
      if (field === 'q10_pulseira_branca' && value === 'Sim') next.q11_pulseira_branca_justificativa = '';
      if (field === 'q12_pulseira_legivel' && value === 'Sim') next.q13_pulseira_legivel_justificativa = '';
      if (field === 'q14_pulseira_preenchida' && value === 'Sim') next.q15_pulseira_preenchida_justificativa = '';
      if (field === 'q16_alergia' && value === 'Não') {
        next.q17_alergia_sinalizada = '';
        next.q18_alergia_justificativa = '';
      }
      if (field === 'q17_alergia_sinalizada' && value !== 'Não') next.q18_alergia_justificativa = '';
      if (field === 'q19_placa_leito' && value === 'Sim') next.q20_placa_leito_justificativa = '';
      if (field === 'q21_placa_preenchida' && value === 'Sim') next.q22_placa_preenchida_justificativa = '';
      if (field === 'q23_placa_riscos' && value === 'Sim') next.q24_placa_riscos_justificativa = '';
      if (field === 'q25_rotulos_dieta' && value !== 'Não') next.q26_rotulos_dieta_justificativa = '';
      if (field === 'q28_higienizacao_maos' && value !== 'Não') next.q29_higienizacao_maos_justificativa = '';
      if (field === 'q30_acesso_venoso' && value !== 'Não') next.q31_acesso_venoso_justificativa = '';
      if (field === 'q32_curativo_ferida' && value !== 'Não') next.q33_curativo_ferida_justificativa = '';
      if (field === 'q34_decubito_correto' && value !== 'Não') next.q35_decubito_correto_justificativa = '';
      if (field === 'q37_grades_elevadas' && value !== 'Não') next.q38_grades_elevadas_justificativa = '';
      if (field === 'q40_passagem_plantao' && value === 'Sim') next.q41_passagem_plantao_justificativa = '';
      if (field === 'q42_SBAR' && value !== 'Não') next.q43_SBAR_justificativa = '';

      return next;
    });

    if (error) {
      setError('');
      setErrorFieldId('');
    }
  };

  // Step names
  const steps = [
    { id: 1, title: 'Identificação' },
    { id: 2, title: 'Pulseiras' },
    { id: 3, title: 'Leito & Dieta' },
    { id: 4, title: 'Procedimentos' },
    { id: 5, title: 'Segurança & Quedas' }
  ];

  const scrollToField = (fieldId: string) => {
    setTimeout(() => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const validateStep = (step: number): { message: string; fieldId: string } | null => {
    if (step === 1) {
      if (!unitId) return { message: 'Por favor, selecione a unidade de saúde no início.', fieldId: 'field-01' };
      if (!formData.q2_data) return { message: 'Preencha o campo 02: Data do Tracer.', fieldId: 'field-02' };
      if (!formData.q3_horario) return { message: 'Preencha o campo 03: Horário do Início do Tracer.', fieldId: 'field-03' };
      if (!formData.q4_setor.trim()) return { message: 'Preencha o campo 04: Setor Auditado.', fieldId: 'field-04' };
      if (!formData.q5_auditor.trim()) return { message: 'Preencha o campo 05: Nome Completo do Auditor.', fieldId: 'field-05' };
      if (!formData.q6_paciente.trim()) return { message: 'Preencha o campo 06: Nome Completo do Paciente.', fieldId: 'field-06' };
      if (!formData.q7_prontuario.trim()) return { message: 'Preencha o campo 07: Nº do Prontuário do Paciente.', fieldId: 'field-07' };
    }
    if (step === 2) {
      if (!formData.q8_compreende_plano) return { message: 'Responda a Questão 08: Paciente ou responsável compreende o plano terapêutico?', fieldId: 'field-08' };
      if (formData.q8_compreende_plano === 'Não' && !formData.q9_compreende_plano_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 09 (Plano terapêutico).', fieldId: 'field-09' };
      if (!formData.q10_pulseira_branca) return { message: 'Responda a Questão 10: Paciente identificado com pulseira branca?', fieldId: 'field-10' };
      if (formData.q10_pulseira_branca === 'Não' && !formData.q11_pulseira_branca_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 11 (Pulseira branca).', fieldId: 'field-11' };
      if (!formData.q12_pulseira_legivel) return { message: 'Responda a Questão 12: A pulseira de identificação está legível?', fieldId: 'field-12' };
      if (formData.q12_pulseira_legivel === 'Não' && !formData.q13_pulseira_legivel_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 13 (Legibilidade).', fieldId: 'field-13' };
      if (!formData.q14_pulseira_preenchida) return { message: 'Responda a Questão 14: A pulseira de identificação está preenchida adequadamente?', fieldId: 'field-14' };
      if (formData.q14_pulseira_preenchida === 'Não' && !formData.q15_pulseira_preenchida_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 15 (Preenchimento da pulseira).', fieldId: 'field-15' };
      if (!formData.q16_alergia) return { message: 'Responda a Questão 16: O paciente tem alergia alimentar/medicamentosa?', fieldId: 'field-16' };
      if (formData.q16_alergia === 'Sim') {
        if (!formData.q17_alergia_sinalizada) return { message: 'Responda a Questão 17: Se tem alergia, está sinalizado com pulseira específica (Rosa)?', fieldId: 'field-17' };
        if (formData.q17_alergia_sinalizada === 'Não' && !formData.q18_alergia_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 18 (Indicação de alergia).', fieldId: 'field-18' };
      }
    }
    if (step === 3) {
      if (!formData.q19_placa_leito) return { message: 'Responda a Questão 19: Placa de identificação do leito afixada?', fieldId: 'field-19' };
      if (formData.q19_placa_leito === 'Não' && !formData.q20_placa_leito_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 20 (Placa do leito).', fieldId: 'field-20' };
      if (!formData.q21_placa_preenchida) return { message: 'Responda a Questão 21: Placa de identificação preenchida adequadamente?', fieldId: 'field-21' };
      if (formData.q21_placa_preenchida === 'Não' && !formData.q22_placa_preenchida_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 22 (Preenchimento da placa).', fieldId: 'field-22' };
      if (!formData.q23_placa_riscos) return { message: 'Responda a Questão 23: Placa de identificação do leito com riscos sinalizados?', fieldId: 'field-23' };
      if (formData.q23_placa_riscos === 'Não' && !formData.q24_placa_riscos_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 24 (Riscos sinalizados).', fieldId: 'field-24' };
      if (!formData.q25_rotulos_dieta) return { message: 'Responda a Questão 25: Os rótulos da dieta estão com identificadores obrigatórios?', fieldId: 'field-25' };
      if (formData.q25_rotulos_dieta === 'Não' && !formData.q26_rotulos_dieta_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 26 (Rótulo da dieta).', fieldId: 'field-26' };
      if (!formData.q27_rotulo_medicamento) return { message: 'Responda a Questão 27: O rótulo de medicamentos está com identificadores obrigatórios?', fieldId: 'field-27' };
    }
    if (step === 4) {
      if (!formData.q28_higienizacao_maos) return { message: 'Responda a Questão 28: A higienização das mãos foi realizada?', fieldId: 'field-28' };
      if (formData.q28_higienizacao_maos === 'Não' && !formData.q29_higienizacao_maos_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 29 (Higienização das mãos).', fieldId: 'field-29' };
      if (!formData.q30_acesso_venoso) return { message: 'Responda a Questão 30: Acesso venoso foi identificado adequadamente?', fieldId: 'field-30' };
      if (formData.q30_acesso_venoso === 'Não' && !formData.q31_acesso_venoso_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 31 (Acesso venoso).', fieldId: 'field-31' };
      if (!formData.q32_curativo_ferida) return { message: 'Responda a Questão 32: Curativo da ferida identificado, válido e íntegro?', fieldId: 'field-32' };
      if (formData.q32_curativo_ferida === 'Não' && !formData.q33_curativo_ferida_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 33 (Curativo da ferida).', fieldId: 'field-33' };
    }
    if (step === 5) {
      if (!formData.q34_decubito_correto) return { message: 'Responda a Questão 34: Paciente está no decúbito correto de acordo com o relógio da pele?', fieldId: 'field-34' };
      if (formData.q34_decubito_correto === 'Não' && !formData.q35_decubito_correto_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 35 (Decúbito incorreto).', fieldId: 'field-35' };
      if (!formData.q36_orientacao_lesao) return { message: 'Responda a Questão 36: Paciente recebeu orientação de prevenção de lesão por pressão?', fieldId: 'field-36' };
      if (!formData.q37_grades_elevadas) return { message: 'Responda a Questão 37: Grades do leito elevadas?', fieldId: 'field-37' };
      if (formData.q37_grades_elevadas === 'Não' && !formData.q38_grades_elevadas_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 38 (Grades do leito).', fieldId: 'field-38' };
      if (!formData.q39_orientacao_queda) return { message: 'Responda a Questão 39: O paciente recebeu orientação sobre as medidas de prevenção de queda?', fieldId: 'field-39' };
      if (!formData.q40_passagem_plantao) return { message: 'Responda a Questão 40: Passagem de plantão com formulário padrão preenchido?', fieldId: 'field-40' };
      if (formData.q40_passagem_plantao === 'Não' && !formData.q41_passagem_plantao_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 41 (Passagem de plantão).', fieldId: 'field-41' };
      if (!formData.q42_SBAR) return { message: 'Responda a Questão 42: Em caso de transferência, formulário SBAR preenchido adequadamente?', fieldId: 'field-42' };
      if (formData.q42_SBAR === 'Não' && !formData.q43_SBAR_justificativa.trim()) return { message: 'Preencha a justificativa da Questão 43 (Formulário SBAR).', fieldId: 'field-43' };
    }
    return null;
  };

  const handleNext = () => {
    const validationResult = validateStep(currentStep);
    if (validationResult) {
      setError(validationResult.message);
      setErrorFieldId(validationResult.fieldId);
      scrollToField(validationResult.fieldId);
      return;
    }
    setError('');
    setErrorFieldId('');
    setCurrentStep(prev => Math.min(prev + 1, 5));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setError('');
    setErrorFieldId('');
    setCurrentStep(prev => Math.max(prev - 1, 1));
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
    for (let step = 1; step <= 5; step++) {
      const validationResult = validateStep(step);
      if (validationResult) {
        setError(validationResult.message);
        setErrorFieldId(validationResult.fieldId);
        setCurrentStep(step);
        scrollToField(validationResult.fieldId);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    setErrorFieldId('');

    // Construct rawData EXACTLY as it appears in Google Forms matching PDF & Spreadsheet columns
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
      '07- Nome do paciente:': formData.q6_paciente,
      '07- Nome Completo do Paciente:': formData.q6_paciente,
      'Nº do Prontuário do Paciente:': formData.q7_prontuario,
      '08- Nº do Prontuário do Paciente:': formData.q7_prontuario,
      'Paciente ou responsável compreende o plano terapêutico?': formData.q8_compreende_plano,
      '09- Paciente ou responsável compreende o plano terapêutico?': formData.q8_compreende_plano,
      ...(formData.q8_compreende_plano === 'Não' && { 
        'Se não, justifique:': formData.q9_compreende_plano_justificativa,
        '09- Se não, justifique:': formData.q9_compreende_plano_justificativa 
      }),
      'Paciente identificado com pulseira branca?': formData.q10_pulseira_branca,
      '10- Paciente identificado com pulseira branca?': formData.q10_pulseira_branca,
      ...(formData.q10_pulseira_branca === 'Não' && { 
        'Se não, justifique:_1': formData.q11_pulseira_branca_justificativa,
        '11- Se não, justifique:': formData.q11_pulseira_branca_justificativa 
      }),
      'A pulseira de identificação está legível?': formData.q12_pulseira_legivel,
      '12- A pulseira de identificação está legível?': formData.q12_pulseira_legivel,
      ...(formData.q12_pulseira_legivel === 'Não' && { 
        'Se não, justifique:_2': formData.q13_pulseira_legivel_justificativa,
        '13- Se não, justifique:': formData.q13_pulseira_legivel_justificativa 
      }),
      'A pulseira de identificação preenchida adequadamente?': formData.q14_pulseira_preenchida,
      '14- A pulseira de identificação preenchida adequadamente?': formData.q14_pulseira_preenchida,
      ...(formData.q14_pulseira_preenchida === 'Não' && { 
        'Se não, justifique:_3': formData.q15_pulseira_preenchida_justificativa,
        '15- Se não, justifique:': formData.q15_pulseira_preenchida_justificativa 
      }),
      'O paciente tem alergia alimentar/medicamentosa?': formData.q16_alergia,
      '16- O paciente tem alergia alimentar/medicamentosa?': formData.q16_alergia,
      ...(formData.q16_alergia === 'Sim' && { 
        'Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?': formData.q17_alergia_sinalizada,
        '17- Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?': formData.q17_alergia_sinalizada 
      }),
      ...(formData.q17_alergia_sinalizada === 'Não' && { 
        'Se não, justifique:_4': formData.q18_alergia_justificativa,
        '18- Se não, justifique:': formData.q18_alergia_justificativa 
      }),
      'Placa de identificação do leito afixada?': formData.q19_placa_leito,
      '19- Placa de identificação do leito afixada?': formData.q19_placa_leito,
      ...(formData.q19_placa_leito === 'Não' && { 
        'Se não, justifique:_5': formData.q20_placa_leito_justificativa,
        '20- Se não, justifique:': formData.q20_placa_leito_justificativa 
      }),
      'Placa de identificação preenchida adequadamente?': formData.q21_placa_preenchida,
      '21- Placa de identificação preenchida adequadamente?': formData.q21_placa_preenchida,
      ...(formData.q21_placa_preenchida === 'Não' && { 
        'Se não, justifique:_6': formData.q22_placa_preenchida_justificativa,
        '22- Se não, justifique:': formData.q22_placa_preenchida_justificativa 
      }),
      'Placa de identificação do leito com os riscos sinalizados?': formData.q23_placa_riscos,
      '23- Placa de identificação do leito com os riscos sinalizados?': formData.q23_placa_riscos,
      ...(formData.q23_placa_riscos === 'Não' && { 
        'Se não, justifique:_7': formData.q24_placa_riscos_justificativa,
        '24- Se não, justifique:': formData.q24_placa_riscos_justificativa 
      }),
      'Os rótulos da dieta estão com todos os identificadores obrigatórios?': formData.q25_rotulos_dieta,
      '25- Os rótulos da dieta estão com todos os identificadores obrigatórios?': formData.q25_rotulos_dieta,
      ...(formData.q25_rotulos_dieta === 'Não' && { 
        'Se não, justifique:_8': formData.q26_rotulos_dieta_justificativa,
        '26- Se não, justifique:': formData.q26_rotulos_dieta_justificativa 
      }),
      'O rótulo de medicamentos está com todos os identificadores obrigatórios?': formData.q27_rotulo_medicamento,
      '27- O rótulo de medicamentos está com todos os identificadores obrigatórios?': formData.q27_rotulo_medicamento,
      'A higienização das mãos foi realizada?': formData.q28_higienizacao_maos,
      '28- A higienização das mãos foi realizada?': formData.q28_higienizacao_maos,
      ...(formData.q28_higienizacao_maos === 'Não' && { 
        'Se não, justifique:_9': formData.q29_higienizacao_maos_justificativa,
        '29- Se não, justifique:': formData.q29_higienizacao_maos_justificativa 
      }),
      'Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?': formData.q30_acesso_venoso,
      '30- Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?': formData.q30_acesso_venoso,
      ...(formData.q30_acesso_venoso === 'Não' && { 
        'Se não, justifique:_10': formData.q31_acesso_venoso_justificativa,
        '31- Se não, justifique:': formData.q31_acesso_venoso_justificativa 
      }),
      'Curativo da ferida identificado, válido e íntegro? (Cirurgias, Lesões, Drenos..)': formData.q32_curativo_ferida,
      '32- Curativo da ferida identificado, válido e íntegro? (Cirurgias, Lesões, Drenos..)': formData.q32_curativo_ferida,
      ...(formData.q32_curativo_ferida === 'Não' && { 
        'Se não, justifique:_11': formData.q33_curativo_ferida_justificativa,
        '33- Se não, justifique:': formData.q33_curativo_ferida_justificativa 
      }),
      'Paciente está no decúbito correto de acordo com o relógio da pele no momento da visita?': formData.q34_decubito_correto,
      '34- Paciente está no decúbito correto de acordo com o relógio da pele no momento da visita?': formData.q34_decubito_correto,
      ...(formData.q34_decubito_correto === 'Não' && { 
        'Se não, justifique:_12': formData.q35_decubito_correto_justificativa,
        '35- Se não, justifique:': formData.q35_decubito_correto_justificativa 
      }),
      'Paciente recebeu orientação de prevenção de lesão por pressão?': formData.q36_orientacao_lesao,
      '36- Paciente recebeu orientação de prevenção de lesão por pressão?': formData.q36_orientacao_lesao,
      'Grades do leito elevadas?': formData.q37_grades_elevadas,
      '37- Grades do leito elevadas?': formData.q37_grades_elevadas,
      ...(formData.q37_grades_elevadas === 'Não' && { 
        'Se não, justifique:_13': formData.q38_grades_elevadas_justificativa,
        '38- Se não, justifique:': formData.q38_grades_elevadas_justificativa 
      }),
      'O paciente recebeu orientação sobre as medidas de prevenção de queda?': formData.q39_orientacao_queda,
      '39- O paciente recebeu orientação sobre as medidas de prevenção de queda?': formData.q39_orientacao_queda,
      'Passagem de plantão da enfermagem com formulário padrão preenchido?': formData.q40_passagem_plantao,
      '40- Passagem de plantão da enfermagem com formulário padrão preenchido?': formData.q40_passagem_plantao,
      ...(formData.q40_passagem_plantao === 'Não' && { 
        'Se não, justifique:_14': formData.q41_passagem_plantao_justificativa,
        '41- Se não, justifique:': formData.q41_passagem_plantao_justificativa 
      }),
      'Em caso de transferência (interna/externa) o formulário de transferência/SBAR preenchido adequadamente?': formData.q42_SBAR,
      '42- Em caso de transferência (interna/externa) o formulário de transferência/SBAR preenchido adequadamente?': formData.q42_SBAR,
      ...(formData.q42_SBAR === 'Não' && { 
        'Se não, justifique:_15': formData.q43_SBAR_justificativa,
        '43- Se não, justifique:': formData.q43_SBAR_justificativa 
      })
    };

    // Calculate legacy boolean scores for summary charts alignment
    const scorePayload = {
      hasWristband: formData.q10_pulseira_branca === 'Sim',
      wristbandLegible: formData.q12_pulseira_legivel === 'Sim',
      correctData: formData.q14_pulseira_preenchida === 'Sim',
    };

    try {
      const activeDocId = editingAudit?.id || ('aud_p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));

      const dateObj = formData.q2_data ? new Date(formData.q2_data + 'T12:00:00') : new Date();
      const dynamicCompetencia = editingAudit?.competencia || `${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(dateObj).replace('.', '')}/${dateObj.getFullYear()}`;

      const auditorName = formData.q5_auditor || formData.q6_nome_auditor || user.displayName || user.email || 'Auditor de Campo';
      const patientName = formData.q6_paciente || '';
      const medicalRecordNumber = formData.q7_prontuario || '-';
      const sector = formData.q4_setor || '-';

      // 1. Immediately persist locally (instantaneous - zero lag)
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
          tracerNumber: '01',
          tracerName: 'Beira Leito',
          type: 'T01',
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
          setDoc(doc(db, 'audits_patient_id', activeDocId), {
            unitId,
            unitName,
            auditorId: user.uid,
            auditorName,
            patientName,
            medicalRecordNumber,
            sector,
            type: 'T01',
            competencia: dynamicCompetencia,
            timestampStr: editingAudit?.timestampStr || dateObj.toISOString(),
            ...scorePayload,
            rawData,
            sourceRowHash: JSON.stringify(rawData),
            tracerNumber: '01',
            tracerName: 'Beira Leito',
            timestamp: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ]);
      } catch (syncErr: any) {
        if (syncErr?.message === 'timeout') {
          console.warn('[PatientIdForm] Firestore sync timed out (persisted locally).');
        } else {
          console.warn('[PatientIdForm] Firestore save notice:', syncErr?.message || syncErr);
        }
      }

      // 3. Dispatch to destination Google Sheet Webhook if configured
      let sheetRes: any = null;
      try {
        sheetRes = await sendAuditToGoogleSheet({
          id: activeDocId,
          tracerId: 'tracer_01',
          type: 'T01',
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
        console.warn('[PatientIdForm] Google Sheet webhook notice:', sheetErr);
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

      <header className="mb-8 p-6 bg-white border-l-4 border-red-600 shadow-sm rounded-r-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
            <ClipboardCheck className="w-5 h-5 text-red-600" />
            Tracer 01 • Coleta Beira Leito
          </h1>
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider leading-relaxed">
            Segurança & Qualidade Hospitalar
          </p>
        </div>
        <div className="flex items-center gap-1 bg-red-50 border border-red-100/50 px-3 py-1 text-[9px] text-red-700 font-extrabold uppercase tracking-widest rounded-full shrink-0 h-fit self-start">
          <Sparkles className="w-3.5 h-3.5" />
          Passo {currentStep} de 5
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 w-full bg-slate-100 rounded-full mb-8 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-red-500 to-rose-600 transition-all duration-300"
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
                  ? 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-100'
                  : s.id < currentStep
                  ? 'bg-white border-emerald-100 text-emerald-600 hover:bg-emerald-50/50'
                  : 'bg-white border-slate-100 text-slate-400 opacity-60'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${
                  s.id === currentStep 
                    ? 'bg-white text-red-600' 
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
                      <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Informações de Identificação (Q1 - Q7)</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Defina a unidade operacional e preencha as referências de prontuário.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div id="field-01" className={`space-y-1.5 p-2 rounded-lg transition-all ${errorFieldId === 'field-01' ? 'bg-rose-50 border border-rose-300 ring-2 ring-rose-400/30' : ''}`}>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                          01. Nome do Hospital/Maternidade * {!isAdmin && userUnit && <span className="text-blue-600 font-black">(Vinculado ao seu perfil)</span>}
                        </label>
                        <select
                          value={unitId}
                          onChange={(e) => handleUnitSelect(e.target.value)}
                          disabled={!isAdmin && !!userUnit}
                          className={`w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-md outline-none text-slate-800 transition-all ${errorFieldId === 'field-01' ? 'border-rose-400 bg-white ring-1 ring-rose-400' : 'border-slate-200'} ${!isAdmin && userUnit ? 'bg-slate-100 cursor-not-allowed opacity-90 text-blue-900 font-black' : 'focus:ring-2 focus:ring-blue-500'}`}
                        >
                          <option value="">Selecione a unidade...</option>
                          {filteredUnits.filter(u => isAdmin || !userUnit || u.id === userUnit).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>

                      <div id="field-02" className={`space-y-1.5 p-2 rounded-lg transition-all ${errorFieldId === 'field-02' ? 'bg-rose-50 border border-rose-300 ring-2 ring-rose-400/30' : ''}`}>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">02. Data do Tracer *</label>
                        <input
                          type="date"
                          value={formData.q2_data}
                          onChange={(e) => handleFieldChange('q2_data', e.target.value)}
                          className={`w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 ${errorFieldId === 'field-02' ? 'border-rose-400 bg-white ring-1 ring-rose-400' : 'border-slate-200'}`}
                        />
                      </div>

                      <div id="field-03" className={`space-y-1.5 p-2 rounded-lg transition-all ${errorFieldId === 'field-03' ? 'bg-rose-50 border border-rose-300 ring-2 ring-rose-400/30' : ''}`}>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">03. Horário do Início *</label>
                        <input
                          type="time"
                          value={formData.q3_horario}
                          onChange={(e) => handleFieldChange('q3_horario', e.target.value)}
                          className={`w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 ${errorFieldId === 'field-03' ? 'border-rose-400 bg-white ring-1 ring-rose-400' : 'border-slate-200'}`}
                        />
                      </div>

                      <div id="field-04" className={`space-y-1.5 p-2 rounded-lg transition-all ${errorFieldId === 'field-04' ? 'bg-rose-50 border border-rose-300 ring-2 ring-rose-400/30' : ''}`}>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">04. Setor Auditado *</label>
                        <input
                          type="text"
                          placeholder="Ex: UTI Neonatal, Enfermaria B"
                          value={formData.q4_setor}
                          onChange={(e) => handleFieldChange('q4_setor', e.target.value)}
                          className={`w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 ${errorFieldId === 'field-04' ? 'border-rose-400 bg-white ring-1 ring-rose-400' : 'border-slate-200'}`}
                        />
                      </div>

                      <div id="field-05" className={`col-span-1 md:col-span-2 space-y-1.5 p-2 rounded-lg transition-all ${errorFieldId === 'field-05' ? 'bg-rose-50 border border-rose-300 ring-2 ring-rose-400/30' : ''}`}>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">05. Nome Completo do Auditor *</label>
                        <input
                          type="text"
                          placeholder="Nome do profissional coletor"
                          value={formData.q5_auditor}
                          onChange={(e) => handleFieldChange('q5_auditor', e.target.value)}
                          className={`w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 ${errorFieldId === 'field-05' ? 'border-rose-400 bg-white ring-1 ring-rose-400' : 'border-slate-200'}`}
                        />
                      </div>

                      <div id="field-06" className={`space-y-1.5 p-2 rounded-lg transition-all ${errorFieldId === 'field-06' ? 'bg-rose-50 border border-rose-300 ring-2 ring-rose-400/30' : ''}`}>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">06. Nome do paciente *</label>
                        <input
                          type="text"
                          placeholder="Nome do paciente"
                          value={formData.q6_paciente}
                          onChange={(e) => handleFieldChange('q6_paciente', e.target.value)}
                          className={`w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 ${errorFieldId === 'field-06' ? 'border-rose-400 bg-white ring-1 ring-rose-400' : 'border-slate-200'}`}
                        />
                      </div>

                      <div id="field-07" className={`space-y-1.5 p-2 rounded-lg transition-all ${errorFieldId === 'field-07' ? 'bg-rose-50 border border-rose-300 ring-2 ring-rose-400/30' : ''}`}>
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">07. Nº do Prontuário do Paciente *</label>
                        <input
                          type="text"
                          placeholder="Identificador ou Código"
                          value={formData.q7_prontuario}
                          onChange={(e) => handleFieldChange('q7_prontuario', e.target.value)}
                          className={`w-full text-xs font-bold p-2.5 bg-slate-50 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 ${errorFieldId === 'field-07' ? 'border-rose-400 bg-white ring-1 ring-rose-400' : 'border-slate-200'}`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: PATIENT UNDERSTANDING & WRISTBANDS */}
                {currentStep === 2 && (
                  <div className="space-y-5">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Plano Terapêutico e Pulseiras de Identificação (Q8 - Q18)</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Audite a pulseira operacional e segurança de alergias.</p>
                    </div>

                    <div className="space-y-4">
                      <ChoiceRow
                        index="08"
                        label="Paciente ou responsável compreende o plano terapêutico?"
                        value={formData.q8_compreende_plano}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q8_compreende_plano', val)}
                        hasError={errorFieldId === 'field-08'}
                      />
                      {formData.q8_compreende_plano === 'Não' && (
                        <TextJustifyField
                          index="09"
                          value={formData.q9_compreende_plano_justificativa}
                          onChange={(val) => handleFieldChange('q9_compreende_plano_justificativa', val)}
                          hasError={errorFieldId === 'field-09'}
                        />
                      )}

                      <ChoiceRow
                        index="10"
                        label="Paciente identificado com pulseira branca?"
                        value={formData.q10_pulseira_branca}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q10_pulseira_branca', val)}
                        hasError={errorFieldId === 'field-10'}
                      />
                      {formData.q10_pulseira_branca === 'Não' && (
                        <TextJustifyField
                          index="11"
                          value={formData.q11_pulseira_branca_justificativa}
                          onChange={(val) => handleFieldChange('q11_pulseira_branca_justificativa', val)}
                          hasError={errorFieldId === 'field-11'}
                        />
                      )}

                      <ChoiceRow
                        index="12"
                        label="A pulseira de identificação está legível?"
                        value={formData.q12_pulseira_legivel}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q12_pulseira_legivel', val)}
                        hasError={errorFieldId === 'field-12'}
                      />
                      {formData.q12_pulseira_legivel === 'Não' && (
                        <TextJustifyField
                          index="13"
                          value={formData.q13_pulseira_legivel_justificativa}
                          onChange={(val) => handleFieldChange('q13_pulseira_legivel_justificativa', val)}
                          hasError={errorFieldId === 'field-13'}
                        />
                      )}

                      <ChoiceRow
                        index="14"
                        label="A pulseira de identificação preenchida adequadamente?"
                        value={formData.q14_pulseira_preenchida}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q14_pulseira_preenchida', val)}
                        hasError={errorFieldId === 'field-14'}
                      />
                      {formData.q14_pulseira_preenchida === 'Não' && (
                        <TextJustifyField
                          index="15"
                          value={formData.q15_pulseira_preenchida_justificativa}
                          onChange={(val) => handleFieldChange('q15_pulseira_preenchida_justificativa', val)}
                          hasError={errorFieldId === 'field-15'}
                        />
                      )}

                      <ChoiceRow
                        index="16"
                        label="O paciente tem alergia alimentar/medicamentosa?"
                        value={formData.q16_alergia}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q16_alergia', val)}
                        hasError={errorFieldId === 'field-16'}
                      />

                      {formData.q16_alergia === 'Sim' && (
                        <div className="pl-4 border-l-2 border-red-200 space-y-4">
                          <ChoiceRow
                            index="17"
                            label="Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?"
                            value={formData.q17_alergia_sinalizada}
                            options={['Sim', 'Não', 'Não se aplica']}
                            onChange={(val) => handleFieldChange('q17_alergia_sinalizada', val)}
                            hasError={errorFieldId === 'field-17'}
                          />
                          {formData.q17_alergia_sinalizada === 'Não' && (
                            <TextJustifyField
                              index="18"
                              value={formData.q18_alergia_justificativa}
                              onChange={(val) => handleFieldChange('q18_alergia_justificativa', val)}
                              hasError={errorFieldId === 'field-18'}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 3: BEDPLATE SIGNS & DIETS */}
                {currentStep === 3 && (
                  <div className="space-y-5">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Identificação do Leito e Dieta (Q19 - Q27)</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Confira as placas visuais, riscos biológicos e dietas estruturadas.</p>
                    </div>

                    <div className="space-y-4">
                      <ChoiceRow
                        index="19"
                        label="Placa de identificação do leito afixada?"
                        value={formData.q19_placa_leito}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q19_placa_leito', val)}
                        hasError={errorFieldId === 'field-19'}
                      />
                      {formData.q19_placa_leito === 'Não' && (
                        <TextJustifyField
                          index="20"
                          value={formData.q20_placa_leito_justificativa}
                          onChange={(val) => handleFieldChange('q20_placa_leito_justificativa', val)}
                          hasError={errorFieldId === 'field-20'}
                        />
                      )}

                      <ChoiceRow
                        index="21"
                        label="Placa de identificação preenchida adequadamente?"
                        value={formData.q21_placa_preenchida}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q21_placa_preenchida', val)}
                        hasError={errorFieldId === 'field-21'}
                      />
                      {formData.q21_placa_preenchida === 'Não' && (
                        <TextJustifyField
                          index="22"
                          value={formData.q22_placa_preenchida_justificativa}
                          onChange={(val) => handleFieldChange('q22_placa_preenchida_justificativa', val)}
                          hasError={errorFieldId === 'field-22'}
                        />
                      )}

                      <ChoiceRow
                        index="23"
                        label="Placa de identificação do leito com os riscos sinalizados?"
                        value={formData.q23_placa_riscos}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q23_placa_riscos', val)}
                        hasError={errorFieldId === 'field-23'}
                      />
                      {formData.q23_placa_riscos === 'Não' && (
                        <TextJustifyField
                          index="24"
                          value={formData.q24_placa_riscos_justificativa}
                          onChange={(val) => handleFieldChange('q24_placa_riscos_justificativa', val)}
                          hasError={errorFieldId === 'field-24'}
                        />
                      )}

                      <ChoiceRow
                        index="25"
                        label="Os rótulos da dieta estão com todos os identificadores obrigatórios?"
                        value={formData.q25_rotulos_dieta}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q25_rotulos_dieta', val)}
                        hasError={errorFieldId === 'field-25'}
                      />
                      {formData.q25_rotulos_dieta === 'Não' && (
                        <TextJustifyField
                          index="26"
                          value={formData.q26_rotulos_dieta_justificativa}
                          onChange={(val) => handleFieldChange('q26_rotulos_dieta_justificativa', val)}
                          hasError={errorFieldId === 'field-26'}
                        />
                      )}

                      <ChoiceRow
                        index="27"
                        label="O rótulo de medicamentos está com todos os identificadores obrigatórios?"
                        value={formData.q27_rotulo_medicamento}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q27_rotulo_medicamento', val)}
                        hasError={errorFieldId === 'field-27'}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 4: HAND HYGIENE & VENOUS ACCESS */}
                {currentStep === 4 && (
                  <div className="space-y-5">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Higienização e Dispositivos Invasivos (Q28 - Q33)</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Inspecione a lavagem das mãos pré-procedimento e marcações de cateteres.</p>
                    </div>

                    <div className="space-y-4">
                      <ChoiceRow
                        index="28"
                        label="A higienização das mãos foi realizada?"
                        value={formData.q28_higienizacao_maos}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q28_higienizacao_maos', val)}
                        hasError={errorFieldId === 'field-28'}
                      />
                      {formData.q28_higienizacao_maos === 'Não' && (
                        <TextJustifyField
                          index="29"
                          value={formData.q29_higienizacao_maos_justificativa}
                          onChange={(val) => handleFieldChange('q29_higienizacao_maos_justificativa', val)}
                          hasError={errorFieldId === 'field-29'}
                        />
                      )}

                      <ChoiceRow
                        index="30"
                        label="Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?"
                        value={formData.q30_acesso_venoso}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q30_acesso_venoso', val)}
                        hasError={errorFieldId === 'field-30'}
                      />
                      {formData.q30_acesso_venoso === 'Não' && (
                        <TextJustifyField
                          index="31"
                          value={formData.q31_acesso_venoso_justificativa}
                          onChange={(val) => handleFieldChange('q31_acesso_venoso_justificativa', val)}
                          hasError={errorFieldId === 'field-31'}
                        />
                      )}

                      <ChoiceRow
                        index="32"
                        label="Curativo da ferida identificado, válido e íntegro? (Cirurgias, Lesões, Drenos..)"
                        value={formData.q32_curativo_ferida}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q32_curativo_ferida', val)}
                        hasError={errorFieldId === 'field-32'}
                      />
                      {formData.q32_curativo_ferida === 'Não' && (
                        <TextJustifyField
                          index="33"
                          value={formData.q33_curativo_ferida_justificativa}
                          onChange={(val) => handleFieldChange('q33_curativo_ferida_justificativa', val)}
                          hasError={errorFieldId === 'field-33'}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 5: DECUBITUS, FALLS, HANDOFFS & SBAR */}
                {currentStep === 5 && (
                  <div className="space-y-5">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest">Segurança Proativa e Passagem de Plantão (Q34 - Q43)</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Última etapa: avalie decúbitos, leitos de contenção e prontidão SBAR.</p>
                    </div>

                    <div className="space-y-4">
                      <ChoiceRow
                        index="34"
                        label="Paciente está no decúbito correto de acordo com o relógio da pele no momento da visita?"
                        value={formData.q34_decubito_correto}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q34_decubito_correto', val)}
                        hasError={errorFieldId === 'field-34'}
                      />
                      {formData.q34_decubito_correto === 'Não' && (
                        <TextJustifyField
                          index="35"
                          value={formData.q35_decubito_correto_justificativa}
                          onChange={(val) => handleFieldChange('q35_decubito_correto_justificativa', val)}
                          hasError={errorFieldId === 'field-35'}
                        />
                      )}

                      <ChoiceRow
                        index="36"
                        label="Paciente recebeu orientação de prevenção de lesão por pressão?"
                        value={formData.q36_orientacao_lesao}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q36_orientacao_lesao', val)}
                        hasError={errorFieldId === 'field-36'}
                      />

                      <ChoiceRow
                        index="37"
                        label="Grades do leito elevadas?"
                        value={formData.q37_grades_elevadas}
                        options={['Sim', 'Não', 'Paciente fora do leito no momento da visita']}
                        onChange={(val) => handleFieldChange('q37_grades_elevadas', val)}
                        hasError={errorFieldId === 'field-37'}
                      />
                      {formData.q37_grades_elevadas === 'Não' && (
                        <TextJustifyField
                          index="38"
                          value={formData.q38_grades_elevadas_justificativa}
                          onChange={(val) => handleFieldChange('q38_grades_elevadas_justificativa', val)}
                          hasError={errorFieldId === 'field-38'}
                        />
                      )}

                      <ChoiceRow
                        index="39"
                        label="O paciente recebeu orientação sobre as medidas de prevenção de queda?"
                        value={formData.q39_orientacao_queda}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q39_orientacao_queda', val)}
                        hasError={errorFieldId === 'field-39'}
                      />

                      <ChoiceRow
                        index="40"
                        label="Passagem de plantão da enfermagem com formulário padrão preenchido?"
                        value={formData.q40_passagem_plantao}
                        options={['Sim', 'Não']}
                        onChange={(val) => handleFieldChange('q40_passagem_plantao', val)}
                        hasError={errorFieldId === 'field-40'}
                      />
                      {formData.q40_passagem_plantao === 'Não' && (
                        <TextJustifyField
                          index="41"
                          value={formData.q41_passagem_plantao_justificativa}
                          onChange={(val) => handleFieldChange('q41_passagem_plantao_justificativa', val)}
                          hasError={errorFieldId === 'field-41'}
                        />
                      )}

                      <ChoiceRow
                        index="42"
                        label="Em caso de transferência (interna/externa) o formulário de transferência/SBAR preenchido adequadamente?"
                        value={formData.q42_SBAR}
                        options={['Sim', 'Não', 'Não se aplica']}
                        onChange={(val) => handleFieldChange('q42_SBAR', val)}
                        hasError={errorFieldId === 'field-42'}
                      />
                      {formData.q42_SBAR === 'Não' && (
                        <TextJustifyField
                          index="43"
                          value={formData.q43_SBAR_justificativa}
                          onChange={(val) => handleFieldChange('q43_SBAR_justificativa', val)}
                          hasError={errorFieldId === 'field-43'}
                        />
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Validation Error Banner */}
          {error && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-800 text-xs font-bold uppercase tracking-wide shadow-sm animate-pulse">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
              {errorFieldId && (
                <button
                  type="button"
                  onClick={() => scrollToField(errorFieldId)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black tracking-wider uppercase transition-colors shrink-0 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span>Ir para a questão</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Footer Navigation Bar */}
          <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <div className="hidden sm:flex items-center gap-1.5 text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              Preenchimento assistido inteligente
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end sm:ml-auto">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
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
                        ? 'bg-red-400 cursor-not-allowed opacity-90'
                        : 'bg-red-600 hover:bg-red-700 active:scale-[0.98]'
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
  hasError?: boolean;
}

function ChoiceRow({ index, label, value, options, onChange, hasError }: ChoiceRowProps) {
  const fieldId = `field-${index}`;
  return (
    <div 
      id={fieldId}
      className={`p-4 rounded-xl border transition-all duration-300 ${
        hasError 
          ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-400/40 shadow-sm' 
          : 'bg-slate-50/50 border-slate-100 space-y-3 hover:border-slate-200 hover:bg-slate-50/70'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex gap-2">
          <span className={`text-[11px] font-black shrink-0 mt-0.5 ${hasError ? 'text-rose-600 font-black' : 'text-rose-500'}`}>{index}.</span>
          <span className={`text-xs font-bold leading-relaxed uppercase tracking-tight ${hasError ? 'text-slate-900 font-black' : 'text-slate-700'}`}>{label} *</span>
        </div>
        {hasError && (
          <span className="shrink-0 px-2 py-0.5 bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider rounded-md animate-pulse">
            Preenchimento Obrigatório
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {options.map((opt) => {
          const isSelected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3.5 py-2 text-[10.5px] font-black uppercase tracking-wider rounded-md border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-red-500 border-red-500 text-white shadow-sm scale-[1.02]'
                  : hasError
                    ? 'bg-white border-rose-300 text-rose-800 hover:bg-rose-100/50 font-bold'
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
  hasError?: boolean;
}

function TextJustifyField({ index, value, onChange, hasError }: TextJustifyFieldProps) {
  const fieldId = `field-${index}`;
  return (
    <motion.div
      id={fieldId}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`pl-4 border-l-2 space-y-1.5 p-2 rounded-r-lg transition-all ${
        hasError ? 'border-rose-500 bg-rose-50/60 ring-1 ring-rose-400' : 'border-red-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <label className={`text-[10px] font-black uppercase tracking-wider ${hasError ? 'text-rose-700' : 'text-red-500'}`}>
          {index}. Se não, justifique *
        </label>
        {hasError && (
          <span className="text-[9px] font-black text-rose-600 uppercase tracking-wider animate-pulse">
            Obrigatório detalhar
          </span>
        )}
      </div>
      <textarea
        placeholder="Descreva detalhadamente a não conformidade para melhoria..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className={`w-full text-xs font-semibold p-2.5 rounded-md outline-none text-slate-800 transition-colors ${
          hasError 
            ? 'bg-white border-2 border-rose-400 focus:border-rose-600' 
            : 'bg-slate-50 border border-slate-200 focus:border-red-400'
        }`}
      />
    </motion.div>
  );
}
