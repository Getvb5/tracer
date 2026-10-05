export interface HealthUnit {
  id: string;
  name: string;
  type: 'Hospital' | 'UPA' | 'Policlínica';
  district: string;
}

export interface HandHygieneAudit {
  id?: string;
  unitId: string;
  auditorId: string;
  professionalCategory: 'Médico' | 'Enfermeiro' | 'Técnico' | 'Outro';
  moment: 'Antes do contato' | 'Antes do procedimento' | 'Após risco de fluídos' | 'Após contato com paciente' | 'Após contato com entorno';
  compliant: boolean;
  timestamp: any;
}

export interface PatientIdAudit {
  id?: string;
  unitId: string;
  auditorId: string;
  hasWristband: boolean;
  wristbandLegible: boolean;
  correctData: boolean;
  timestamp: any;
}

export interface SafeSurgeryAudit {
  id?: string;
  unitId: string;
  auditorId: string;
  signIIn: boolean;
  timeOut: boolean;
  signOut: boolean;
  timestamp: any;
}


