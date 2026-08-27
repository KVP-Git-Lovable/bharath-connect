import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Calendar, Clock } from 'lucide-react';

interface LeaveApplication {
  id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  reason: string | null;
  status: string;
  applied_date: string | null;
  approved_date?: string | null;
  leave_types?: { name: string } | null;
}

interface MyLeaveApplicationsProps {
  refreshTrigger?: number;
}

const MyLeaveApplications: React.FC<MyLeaveApplicationsProps> = ({ refreshTrigger }) => {
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchMyApplications();
  }, [refreshTrigger]);

  const fetchMyApplications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('leave_applications')
        .select('*, leave_types!leave_applications_leave_type_id_fkey(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const transformedData = (data || []).map(item => ({
        ...item,
        leave_types: Array.isArray(item.leave_types) ? (item.leave_types.length > 0 ? item.leave_types[0] : null) : (item.leave_types || null),
      }));
      setApplications(transformedData as LeaveApplication[]);
    } catch (error) {
      console.error('Error fetching leave applications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'secondary' | 'default' | 'destructive'; className: string; label: string }> = {
      pending: { variant: 'secondary', className: 'bg-warning/20 text-warning', label: 'Pending' },
      approved: { variant: 'default', className: 'bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]', label: 'Approved' },
      rejected: { variant: 'destructive', className: '', label: 'Rejected' },
    };
    const c = config[status] || config.pending;
    return <Badge variant={c.variant} className={c.className}>{c.label}</Badge>;
  };

  const calculateLeaveDays = (from: string, to: string) => {
    const start = new Date(from);
    const end = new Date(to);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
  };

  if (isLoading) {
    return <Card><CardContent className="p-6"><div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />My Leave Applications</CardTitle>
      </CardHeader>
      <CardContent>
        {applications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium">No leave applications found</p>
            <p className="text-sm">Apply for leave to see your applications here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map(app => (
              <div key={app.id} className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg">{app.leave_types?.name || 'Unknown Leave Type'}</h3>
                    {app.applied_date && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />Applied on {format(new Date(app.applied_date), 'MMM dd, yyyy')}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(app.status)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">Duration:</span>
                    <p className="mt-1">{format(new Date(app.from_date), 'MMM dd')} - {format(new Date(app.to_date), 'MMM dd, yyyy')}</p>
                    <p className="text-xs text-muted-foreground">{calculateLeaveDays(app.from_date, app.to_date)} days</p>
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <span className="font-medium text-muted-foreground">Reason:</span>
                    <p className="mt-1 text-sm leading-relaxed">{app.reason}</p>
                  </div>
                </div>
                {app.status === 'approved' && app.approved_date && (
                  <div className="bg-[hsl(var(--success))]/10 p-3 rounded-md">
                    <p className="text-sm text-[hsl(var(--success))]">✅ Approved on {format(new Date(app.approved_date), 'MMM dd, yyyy')}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MyLeaveApplications;
