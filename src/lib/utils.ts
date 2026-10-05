import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const HEALTH_UNITS = [
  { id: 'hosp_helena_moura', name: 'Hospital de Pediatria Helena Moura', type: 'Hospital', district: 'Recife', aliases: ['Helena Moura', 'HPHM'] },
  { id: 'hosp_maria_cravo', name: 'Hospital de Pediatria Maria Cravo Gama', type: 'Hospital', district: 'Recife', aliases: ['Maria Cravo', 'HPMCG'] },
  { id: 'policlinica_barros_lima', name: 'Policlínica e Maternidade Prof. Barros Lima', type: 'Hospital', district: 'Recife', aliases: ['Barros Lima', 'PMBL'] },
  { id: 'policlinica_arnaldo_marques', name: 'Policlínica e Maternidade Arnaldo Marques', type: 'Hospital', district: 'Recife', aliases: ['Arnaldo Marques', 'PMAM'] },
  { id: 'maternidade_bandeira_filho', name: 'Maternidade Bandeira Filho', type: 'Hospital', district: 'Recife', aliases: ['Bandeira Filho', 'MBF'] },
  { id: 'policlinica_amaury_coutinho', name: 'Policlínica Amaury Coutinho', type: 'Hospital', district: 'Recife', aliases: ['Amaury Coutinho', 'PAC'] },
  { id: 'policlinica_agamenon_magalhaes', name: 'Policlínica Agamenon Magalhães', type: 'Hospital', district: 'Recife', aliases: ['Agamenon Magalhães', 'PAM'] },
];

export const TRACER_01_UNITS = [
  'hosp_helena_moura',
  'hosp_maria_cravo',
  'policlinica_barros_lima',
  'policlinica_arnaldo_marques',
  'maternidade_bandeira_filho',
  'policlinica_amaury_coutinho',
  'policlinica_agamenon_magalhaes'
];

export const TRACER_02_UNITS = [
  'policlinica_barros_lima',
  'policlinica_arnaldo_marques',
  'maternidade_bandeira_filho'
];

export const TRACER_03_UNITS = [
  'hosp_helena_moura',
  'hosp_maria_cravo',
  'policlinica_barros_lima',
  'policlinica_arnaldo_marques',
  'maternidade_bandeira_filho',
  'policlinica_amaury_coutinho',
  'policlinica_agamenon_magalhaes'
];

export const ADMIN_EMAILS = [
  'Getvb98@gmail.com',
  'getvb98@gmail.com',
  'gestao.tracer@gmail.com',
];

export interface AuthorizedAuditorEntry {
  unitId: string;
  unitName: string;
  emails: string[];
}

export const AUTHORIZED_AUDITORS_BY_UNIT: AuthorizedAuditorEntry[] = [
  {
    unitId: 'hosp_helena_moura',
    unitName: 'Hospital de Pediatria Helena Moura',
    emails: [
      'nsp.ggai@gmail.com',
      'nsp.helenamoura@gmail.com'
    ]
  },
  {
    unitId: 'hosp_maria_cravo',
    unitName: 'Hospital de Pediatria Maria Cravo Gama',
    emails: [
      'nsp.ggai@gmail.com',
      'naragomes174@gmail.com',
      'nspcravogama@gmail.com'
    ]
  },
  {
    unitId: 'policlinica_barros_lima',
    unitName: 'Policlínica e Maternidade Prof. Barros Lima',
    emails: [
      'nsp.ggai@gmail.com',
      'ccihnepi@gmail.com',
      'farmaciabarroslima@gmail.com',
      'nspbarroslima@gmail.com'
    ]
  },
  {
    unitId: 'policlinica_arnaldo_marques',
    unitName: 'Policlínica e Maternidade Arnaldo Marques',
    emails: [
      'nsp.ggai@gmail.com',
      'nsparnaldomarques@gmail.com'
    ]
  },
  {
    unitId: 'maternidade_bandeira_filho',
    unitName: 'Maternidade Bandeira Filho',
    emails: [
      'nsp.ggai@gmail.com',
      'nspbandeirafilho@gmail.com'
    ]
  },
  {
    unitId: 'policlinica_amaury_coutinho',
    unitName: 'Policlínica Amaury Coutinho',
    emails: [
      'nsp.ggai@gmail.com',
      'alexcorreiajr@hotmail.com',
      'nsp.amaurycoutinho@gmail.com'
    ]
  },
  {
    unitId: 'policlinica_agamenon_magalhaes',
    unitName: 'Policlínica Agamenon Magalhães',
    emails: [
      'nsp.ggai@gmail.com',
      'nsppam@gmail.com'
    ]
  }
];

// Flat list of authorized auditor emails (lowercased)
export const AUTHORIZED_AUDITOR_EMAILS: string[] = Array.from(
  new Set(
    AUTHORIZED_AUDITORS_BY_UNIT.flatMap(u => u.emails.map(e => e.trim().toLowerCase()))
  )
);

