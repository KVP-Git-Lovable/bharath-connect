import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Key, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CreateUserFormData } from './types';

interface StepBasicsProps {
  formData: CreateUserFormData;
  onUpdate: (field: keyof CreateUserFormData, value: string | boolean) => void;
}

const StepBasics: React.FC<StepBasicsProps> = ({ formData, onUpdate }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const generateTemporaryPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const specialChars = '!@#$%&*';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    password += specialChars.charAt(Math.floor(Math.random() * specialChars.length));
    for (let i = 0; i < 3; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    onUpdate('password', password);
    setShowPassword(true);
    onUpdate('requirePasswordChange', true);
  };

  const copyPasswordToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(formData.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
      toast.success("Password copied to clipboard");
    } catch {
      toast.error("Failed to copy password");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Set up the basics</h2>
        <p className="text-sm text-muted-foreground">
          To get started, fill out some basic information about who you're adding as a user.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => onUpdate('email', e.target.value)}
            placeholder="user@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password *</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => onUpdate('password', e.target.value)}
                className="pr-20"
                required
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                {formData.password && (
                  <button
                    type="button"
                    onClick={copyPasswordToClipboard}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    title="Copy password"
                  >
                    {copiedPassword ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={generateTemporaryPassword}
              title="Generate temporary password"
            >
              <Key className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center space-x-2 mt-2">
            <Checkbox
              id="requirePasswordChange"
              checked={formData.requirePasswordChange}
              onCheckedChange={(checked) => onUpdate('requirePasswordChange', checked === true)}
            />
            <label htmlFor="requirePasswordChange" className="text-sm text-muted-foreground cursor-pointer">
              Require password change on first login
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username *</Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => onUpdate('username', e.target.value)}
            placeholder="username"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name *</Label>
          <Input
            id="full_name"
            value={formData.full_name}
            onChange={(e) => onUpdate('full_name', e.target.value)}
            placeholder="John Doe"
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="phone_number">Phone Number</Label>
          <Input
            id="phone_number"
            value={formData.phone_number}
            onChange={(e) => onUpdate('phone_number', e.target.value)}
            placeholder="+91 9876543210"
          />
        </div>
      </div>
    </div>
  );
};

export default StepBasics;
