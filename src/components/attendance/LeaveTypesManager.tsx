import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Save, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface LeaveType {
  id: string; name: string; description: string | null; max_days: number; is_active: boolean; annual_quota: number; accrual_type: string;
}

const LeaveTypesManager = () => {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', max_days: 12, is_active: true, annual_quota: 12, accrual_type: 'yearly' });

  useEffect(() => { fetchLeaveTypes(); }, []);

  const fetchLeaveTypes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('leave_types').select('*').order('name');
    if (!error) setLeaveTypes(data || []);
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Leave type name is required'); return; }
    setIsSaving(true);
    try {
      const leaveTypeData = { name: formData.name.trim(), description: formData.description.trim() || null, max_days: formData.max_days, is_active: formData.is_active, annual_quota: formData.annual_quota, accrual_type: formData.accrual_type };
      if (editingType) {
        const { error } = await supabase.from('leave_types').update(leaveTypeData).eq('id', editingType.id);
        if (error) throw error;
        toast.success('Leave type updated');
      } else {
        const { error } = await supabase.from('leave_types').insert(leaveTypeData);
        if (error) throw error;
        toast.success('Leave type created');
      }
      setIsDialogOpen(false);
      fetchLeaveTypes();
    } catch { toast.error('Failed to save leave type'); } finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('leave_types').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') { toast.error('Cannot delete: leave type is in use. Deactivate instead.'); }
      else toast.error('Failed to delete');
    } else {
      toast.success('Leave type deleted');
      fetchLeaveTypes();
    }
    setDeleteConfirmId(null);
  };

  const toggleActive = async (lt: LeaveType) => {
    const { error } = await supabase.from('leave_types').update({ is_active: !lt.is_active }).eq('id', lt.id);
    if (!error) { toast.success(`Leave type ${lt.is_active ? 'deactivated' : 'activated'}`); fetchLeaveTypes(); }
  };

  if (isLoading) return <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Leave Types Master</CardTitle><CardDescription>Configure leave categories</CardDescription></div>
            <Button onClick={() => { setEditingType(null); setFormData({ name: '', description: '', max_days: 12, is_active: true, annual_quota: 12, accrual_type: 'yearly' }); setIsDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Leave Type</Button>
          </div>
        </CardHeader>
        <CardContent>
          {leaveTypes.length === 0 ? <div className="text-center py-8 text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No leave types configured yet</p></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-center">Annual Quota</TableHead><TableHead className="text-center">Accrual</TableHead><TableHead className="text-center">Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {leaveTypes.map(lt => (
                  <TableRow key={lt.id}>
                    <TableCell className="font-medium">{lt.name}{lt.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{lt.description}</p>}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{lt.annual_quota} days</Badge></TableCell>
                    <TableCell className="text-center"><Badge variant="outline">{lt.accrual_type === 'monthly' ? `Monthly (${(lt.annual_quota / 12).toFixed(1)}/mo)` : 'Yearly'}</Badge></TableCell>
                    <TableCell className="text-center"><Badge className={lt.is_active ? 'bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] cursor-pointer' : 'bg-destructive/20 text-destructive cursor-pointer'} onClick={() => toggleActive(lt)}>{lt.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditingType(lt); setFormData({ name: lt.name, description: lt.description || '', max_days: lt.max_days, is_active: lt.is_active, annual_quota: lt.annual_quota, accrual_type: lt.accrual_type }); setIsDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                        {deleteConfirmId === lt.id ? (
                          <div className="flex gap-1"><Button variant="destructive" size="sm" onClick={() => handleDelete(lt.id)}>Confirm</Button><Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancel</Button></div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(lt.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingType ? 'Edit Leave Type' : 'Create Leave Type'}</DialogTitle><DialogDescription>Configure leave type details</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Leave Name *</Label><Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g., Casual Leave" /></div>
            <div><Label>Description</Label><Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Brief description..." rows={2} /></div>
            <div><Label>Annual Quota (days/year)</Label><Input type="number" value={formData.annual_quota} onChange={e => { const v = parseInt(e.target.value) || 0; setFormData({...formData, annual_quota: v, max_days: v}); }} min={0} max={365} /><p className="text-xs text-muted-foreground mt-1">{formData.accrual_type === 'monthly' ? `Monthly accrual: ${(formData.annual_quota / 12).toFixed(2)} days/month` : `Full ${formData.annual_quota} days allocated at start of year`}</p></div>
            <div><Label>Accrual Type</Label>
              <div className="flex gap-2 mt-1">
                <Button type="button" variant={formData.accrual_type === 'yearly' ? 'default' : 'outline'} size="sm" onClick={() => setFormData({...formData, accrual_type: 'yearly'})}>Yearly</Button>
                <Button type="button" variant={formData.accrual_type === 'monthly' ? 'default' : 'outline'} size="sm" onClick={() => setFormData({...formData, accrual_type: 'monthly'})}>Monthly</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{formData.accrual_type === 'monthly' ? 'Leaves accrue monthly (annual_quota ÷ 12)' : 'Full quota available from start of year'}</p>
            </div>
            <div className="flex items-center justify-between"><div><Label>Active</Label><p className="text-xs text-muted-foreground">Make this leave type available</p></div><Switch checked={formData.is_active} onCheckedChange={checked => setFormData({...formData, is_active: checked})} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? 'Saving...' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaveTypesManager;
