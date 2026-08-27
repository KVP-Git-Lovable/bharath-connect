import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import WizardStepper from './WizardStepper';
import StepBasics from './StepBasics';
import StepEmployment from './StepEmployment';
import StepAdditional from './StepAdditional';
import StepDocuments from './StepDocuments';
import {
  CreateUserFormData,
  FileUpload,
  Manager,
  WizardStep,
  WIZARD_STEPS,
  initialFormData,
} from './types';

interface Role {
  id: string;
  name: string;
}

interface CreateUserWizardProps {
  onSuccess?: () => void;
}

const CreateUserWizard: React.FC<CreateUserWizardProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<WizardStep>('basics');
  const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [formData, setFormData] = useState<CreateUserFormData>(initialFormData);

  useEffect(() => {
    const fetchData = async () => {
      const [usersRes, rolesRes] = await Promise.all([
        supabase.from('users').select('id, username, full_name').eq('is_active', true).order('full_name'),
        supabase.from('security_profiles').select('id, name').order('name'),
      ]);
      if (!usersRes.error && usersRes.data) setManagers(usersRes.data);
      if (!rolesRes.error && rolesRes.data) setRoles(rolesRes.data);
    };
    fetchData();
  }, []);

  const handleUpdateField = (field: keyof CreateUserFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (type: 'address_proof' | 'id_proof') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFiles(prev => prev.filter(f => f.type !== type));
    const newFile: FileUpload = { file, type };
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        newFile.preview = ev.target?.result as string;
        setFiles(prev => [...prev, newFile]);
      };
      reader.readAsDataURL(file);
    } else {
      setFiles(prev => [...prev, newFile]);
    }
  };

  const removeFile = (type: string) => {
    setFiles(prev => prev.filter(f => f.type !== type));
  };

  const validateStep = (step: WizardStep): boolean => {
    switch (step) {
      case 'basics':
        if (!formData.email || !formData.password || !formData.username || !formData.full_name) {
          toast.error("Please fill in all required fields (Email, Password, Username, Full Name)");
          return false;
        }
        return true;
      case 'employment':
        if (!formData.role_id) {
          toast.error("Please select a role");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const goToNextStep = () => {
    if (!validateStep(currentStep)) return;
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);
    if (currentIndex < WIZARD_STEPS.length - 1) {
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps(prev => [...prev, currentStep]);
      }
      setCurrentStep(WIZARD_STEPS[currentIndex + 1].id);
    }
  };

  const goToPreviousStep = () => {
    const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);
    if (currentIndex > 0) setCurrentStep(WIZARD_STEPS[currentIndex - 1].id);
  };

  // Map role id → old enum for edge function compat
  const roleEnumMap: Record<string, string> = {};
  roles.forEach((r) => {
    if (r.name === "Admin") roleEnumMap[r.id] = "admin";
    else if (r.name === "Field User") roleEnumMap[r.id] = "user";
    else if (r.name === "Sales Manager") roleEnumMap[r.id] = "sales_manager";
    else if (r.name === "Data Viewer") roleEnumMap[r.id] = "data_viewer";
  });

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    setLoading(true);

    try {
      const res = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          username: formData.username || formData.email,
          phone: formData.phone_number || undefined,
          role: formData.role_id ? roleEnumMap[formData.role_id] || 'user' : 'user',
          hq: formData.hq || null,
          salary: formData.monthly_salary || '0',
          da: formData.daily_da_allowance || '0',
          date_of_joining: formData.date_of_joining || null,
          is_temporary_password: formData.requirePasswordChange,
        },
      });

      if (res.error) throw new Error(res.error.message || 'Failed to create user');
      const result = res.data;
      if (result?.error) throw new Error(result.error);

      const userId = result?.user_id || result?.user?.id;
      if (!userId) throw new Error('User creation succeeded but no user ID returned');

      // Update users table with extra fields
      const updatePayload: Record<string, unknown> = {};
      if (formData.phone_number) updatePayload.phone = formData.phone_number;
      if (formData.manager_id) updatePayload.reporting_manager_id = formData.manager_id;
      if (Object.keys(updatePayload).length > 0) {
        await supabase.from('users').update(updatePayload).eq('id', userId);
      }

      // Update employees table
      const empPayload: Record<string, unknown> = { user_id: userId };
      if (formData.manager_id) empPayload.manager_id = formData.manager_id;
      if (formData.secondary_manager_id) empPayload.secondary_manager_id = formData.secondary_manager_id;
      if (formData.hq) empPayload.hq = formData.hq;
      if (formData.monthly_salary) empPayload.monthly_salary = parseFloat(formData.monthly_salary) || 0;
      if (formData.daily_da_allowance) empPayload.daily_da_allowance = parseFloat(formData.daily_da_allowance) || 0;
      if (formData.band) empPayload.band = formData.band;
      if (formData.date_of_joining) empPayload.date_of_joining = formData.date_of_joining;
      if (formData.date_of_exit) empPayload.date_of_exit = formData.date_of_exit;
      if (formData.emergency_contact_number) empPayload.emergency_contact_number = formData.emergency_contact_number;
      if (formData.alternate_email) empPayload.alternate_email = formData.alternate_email;
      if (formData.address) empPayload.address = formData.address;
      if (formData.education) empPayload.education = formData.education;

      await supabase.from('employees').upsert(empPayload as any, { onConflict: 'user_id' });

      // Assign security profile
      if (formData.role_id) {
        await supabase.from('user_security_profiles').upsert(
          { user_id: userId, profile_id: formData.role_id },
          { onConflict: 'user_id' }
        );
      }

      // Upload document files
      const currentUser = (await supabase.auth.getUser()).data.user;
      for (const docFile of files) {
        const fileExt = docFile.file.name.split('.').pop();
        const filePath = `${userId}/${docFile.type}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('employee-docs').upload(filePath, docFile.file);
        if (uploadError) {
          console.error('Doc upload error:', uploadError);
          continue;
        }
        await supabase.from('employee_documents').insert({
          user_id: userId,
          doc_type: docFile.type as any,
          file_path: filePath,
          file_name: docFile.file.name,
          content_type: docFile.file.type,
          uploaded_by: currentUser?.id || null,
        });
      }

      toast.success('User created successfully!');
      onSuccess?.();
      setFormData(initialFormData);
      setFiles([]);
      setCurrentStep('basics');
      setCompletedSteps([]);
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === WIZARD_STEPS.length - 1;

  const renderStepContent = () => {
    switch (currentStep) {
      case 'basics':
        return <StepBasics formData={formData} onUpdate={handleUpdateField} />;
      case 'employment':
        return <StepEmployment formData={formData} onUpdate={handleUpdateField} managers={managers} roles={roles} />;
      case 'additional':
        return <StepAdditional formData={formData} onUpdate={handleUpdateField} />;
      case 'documents':
        return <StepDocuments files={files} onFileUpload={handleFileUpload} onRemoveFile={removeFile} />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Add a user
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row min-h-[500px]">
          {/* Left Sidebar - Steps */}
          <div className="p-6 bg-muted/30 hidden md:block">
            <WizardStepper currentStep={currentStep} completedSteps={completedSteps} />
          </div>

          {/* Mobile Step Indicator */}
          <div className="md:hidden p-4 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Step {currentIndex + 1} of {WIZARD_STEPS.length}
              </span>
              <span className="text-sm text-muted-foreground">
                {WIZARD_STEPS[currentIndex].label}
              </span>
            </div>
            <div className="flex gap-1 mt-2">
              {WIZARD_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i <= currentIndex ? 'bg-primary' : 'bg-border'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 p-6 flex flex-col">
            <div className="flex-1">{renderStepContent()}</div>

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-6 border-t mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={goToPreviousStep}
                disabled={isFirstStep || loading}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>

              {isLastStep ? (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating User...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create User
                    </>
                  )}
                </Button>
              ) : (
                <Button onClick={goToNextStep} disabled={loading}>
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CreateUserWizard;
