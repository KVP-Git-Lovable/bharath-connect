import React from 'react';
import { Check } from 'lucide-react';
import { WizardStep, WIZARD_STEPS } from './types';
import { cn } from '@/lib/utils';

interface WizardStepperProps {
  currentStep: WizardStep;
  completedSteps: WizardStep[];
}

const WizardStepper: React.FC<WizardStepperProps> = ({ currentStep, completedSteps }) => {
  const currentIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="flex flex-col space-y-1 w-48 pr-6 border-r border-border">
      {WIZARD_STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;
        const isPast = index < currentIndex;

        return (
          <div key={step.id} className="flex items-start gap-3 py-2">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                  isCurrent && "bg-primary text-primary-foreground",
                  isCompleted && "bg-primary text-primary-foreground",
                  !isCurrent && !isCompleted && "bg-muted text-muted-foreground border border-border"
                )}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-current" />
                )}
              </div>
              {index < WIZARD_STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-0.5 h-8 mt-1 transition-colors",
                    isPast || isCompleted ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "text-sm pt-0.5 transition-colors",
                isCurrent && "text-foreground font-medium",
                !isCurrent && "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default WizardStepper;
