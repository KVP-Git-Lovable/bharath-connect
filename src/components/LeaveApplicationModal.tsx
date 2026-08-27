import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LeaveType {
  id: string;
  name: string;
  description?: string;
}

interface LeaveApplicationModalProps {
  trigger?: React.ReactNode;
  onApplicationSubmitted?: () => void;
  defaultLeaveTypeId?: string;
}

const LeaveApplicationModal: React.FC<LeaveApplicationModalProps> = ({
  trigger,
  onApplicationSubmitted,
  defaultLeaveTypeId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveTypeId, setLeaveTypeId] = useState(defaultLeaveTypeId || '');
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [reason, setReason] = useState('');
  const [leaveDay, setLeaveDay] = useState<'full' | 'half'>('full');
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  useEffect(() => {
    if (defaultLeaveTypeId) setLeaveTypeId(defaultLeaveTypeId);
  }, [defaultLeaveTypeId]);

  useEffect(() => {
    if (isOpen) fetchLeaveTypes();
  }, [isOpen]);

  const fetchLeaveTypes = async () => {
    const { data, error } = await supabase.from('leave_types').select('*').order('name');
    if (!error) setLeaveTypes(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !leaveTypeId || !startDate || !endDate || !reason.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (endDate < startDate) {
      toast.error('End date cannot be before start date');
      return;
    }

    setIsSubmitting(true);
    try {
      const totalDays = leaveDay === 'half'
        ? (Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1) * 0.5
        : Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;

      const { data: insertedApp, error } = await supabase.from('leave_applications').insert({
        user_id: user.id,
        leave_type_id: leaveTypeId,
        from_date: format(startDate, 'yyyy-MM-dd'),
        to_date: format(endDate, 'yyyy-MM-dd'),
        total_days: totalDays,
        reason: reason.trim(),
        is_half_day: leaveDay === 'half',
        status: 'pending'
      }).select('id').single();

      if (error) throw error;

      // Notify manager + all admins
      try {
        const { notifyManagersAndAdmins } = await import('@/utils/notificationHelpers');
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (insertedApp) {
          const selectedType = leaveTypes.find(t => t.id === leaveTypeId);
          await notifyManagersAndAdmins(user.id, {
            title: `Leave Application - ${userData?.full_name || 'Employee'}`,
            message: `${selectedType?.name || 'Leave'} from ${format(startDate, 'MMM dd, yyyy')} to ${format(endDate, 'MMM dd, yyyy')}`,
            type: 'leave_request',
            related_table: 'leave_applications',
            related_id: insertedApp.id,
          });
        }
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
      }

      toast.success('Leave application submitted successfully');
      setLeaveTypeId('');
      setStartDate(undefined);
      setEndDate(undefined);
      setReason('');
      setLeaveDay('full');
      setIsOpen(false);
      onApplicationSubmitted?.();
    } catch (error: any) {
      toast.error('Failed to submit leave application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateLeaveDays = () => {
    if (startDate && endDate) {
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
      return leaveDay === 'half' ? days * 0.5 : days;
    }
    return 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Apply Leave
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply for Leave</DialogTitle>
          <DialogDescription>Submit a new leave application for approval</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Leave Type *</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
              <SelectContent>
                {leaveTypes.map(type => (
                  <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Leave Duration *</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="full" checked={leaveDay === 'full'} onChange={() => setLeaveDay('full')} className="w-4 h-4" />
                <span>Full Day</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" value="half" checked={leaveDay === 'half'} onChange={() => setLeaveDay('half')} className="w-4 h-4" />
                <span>Half Day</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Popover open={startPickerOpen} onOpenChange={setStartPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(date) => { setStartDate(date); setStartPickerOpen(false); }} disabled={(date) => { const today = new Date(); today.setHours(0,0,0,0); return date < today; }} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End Date *</Label>
              <Popover open={endPickerOpen} onOpenChange={setEndPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(date) => { setEndDate(date); setEndPickerOpen(false); }} disabled={(date) => { const minDate = startDate || new Date(); const compare = new Date(minDate); compare.setHours(0,0,0,0); return date < compare; }} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {startDate && endDate && (
            <div className="bg-[hsl(var(--info))/0.1] p-3 rounded-md">
              <p className="text-sm">Total Leave Days: <span className="font-semibold">{calculateLeaveDays()}</span></p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea placeholder="Please provide a reason for your leave..." value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[100px]" />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit Application'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LeaveApplicationModal;
