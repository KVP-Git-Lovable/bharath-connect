import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateUserFormData, Manager } from './types';

interface Role {
  id: string;
  name: string;
}

interface StepEmploymentProps {
  formData: CreateUserFormData;
  onUpdate: (field: keyof CreateUserFormData, value: string) => void;
  managers: Manager[];
  roles: Role[];
}

const StepEmployment: React.FC<StepEmploymentProps> = ({ formData, onUpdate, managers, roles }) => {
  const [managerSearch, setManagerSearch] = useState('');
  const [managerOpen, setManagerOpen] = useState(false);
  const [secondaryManagerSearch, setSecondaryManagerSearch] = useState('');
  const [secondaryManagerOpen, setSecondaryManagerOpen] = useState(false);

  const filteredManagers = useMemo(() =>
    managers.filter(m =>
      `${m.full_name || ''} ${m.username || ''}`.toLowerCase().includes(managerSearch.toLowerCase())
    ), [managers, managerSearch]);

  const filteredSecondaryManagers = useMemo(() =>
    managers.filter(m =>
      `${m.full_name || ''} ${m.username || ''}`.toLowerCase().includes(secondaryManagerSearch.toLowerCase())
    ), [managers, secondaryManagerSearch]);

  const selectedManager = managers.find(m => m.id === formData.manager_id);
  const selectedSecondaryManager = managers.find(m => m.id === formData.secondary_manager_id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Employment Details</h2>
        <p className="text-sm text-muted-foreground">
          Configure the user's role, salary, and reporting structure.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="role_id">Role *</Label>
          <Select value={formData.role_id} onValueChange={(v) => onUpdate('role_id', v)}>
            <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="emergency_contact_number">Emergency Contact</Label>
          <Input
            id="emergency_contact_number"
            value={formData.emergency_contact_number}
            onChange={(e) => onUpdate('emergency_contact_number', e.target.value)}
            placeholder="+91 9876543210"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="monthly_salary">Monthly Salary (₹)</Label>
          <Input
            id="monthly_salary"
            type="number"
            value={formData.monthly_salary}
            onChange={(e) => onUpdate('monthly_salary', e.target.value)}
            placeholder="50000"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="daily_da_allowance">Daily DA Allowance (₹)</Label>
          <Input
            id="daily_da_allowance"
            type="number"
            value={formData.daily_da_allowance}
            onChange={(e) => onUpdate('daily_da_allowance', e.target.value)}
            placeholder="500"
          />
        </div>

        <div className="space-y-2">
          <Label>Primary Manager (Reports To)</Label>
          <Popover open={managerOpen} onOpenChange={setManagerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={managerOpen} className="w-full justify-between font-normal">
                {selectedManager ? `${selectedManager.full_name || ''} (${selectedManager.username || ''})` : "Select primary manager"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <div className="flex items-center border-b px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Search manager..."
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto p-1">
                {filteredManagers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No manager found.</p>
                ) : (
                  filteredManagers.map((manager) => (
                    <div
                      key={manager.id}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        formData.manager_id === manager.id && "bg-accent"
                      )}
                      onClick={() => {
                        onUpdate('manager_id', manager.id);
                        setManagerOpen(false);
                        setManagerSearch('');
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", formData.manager_id === manager.id ? "opacity-100" : "opacity-0")} />
                      {manager.full_name || ''} ({manager.username || ''})
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Secondary Manager</Label>
          <Popover open={secondaryManagerOpen} onOpenChange={setSecondaryManagerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={secondaryManagerOpen} className="w-full justify-between font-normal">
                {selectedSecondaryManager ? `${selectedSecondaryManager.full_name || ''} (${selectedSecondaryManager.username || ''})` : "Select secondary manager"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <div className="flex items-center border-b px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Search manager..."
                  value={secondaryManagerSearch}
                  onChange={(e) => setSecondaryManagerSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto p-1">
                {filteredSecondaryManagers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No manager found.</p>
                ) : (
                  filteredSecondaryManagers.map((manager) => (
                    <div
                      key={manager.id}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        formData.secondary_manager_id === manager.id && "bg-accent"
                      )}
                      onClick={() => {
                        onUpdate('secondary_manager_id', manager.id);
                        setSecondaryManagerOpen(false);
                        setSecondaryManagerSearch('');
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", formData.secondary_manager_id === manager.id ? "opacity-100" : "opacity-0")} />
                      {manager.full_name || ''} ({manager.username || ''})
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="band">Band</Label>
          <Select value={formData.band} onValueChange={(v) => onUpdate('band', v)}>
            <SelectTrigger><SelectValue placeholder="Select band" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="5">5</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default StepEmployment;
