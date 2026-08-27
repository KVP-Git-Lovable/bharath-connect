import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Holiday {
  id: string;
  date: string;
  holiday_name: string;
  description?: string | null;
  year: number;
}

interface HolidayManagementProps {
  readOnly?: boolean;
}

const HolidayManagement = ({ readOnly = false }: HolidayManagementProps) => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [editDate, setEditDate] = useState<Date | undefined>(new Date());
  const [formData, setFormData] = useState({ holiday_name: '', description: '' });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => { fetchHolidays(); }, []);

  const fetchHolidays = async () => {
    const { data, error } = await supabase.from('holidays').select('*').eq('year', currentYear).order('date', { ascending: true });
    if (!error) setHolidays(data || []);
    setLoading(false);
  };

  const createHoliday = async () => {
    if (!selectedDate || !formData.holiday_name.trim()) { toast.error('Please fill in all required fields'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('holidays').insert({
      date: format(selectedDate, 'yyyy-MM-dd'), holiday_name: formData.holiday_name.trim(),
      description: formData.description.trim() || null, year: selectedDate.getFullYear(), created_by: user?.id
    });
    if (error) { toast.error(error.code === '23505' ? 'A holiday already exists for this date' : 'Failed to create holiday'); return; }
    toast.success('Holiday created successfully');
    setIsCreateOpen(false);
    resetForm();
    fetchHolidays();
  };

  const updateHoliday = async () => {
    if (!selectedHoliday || !editDate || !formData.holiday_name.trim()) { toast.error('Please fill in all required fields'); return; }
    const { error } = await supabase.from('holidays').update({
      date: format(editDate, 'yyyy-MM-dd'), holiday_name: formData.holiday_name.trim(),
      description: formData.description.trim() || null, year: editDate.getFullYear(),
    }).eq('id', selectedHoliday.id);
    if (error) { toast.error('Failed to update holiday'); return; }
    toast.success('Holiday updated successfully');
    setIsEditOpen(false);
    setSelectedHoliday(null);
    resetForm();
    fetchHolidays();
  };

  const deleteHoliday = async (id: string) => {
    if (!confirm('Are you sure you want to delete this holiday?')) return;
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) { toast.error('Failed to delete holiday'); return; }
    toast.success('Holiday deleted successfully');
    fetchHolidays();
  };

  const resetForm = () => { setFormData({ holiday_name: '', description: '' }); setSelectedDate(new Date()); setEditDate(new Date()); };

  const openEditDialog = (holiday: Holiday) => {
    setSelectedHoliday(holiday);
    setFormData({ holiday_name: holiday.holiday_name, description: holiday.description || '' });
    setEditDate(new Date(holiday.date));
    setIsEditOpen(true);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, holiday_name: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, description: e.target.value }));
  };

  const renderForm = (date: Date | undefined, setDate: (d?: Date) => void, onSave: () => void, saveLabel: string) => (
    <div className="space-y-4">
      <div>
        <Label>Date</Label>
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); setDatePickerOpen(false); }} initialFocus /></PopoverContent>
        </Popover>
      </div>
      <div><Label>Holiday Name</Label><Input value={formData.holiday_name} onChange={handleNameChange} placeholder="e.g., Independence Day" /></div>
      <div><Label>Description (Optional)</Label><Textarea value={formData.description} onChange={handleDescriptionChange} placeholder="Additional details" /></div>
      <DialogFooter><Button variant="outline" onClick={() => { setIsCreateOpen(false); setIsEditOpen(false); }}>Cancel</Button><Button onClick={onSave}>{saveLabel}</Button></DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Holiday Calendar {currentYear}</CardTitle>
              <CardDescription>
                {readOnly ? "Company holidays for the current year" : "Manage company holidays for the current year"}
              </CardDescription>
            </div>
            {!readOnly && (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Holiday</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Add New Holiday</DialogTitle><DialogDescription>Create a new holiday entry for {currentYear}</DialogDescription></DialogHeader>
                  {renderForm(selectedDate, setSelectedDate, createHoliday, "Create Holiday")}
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          : holidays.length === 0 ? <div className="text-center py-8 text-muted-foreground">No holidays configured for {currentYear}.</div>
          : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Holiday Name</TableHead>
                  <TableHead>Description</TableHead>
                  {!readOnly && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{format(new Date(h.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{h.holiday_name}</TableCell>
                    <TableCell>{h.description || '-'}</TableCell>
                    {!readOnly && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(h)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="outline" size="sm" onClick={() => deleteHoliday(h.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {!readOnly && (
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent><DialogHeader><DialogTitle>Edit Holiday</DialogTitle><DialogDescription>Update holiday information</DialogDescription></DialogHeader>
            {renderForm(editDate, setEditDate, updateHoliday, "Update Holiday")}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default HolidayManagement;
