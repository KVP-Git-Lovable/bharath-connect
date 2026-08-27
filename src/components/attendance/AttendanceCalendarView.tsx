import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isAfter, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeekOffConfig {
  id: string;
  day_of_week: number;
  is_off: boolean;
  alternate_pattern: string | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  total_hours?: number | null;
}

interface LeaveRecord {
  id: string;
  from_date: string;
  to_date: string;
  status: string;
  is_half_day?: boolean | null;
  half_day_period?: string | null;
  leave_types?: { name: string } | { name: string }[] | null;
}

interface AttendanceCalendarViewProps {
  attendanceRecords: AttendanceRecord[];
  leaveRecords: LeaveRecord[];
  weekOffConfig: WeekOffConfig[];
  holidayDates: Set<string>;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onDateSelect?: (date: string) => void;
}

const isWeekOffDate = (date: Date, weekOffConfigs: WeekOffConfig[]): boolean => {
  const dayOfWeek = date.getDay();
  const dayConfig = weekOffConfigs.filter(c => c.day_of_week === dayOfWeek && c.is_off);

  for (const config of dayConfig) {
    const pattern = config.alternate_pattern || 'all';
    if (pattern === 'all') return true;
    const dayOfMonth = date.getDate();
    const weekNumber = Math.ceil(dayOfMonth / 7);
    if (pattern === '1st_3rd' && (weekNumber === 1 || weekNumber === 3)) return true;
    if (pattern === '2nd_4th' && (weekNumber === 2 || weekNumber === 4)) return true;
  }
  return false;
};

type DayStatus = 'present' | 'absent' | 'leave' | 'half-day' | 'week-off' | 'holiday' | 'future' | 'outside';