// Auditors that have multi-unit access (all units)
export const MULTI_UNIT_AUDITOR_EMAILS: string[] = [
  'nsp.ggai@gmail.com'
];

export const USER_UNIT_MAPPING: Record<string, string> = {
  // Hospital de Pediatria Helena Moura
  'nsp.helenamoura@gmail.com': 'hosp_helena_moura',
  'helenamoura@saude.recife.pe.gov.br': 'hosp_helena_moura',

  // Hospital de Pediatria Maria Cravo Gama
  'naragomes174@gmail.com': 'hosp_maria_cravo',
  'nspcravogama@gmail.com': 'hosp_maria_cravo',
  'mariacravo@saude.recife.pe.gov.br': 'hosp_maria_cravo',

  // Policlínica e Maternidade Prof. Barros Lima
  'ccihnepi@gmail.com': 'policlinica_barros_lima',
  'farmaciabarroslima@gmail.com': 'policlinica_barros_lima',
  'nspbarroslima@gmail.com': 'policlinica_barros_lima',
  'barroslima@saude.recife.pe.gov.br': 'policlinica_barros_lima',

  // Policlínica e Maternidade Arnaldo Marques
  'nsparnaldomarques@gmail.com': 'policlinica_arnaldo_marques',
  'arnaldomarques@saude.recife.pe.gov.br': 'policlinica_arnaldo_marques',

  // Maternidade Bandeira Filho
  'nspbandeirafilho@gmail.com': 'maternidade_bandeira_filho',
  'bandeirafilho@saude.recife.pe.gov.br': 'maternidade_bandeira_filho',

  // Policlínica Amaury Coutinho
  'alexcorreiajr@hotmail.com': 'policlinica_amaury_coutinho',
  'nsp.amaurycoutinho@gmail.com': 'policlinica_amaury_coutinho',
  'amaurycoutinho@saude.recife.pe.gov.br': 'policlinica_amaury_coutinho',

  // Policlínica Agamenon Magalhães
  'nsppam@gmail.com': 'policlinica_agamenon_magalhaes',
  'agamenonmagalhaes@saude.recife.pe.gov.br': 'policlinica_agamenon_magalhaes',

  // GGAI / NSP Geral (Padrão Helena Moura, mas pode alternar todas as unidades)
  'nsp.ggai@gmail.com': 'hosp_helena_moura'
};

