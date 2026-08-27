import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CreateUserFormData } from './types';

interface StepAdditionalProps {
  formData: CreateUserFormData;
  onUpdate: (field: keyof CreateUserFormData, value: string) => void;
}

const StepAdditional: React.FC<StepAdditionalProps> = ({ formData, onUpdate }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Additional Information</h2>
        <p className="text-sm text-muted-foreground">
          Provide additional details about the user's location, contact, and background.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hq">Head Quarters (HQ)</Label>
          <Input
            id="hq"
            value={formData.hq}
            onChange={(e) => onUpdate('hq', e.target.value)}
            placeholder="City name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date_of_joining">Date of Joining</Label>
          <Input
            id="date_of_joining"
            type="date"
            value={formData.date_of_joining}
            onChange={(e) => onUpdate('date_of_joining', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date_of_exit">Date of Exit</Label>
          <Input
            id="date_of_exit"
            type="date"
            value={formData.date_of_exit}
            onChange={(e) => onUpdate('date_of_exit', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="alternate_email">Alternate Email</Label>
          <Input
            id="alternate_email"
            type="email"
            value={formData.alternate_email}
            onChange={(e) => onUpdate('alternate_email', e.target.value)}
            placeholder="alternate@example.com"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            value={formData.address}
            onChange={(e) => onUpdate('address', e.target.value)}
            placeholder="Full address"
            rows={3}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="education">Education Background</Label>
          <Textarea
            id="education"
            value={formData.education}
            onChange={(e) => onUpdate('education', e.target.value)}
            placeholder="Education details"
            rows={3}
          />
        </div>
      </div>
    </div>
  );
};

export default StepAdditional;
