import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Calendar, Save, Calculator } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const patternOptions = [
  { value: 'none', label: 'Working Day' }, { value: 'all', label: 'All Week-Offs' },
  { value: '1st_3rd', label: '1st & 3rd' }, { value: '2nd_4th', label: '2nd & 4th' },
];
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface WorkingDaysEntry { id?: string; year: number; month: number; total_days: number; working_days: number; week_offs: number; holidays: number; }
interface WeekOffConfig { day_of_week: number; is_off: boolean; alternate_pattern: string | null; }
interface Holiday { date: string; holiday_name: string; }

const WorkingDaysConfig = () => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [workingDaysData, setWorkingDaysData] = useState<WorkingDaysEntry[]>([]);
  const [weekOffConfig, setWeekOffConfig] = useState<WeekOffConfig[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  useEffect(() => { fetchData(); }, [selectedYear]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const year = parseInt(selectedYear);
      const [wdRes, woRes, hRes] = await Promise.all([
        supabase.from('working_days_config').select('*').eq('year', year).order('month'),
        supabase.from('week_off_config').select('*').order('day_of_week'),
        supabase.from('holidays').select('date, holiday_name').eq('year', year),
      ]);
      setWeekOffConfig(woRes.data || []);
      setHolidays(hRes.data || []);

      const existing = wdRes.data || [];
      const fullYear: WorkingDaysEntry[] = [];
      for (let month = 1; month <= 12; month++) {
        const ex = existing.find(d => d.month === month);
        if (ex) fullYear.push(ex);
        else fullYear.push({ year, month, total_days: new Date(year, month, 0).getDate(), working_days: new Date(year, month, 0).getDate(), week_offs: 0, holidays: 0 });
      }
      setWorkingDaysData(fullYear);
    } catch { toast.error('Failed to load working days'); } finally { setIsLoading(false); }
  };

  const calculateWorkingDays = () => {
    setIsCalculating(true);
    const year = parseInt(selectedYear);
    const updated: WorkingDaysEntry[] = [];
    for (let month = 1; month <= 12; month++) {
      const totalDays = new Date(year, month, 0).getDate();
      let weekOffs = 0, holidayCount = 0;
      for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, month - 1, day);
        const dow = date.getDay();
        const config = weekOffConfig.find(c => c.day_of_week === dow);
        if (config?.is_off) {
          if (config.alternate_pattern === 'all') weekOffs++;
          else if (config.alternate_pattern === '1st_3rd') { const w = Math.ceil(day / 7); if (w === 1 || w === 3) weekOffs++; }
          else if (config.alternate_pattern === '2nd_4th') { const w = Math.ceil(day / 7); if (w === 2 || w === 4) weekOffs++; }
        }
      }
      const monthHolidays = holidays.filter(h => new Date(h.date).getMonth() === month - 1);
      for (const h of monthHolidays) {
        const dow = new Date(h.date).getDay();
        const config = weekOffConfig.find(c => c.day_of_week === dow);
        if (!config?.is_off || config.alternate_pattern === 'none') holidayCount++;
      }
      const existing = workingDaysData.find(d => d.month === month);
      updated.push({ id: existing?.id, year, month, total_days: totalDays, working_days: totalDays - weekOffs - holidayCount, week_offs: weekOffs, holidays: holidayCount });
    }
    setWorkingDaysData(updated);
    setIsCalculating(false);
    toast.success('Working days calculated');
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const year = parseInt(selectedYear);
      for (const entry of workingDaysData) {
        const data = { year, month: entry.month, total_days: entry.total_days, working_days: entry.working_days, week_offs: entry.week_offs, holidays: entry.holidays };
        if (entry.id) await supabase.from('working_days_config').update(data).eq('id', entry.id);
        else await supabase.from('working_days_config').upsert(data, { onConflict: 'year,month' });
      }
      toast.success('Working days saved');
      fetchData();
    } catch { toast.error('Failed to save'); } finally { setIsSaving(false); }
  };

  const handleWeekOffChange = async (dayOfWeek: number, pattern: string) => {
    try {
      const isOff = pattern !== 'none';
      const existing = weekOffConfig.find(c => c.day_of_week === dayOfWeek);
      if (existing) await supabase.from('week_off_config').update({ is_off: isOff, alternate_pattern: isOff ? pattern : null }).eq('day_of_week', dayOfWeek);
      else await supabase.from('week_off_config').insert({ day_of_week: dayOfWeek, is_off: isOff, alternate_pattern: isOff ? pattern : null });
      setWeekOffConfig(prev => { const updated = prev.filter(c => c.day_of_week !== dayOfWeek); updated.push({ day_of_week: dayOfWeek, is_off: isOff, alternate_pattern: isOff ? pattern : null }); return updated.sort((a,b) => a.day_of_week - b.day_of_week); });
      toast.success(`${dayNames[dayOfWeek]} updated`);
      setTimeout(() => calculateWorkingDays(), 100);
    } catch { toast.error('Failed to update week-off'); }
  };

  const getPatternForDay = (d: number) => { const c = weekOffConfig.find(x => x.day_of_week === d); return (!c || !c.is_off) ? 'none' : c.alternate_pattern || 'all'; };
  const totalWorkingDays = workingDaysData.reduce((s, d) => s + d.working_days, 0);
  const totalWeekOffs = workingDaysData.reduce((s, d) => s + d.week_offs, 0);
  const totalHolidays = workingDaysData.reduce((s, d) => s + d.holidays, 0);

  if (isLoading) return <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Working Days Configuration</CardTitle><CardDescription>Configure and view working days for each month</CardDescription></div>
            <div className="flex items-center gap-2">
              <Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select>
              <Button variant="outline" onClick={calculateWorkingDays} disabled={isCalculating}><Calculator className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />Auto Calculate</Button>
              <Button onClick={handleSaveAll} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? 'Saving...' : 'Save All'}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <h3 className="text-sm font-medium mb-3">Weekly Off Configuration</h3>
            <div className="grid grid-cols-7 gap-2">
              {dayNames.map((day, i) => {
                const pattern = getPatternForDay(i);
                const isOff = pattern !== 'none';
                return (
                  <div key={day} className="flex flex-col items-center gap-2">
                    <div className={cn("w-full py-3 px-2 rounded-lg text-center font-medium transition-colors", isOff ? "bg-destructive/10 text-destructive border-2 border-destructive/30" : "bg-muted/50 text-foreground border border-border")}>{day}</div>
                    <Select value={pattern} onValueChange={v => handleWeekOffChange(i, v)}><SelectTrigger className="w-full text-xs h-8"><SelectValue /></SelectTrigger><SelectContent>{patternOptions.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent></Select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-primary/10 rounded-lg p-4"><div className="text-sm text-muted-foreground">Total Working Days</div><div className="text-2xl font-bold text-primary">{totalWorkingDays}</div></div>
            <div className="bg-muted/50 rounded-lg p-4"><div className="text-sm text-muted-foreground">Week-Offs</div><div className="text-2xl font-bold">{totalWeekOffs}</div></div>
            <div className="bg-muted/50 rounded-lg p-4"><div className="text-sm text-muted-foreground">Holidays</div><div className="text-2xl font-bold">{totalHolidays}</div></div>
            <div className="bg-muted/50 rounded-lg p-4"><div className="text-sm text-muted-foreground">Calendar Days</div><div className="text-2xl font-bold">{workingDaysData.reduce((s, d) => s + d.total_days, 0)}</div></div>
          </div>

          <Table>
            <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-center">Total Days</TableHead><TableHead className="text-center">Week-Offs</TableHead><TableHead className="text-center">Holidays</TableHead><TableHead className="text-center">Working Days</TableHead></TableRow></TableHeader>
            <TableBody>
              {workingDaysData.map(entry => (
                <TableRow key={entry.month}>
                  <TableCell className="font-medium">{monthNames[entry.month - 1]}</TableCell>
                  <TableCell className="text-center"><Badge variant="outline">{entry.total_days}</Badge></TableCell>
                  <TableCell className="text-center"><Badge variant="secondary">{entry.week_offs}</Badge></TableCell>
                  <TableCell className="text-center"><Badge className="bg-warning/20 text-warning">{entry.holidays}</Badge></TableCell>
                  <TableCell className="text-center"><Input type="number" value={entry.working_days} onChange={e => setWorkingDaysData(prev => prev.map(d => d.month === entry.month ? { ...d, working_days: parseInt(e.target.value) || 0 } : d))} className="w-20 text-center mx-auto" min={0} max={entry.total_days} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkingDaysConfig;