export const AttendanceCalendarView = ({
  attendanceRecords,
  leaveRecords,
  weekOffConfig,
  holidayDates,
  currentMonth,
  onMonthChange,
  onDateSelect,
}: AttendanceCalendarViewProps) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendanceRecords.forEach(r => map.set(r.date, r));
    return map;
  }, [attendanceRecords]);

  const leaveMap = useMemo(() => {
    const map = new Map<string, LeaveRecord>();
    leaveRecords
      .filter(l => l.status === 'approved')
      .forEach(l => {
        // Parse date-only strings as local dates (avoid UTC shift)
        const [sy, sm, sd] = l.from_date.split('-').map(Number);
        const [ey, em, ed] = l.to_date.split('-').map(Number);
        const start = new Date(sy, sm - 1, sd);
        const end = new Date(ey, em - 1, ed);
        for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
          map.set(format(d, 'yyyy-MM-dd'), l);
        }
      });
    return map;
  }, [leaveRecords]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const today = new Date();

    const days: { date: Date; dateStr: string; status: DayStatus; inMonth: boolean }[] = [];

    for (let d = calStart; d <= calEnd; d = addDays(d, 1)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const inMonth = isSameMonth(d, currentMonth);

      if (!inMonth) {
        days.push({ date: new Date(d), dateStr, status: 'outside', inMonth });
        continue;
      }

      // Check holidays BEFORE future — holidays should always show
      if (holidayDates.has(dateStr)) {
        days.push({ date: new Date(d), dateStr, status: 'holiday', inMonth });
        continue;
      }

      // Check approved leaves BEFORE future — leaves should always show
      const leave = leaveMap.get(dateStr);
      if (leave && leave.is_half_day) {
        days.push({ date: new Date(d), dateStr, status: 'half-day', inMonth });
        continue;
      }
      if (leave) {
        days.push({ date: new Date(d), dateStr, status: 'leave', inMonth });
        continue;
      }

      if (isAfter(d, today) && !isToday(d)) {
        days.push({ date: new Date(d), dateStr, status: 'future', inMonth });
        continue;
      }

      if (isWeekOffDate(d, weekOffConfig)) {
        days.push({ date: new Date(d), dateStr, status: 'week-off', inMonth });
        continue;
      }

      const attendance = attendanceMap.get(dateStr);

      if (attendance && (attendance.status === 'present' || attendance.status === 'regularized')) {
        days.push({ date: new Date(d), dateStr, status: 'present', inMonth });
        continue;
      }

      days.push({ date: new Date(d), dateStr, status: 'absent', inMonth });
    }

    return days;
  }, [currentMonth, attendanceMap, leaveMap, weekOffConfig, holidayDates]);

  const handleDateClick = (dateStr: string, status: DayStatus) => {
    if (status === 'outside' || status === 'future') return;
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
    onDateSelect?.(dateStr);
  };

  const selectedRecord = selectedDate ? attendanceMap.get(selectedDate) : null;
  const selectedLeave = selectedDate ? leaveMap.get(selectedDate) : null;

  const prevMonth = () => {
    const prev = new Date(currentMonth);
    prev.setMonth(prev.getMonth() - 1);
    onMonthChange(prev);
  };

  const nextMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    onMonthChange(next);
  };

  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getIndicatorStyle = (status: DayStatus): string => {
    switch (status) {
      case 'present': return 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]';
      case 'absent': return 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]';
      case 'leave': return 'bg-[hsl(var(--leave))] text-white';
      case 'week-off': return 'bg-[hsl(var(--week-off))] text-white opacity-60';
      case 'holiday': return 'bg-[hsl(var(--info))] text-[hsl(var(--info-foreground))]';
      case 'future': return 'border border-border text-muted-foreground';
      case 'outside': return 'text-transparent';
      default: return '';
    }
  };

  const formatTime = (t: string | null | undefined) => {
    if (!t) return '--:--';
    return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <button onClick={prevMonth} className="p-1.5 rounded-full hover:bg-accent transition-colors">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded-full hover:bg-accent transition-colors">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {dayHeaders.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map(({ date, dateStr, status, inMonth }) => (
          <div key={dateStr} className="flex justify-center">
            <button
              onClick={() => handleDateClick(dateStr, status)}
              disabled={status === 'outside'}
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                getIndicatorStyle(status),
                status === 'half-day' && 'text-white',
                selectedDate === dateStr && status !== 'outside' && 'ring-2 ring-primary ring-offset-1',
                isToday(date) && inMonth && 'ring-2 ring-foreground/30 ring-offset-1',
                status === 'outside' && 'pointer-events-none'
              )}
              style={status === 'half-day' ? {
                background: `linear-gradient(to right, hsl(var(--success)) 50%, hsl(var(--leave)) 50%)`
              } : undefined}
            >
              {inMonth ? date.getDate() : ''}
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1">
        {[
          { label: 'Present', cls: 'bg-[hsl(var(--success))]' },
          { label: 'Absent', cls: 'bg-[hsl(var(--destructive))]' },
          { label: 'Leave', cls: 'bg-[hsl(var(--leave))]' },
          { label: 'Half Day', gradient: true },
          { label: 'Holiday', cls: 'bg-[hsl(var(--info))]' },
          { label: 'Week Off', cls: 'bg-[hsl(var(--week-off))] opacity-60' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1">
            <div
              className={cn('w-2.5 h-2.5 rounded-full', !item.gradient && item.cls)}
              style={item.gradient ? {
                background: `linear-gradient(to right, hsl(var(--success)) 50%, hsl(var(--leave)) 50%)`
              } : undefined}
            />
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {selectedDate && (
        <div className="bg-muted/50 rounded-xl p-3 text-sm space-y-1">
          <div className="font-medium text-foreground">
            {format(new Date(selectedDate), 'EEEE, MMM dd, yyyy')}
          </div>
          {selectedRecord && (selectedRecord.status === 'present' || selectedRecord.status === 'regularized') && (
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>Check-in: {formatTime(selectedRecord.check_in_time)}</div>
              <div>Check-out: {formatTime(selectedRecord.check_out_time)}</div>
              {selectedRecord.total_hours != null && (
                <div>Hours: {selectedRecord.total_hours.toFixed(1)}h</div>
              )}
            </div>
          )}
          {selectedLeave && (
            <div className="text-muted-foreground text-xs">
              {selectedLeave.is_half_day ? 'Half Day Leave' : 'On Leave'}
              {selectedLeave.leave_types && (
                ` — ${Array.isArray(selectedLeave.leave_types) ? selectedLeave.leave_types[0]?.name : selectedLeave.leave_types.name}`
              )}
            </div>
          )}
          {holidayDates.has(selectedDate) && (
            <div className="text-muted-foreground text-xs">Holiday</div>
          )}
        </div>
      )}
    </div>
  );
};
