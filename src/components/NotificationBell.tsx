import { Bell, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleNotificationClick = (n: typeof notifications[0]) => {
    markAsRead(n.id);
    setOpen(false);

    // Navigate to pending approvals for actionable notification types
    if (
      n.type === 'leave_request' ||
      n.type === 'regularization_request'
    ) {
      const params = new URLSearchParams();
      if (n.related_id) params.set('id', n.related_id);
      if (n.type) params.set('type', n.type);
      navigate(`/pending-approvals?${params.toString()}`);
    } else if (
      n.type === 'leave_decision' ||
      n.type === 'regularization_decision'
    ) {
      navigate('/attendance');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors relative">
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-accent text-[10px] font-bold flex items-center justify-center px-1 text-accent-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllAsRead}>
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No new notifications</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
              >
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
