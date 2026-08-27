export interface Manager {
  id: string;
  username: string | null;
  full_name: string | null;
}

export interface FileUpload {
  file: File;
  type: 'address_proof' | 'id_proof' | 'photo';
  preview?: string;
}

export interface CreateUserFormData {
  // Step 1: Basics
  email: string;
  password: string;
  username: string;
  full_name: string;
  phone_number: string;
  requirePasswordChange: boolean;

  // Step 2: Employment
  role_id: string;
  emergency_contact_number: string;
  monthly_salary: string;
  daily_da_allowance: string;
  manager_id: string;
  secondary_manager_id: string;
  band: string;

  // Step 3: Additional Info
  hq: string;
  date_of_joining: string;
  date_of_exit: string;
  alternate_email: string;
  address: string;
  education: string;
}

export const initialFormData: CreateUserFormData = {
  email: '',
  password: '',
  username: '',
  full_name: '',
  phone_number: '',
  requirePasswordChange: false,
  role_id: '',
  emergency_contact_number: '',
  monthly_salary: '',
  daily_da_allowance: '',
  manager_id: '',
  secondary_manager_id: '',
  band: '',
  hq: '',
  date_of_joining: '',
  date_of_exit: '',
  alternate_email: '',
  address: '',
  education: '',
};

export type WizardStep = 'basics' | 'employment' | 'additional' | 'documents';

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'employment', label: 'Employment' },
  { id: 'additional', label: 'Additional Info' },
  { id: 'documents', label: 'Documents' },
];