export const TRACER_FIELD_ORDER = [
  '01- Carimbo de data/hora',
  '02- Nome do Hospital/Maternidade:',
  '03- Data do Tracer:',
  '04- Horário do Início do Tracer:',
  '05- Setor Auditado:',
  '06- Nome Completo do Auditor:',
  '07- Nome Completo do Paciente:',
  '07- Nome do paciente:',
  '08- Nº do Prontuário do Paciente:',
  '09- Paciente identificado com pulseira branca?',
  '10- Se não, justifique:',
  '11- A pulseira de identificação está legível?',
  '12- Se não, justifique:',
  '13- A pulseira de identificação preenchida adequadamente?',
  '14- Se não, justifique:',
  '15- O paciente tem alergia alimentar/medicamentosa?',
  '16- Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?',
  '17- Se não, justifique:',
  '18- Foram fornecidas orientações ao paciente sobre o medicamento administrado e possíveis efeitos?',
  '19- Houve higienização das mãos imediatamente antes da administração da medicação?',
  '20- Se não, justifique:',
  '21- Acesso venoso foi identificado adequadamente (Nº do jelco/Data da punção/Nome do profissional)?',
  '22- Se não, justifique:',
  '23- No momento da administração da medicação foi conferida a identificação do paciente com a pulseira?',
  '24- Se não, justifique:',
  '25- Houve conferência do medicamento administrado com a prescrição?',
  '26- Realizada dupla checagem no momento de administração da MAV?',
  '27- Se não, justifique:',
  '28- O rótulo de medicação está com todos os identificadores obrigatórios?',
  '29- Se não, justifique:',
  '30- Prescrição com assinatura do médico?',
  '31- Se não, justifique:',
  '32- Prescrição com assinatura do Enfermeiro que fez abertura dos horários de medicação?',
  '33- Se não, justifique:',
  '34- A hora da administração da medicação é a mesma da prescrição?',
  '35- Se não, justifique:',
  '36- A prescrição está SEM USO DE ABREVIATURAS?',
  '37- Existe estratégia para diferenciar nomes semelhantes de medicação? (ex: DOPAmina e DOBUTAmina)',
  '38- Se não, justifique:',
  '39- Há registros das alergias medicamentosas na prescrição?',
  '40- Se não, justifique:',
  '41- A duração do tratamento está especificada?',
  '42- Medicações de uso SE NECESSÁRIO contém informações de segurança (dose, posologia, indicação de situações em que podem ser usadas)?',
  '43- Se não, justifique:',
  '44- O diluente da medicação está prescrito?',
  '45- A velocidade de infusão está prescrita?',
  '46- Se não, justifique:',
  '47- A via de administração está prescrita?',
  '48- Se não, justifique:',
  '49- Alguma medicação não administrada conforme prescrição?',
  '50- Se não, justifique:',
  '51- A dose administrada foi checada de forma legível após a administração da medicação?',
  '52- Se não, justifique:',
  '53- Medicamentos de alta vigilância e controlados estão armazenados em armários com acesso restrito?',
  '54- Se não, justifique:',
  '55- Lista de medicações de alta vigilância (MAV) disponível no setor?',
  '56- Se não, justifique:',
  '57- Temperatura de refrigeração das medicações entre 2 e 8ºC no termohigrômetro?',
  '58- Se não, justifique:',
  '59- Lista de medicações refrigeradas disponível no setor?',
  '60- Se não, justifique:',
  '61- Medicação trazida de casa registrada na prescrição do paciente?',
  '62- Se não, justifique:',
  '63- Alguma amostra grátis detectada no setor?',
  '64- Se sim, justifique:',

  // TRACER 02 fields
  'Nome do Hospital/Maternidade',
  'Data do Tracer:',
  'Horário do Início do Tracer:',
  'Nome Completo do Auditor: ',
  'Nome Completo do Paciente:',
  'Nº do Prontuário do Paciente:',
  'Tipo de procedimento:',
  'Paciente identificado com pulseira branca?',
  'Se não, justifique:',
  'A pulseira de identificação está legível?',
  'Se não, justifique:_1',
  'A pulseira de identificação preenchida adequadamente?',
  'Se não, justifique:_2',
  'O paciente tem alergia alimentar/medicamentosa? ',
  'Se tem alergia, está sinalizado com pulseira específica (Cor Rosa)?',
  'Se não, justifique:_3',
  'Paciente tem termo de consentimento cirúrgico assinado e no prontuário ?',
  'Se não, justifique:_4',
  'Paciente tem termo de consentimento anestésico assinado e no prontuário?',
  'Se não, justifique:_5',
  'A visita pré anestésica foi realizada e registrada?',
  'Se não, justifique:_6',
  'A equipe confirma a identificação do paciente antes de procedimentos ou\ncuidados (medicação, dieta, exames, transferência)?',
  'Formulário de transição de cuidados (SBAR) em transferência interna/externa preenchido?',
  'Se não, justifique:_7',
  'Paciente foi informado sobre tipo de cirurgia, riscos e benefícios ?',
  'Se não, justifique:_8',
  'Paciente teve suas próteses, órteses e adornos retirado?',
  'Se não, justifique:_9',
  'Paciente fez banho com clorexidina degermante em até 6 horas antes da cirurgia?',
  'Se não, justifique:_10',
  'A 1º degermação cirúrgica da equipe ocorreu entre 2-5 minutos?',
  'Equipe cirúrgica encontrava-se completa na sala de cirurgia?',
  'Se não, justifique:_11',
  'A equipe estava sem adorno?',
  'Se não, justifique:_12',
  'A equipe estava paramentada adequadamente?  ',
  'Check list de cirurgia segura aplicado antes da indução anestésica?',
  'Se não, justifique:_13',
  'Realizada contagem e conferência do quantitativo de instrumentais antes da incisão cirúrgica?',
  'Se não, justifique:_14',
  'O antibiótico profilático foi administrado 60 minutos antes da incisão\ncirúrgica?',
  'Se não, justifique:_15',
  'Houve conferência do número de compressas usadas antes da incisão cirúrgica?   ?',
  'Check list de cirurgia segura aplicado antes da incisão cirúrgica?',
  'Se não, justifique:_16',
  'O material biológico foi identificado adequadamente após cirurgia ?',
  'Se não, justifique:_17',
  ' Houve conferência do número de compressas utilizadas antes do fechamento da cavidade?  ',
  'Se não, justifique:_18',
  'Houve conferência do número de instrumentais utilizadas antes do fechamento da cavidade?  ',
  'Se não, justifique:_19',
  'Paciente com escala de MORSE realizada nas primeiras 24 horas de admissão ?',
  'Se não, justifique:_20',
  'Paciente com escala de dor realizada após a cirurgia ?',
  'Se não, justifique:_21',
  'Sinais Vitais registrados de forma adequada no pós-operatório?',
  'Se não, justifique:_22',
  'Check list de cirurgia segura aplicado antes de sair da sala?',
  'Se não, justifique:_23',
  'Equipamentos funcionantes e calibrados?',
  'Se não, justifique:_24',
  'O(A) RN foi identificado(a) em sala?',
  'Se não, justifique:_25',
  'Foi administrada a vitamina K no(a) RN?',
  'Se não, justifique:_26',
  'A paciente (mãe) foi encaminhada para a SR?',
  'Se não, justifique:_27',
];

export function safeJsonParse<T = any>(str: any, fallback: T): T {
  if (!str || typeof str !== 'string') return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
