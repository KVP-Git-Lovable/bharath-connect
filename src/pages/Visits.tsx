import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Navigation2,
  Sparkles,
  LogIn,
  LogOut,
  Clock,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVisits } from "@/hooks/useVisits";
import { toast } from "sonner";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

const statusColors: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info border-info/20",
  completed: "bg-success/10 text-success border-success/20",
  productive: "bg-success/10 text-success border-success/20",
  unproductive: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground",
};

export default function Visits() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"gps" | "activity">("gps");
  const [searchQuery, setSearchQuery] = useState("");
  const [userId, setUserId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRetailerId, setSelectedRetailerId] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { visits, retailers, beatPlans, isLoading, createVisit, checkInVisit, checkOutVisit } =
    useVisits(userId, dateStr);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const filteredVisits = useMemo(() => {
    if (!searchQuery) return visits;
    const q = searchQuery.toLowerCase();
    return visits.filter(
      (v: any) =>
        v.retailers?.name?.toLowerCase().includes(q) ||
        v.retailers?.phone?.includes(q)
    );
  }, [visits, searchQuery]);

  const beatName = beatPlans.map((bp: any) => bp.beat_name).filter(Boolean).join(", ");

  const handleCreateVisit = async () => {
    if (!selectedRetailerId) {
      toast.error("Please select a retailer");
      return;
    }
    try {
      await createVisit.mutateAsync({
        retailer_id: selectedRetailerId,
        planned_date: dateStr,
      });
      toast.success("Visit created!");
      setCreateOpen(false);
      setSelectedRetailerId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create visit");
    }
  };

  return (
    <motion.div className="space-y-0" variants={container} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={item} className="gradient-hero text-primary-foreground p-4 pb-6">
        <h1 className="text-lg font-bold">My Visits</h1>
        <p className="text-xs opacity-80">{beatName || "No beats planned"}</p>

        <div className="flex items-center gap-2 mt-3 mb-3">
          <CalendarDays className="h-4 w-4 opacity-80" />
          <span className="text-xs opacity-80">Week of {format(weekStart, "MMM d, yyyy")}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10" onClick={() => setSelectedDate(subWeeks(selectedDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10" onClick={() => setSelectedDate(addWeeks(selectedDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => {
            const isActive = isSameDay(day, selectedDate);
            return (
              <button key={day.toISOString()} onClick={() => setSelectedDate(day)} className={`rounded-lg py-2 text-center transition-colors ${isActive ? "bg-white text-primary font-semibold" : "bg-white/15 text-primary-foreground/80 hover:bg-white/25"}`}>
                <p className="text-[10px]">{format(day, "EEE")}</p>
                <p className="text-sm font-semibold">{format(day, "d")}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="ghost" className={`h-9 text-xs ${activeTab === "gps" ? "bg-white/20 text-primary-foreground" : "text-primary-foreground/60 hover:bg-white/10"}`} onClick={() => setActiveTab("gps")}>
            <Navigation2 className="h-3.5 w-3.5 mr-1.5" />GPS Track
          </Button>
          <Button variant="ghost" className={`h-9 text-xs ${activeTab === "activity" ? "bg-white/20 text-primary-foreground" : "text-primary-foreground/60 hover:bg-white/10"}`} onClick={() => setActiveTab("activity")}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />Activity
          </Button>
        </div>
      </motion.div>

      {/* Search + Create */}
      <motion.div variants={item} className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or phone" className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-hero text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" /> New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Visit</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Retailer</Label>
                  <Select value={selectedRetailerId} onValueChange={setSelectedRetailerId}>
                    <SelectTrigger><SelectValue placeholder="Select a retailer" /></SelectTrigger>
                    <SelectContent>
                      {retailers.map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>{r.name} - {r.address || "No address"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {retailers.length === 0 && (
                    <p className="text-xs text-muted-foreground">No retailers found. Add retailers first.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Planned Date</Label>
                  <Input type="date" value={dateStr} disabled />
                </div>
                <Button onClick={handleCreateVisit} className="w-full" disabled={createVisit.isPending}>
                  {createVisit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Visit
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Visit List */}
      <motion.div variants={item} className="px-4 pb-24 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredVisits.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-semibold text-muted-foreground">No visits found</p>
              <p className="text-xs text-muted-foreground mt-1">Create a new visit for this date</p>
            </CardContent>
          </Card>
        ) : (
          filteredVisits.map((visit: any) => (
            <Card key={visit.id} className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{visit.retailers?.name || "Unknown"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">{visit.retailers?.address || ""}</p>
                    {visit.check_in_time && (
                      <p className="text-xs text-muted-foreground ml-6 mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        In: {format(new Date(visit.check_in_time), "h:mm a")}
                        {visit.check_out_time && ` | Out: ${format(new Date(visit.check_out_time), "h:mm a")}`}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={statusColors[visit.status] || ""}>
                    {visit.status}
                  </Badge>
                </div>
                <div className="flex gap-2 mt-3">
                  {visit.status === "planned" && (
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => checkInVisit.mutate(visit.id)} disabled={checkInVisit.isPending}>
                      <LogIn className="h-3 w-3 mr-1" /> Check In
                    </Button>
                  )}
                  {visit.status === "in_progress" && (
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => checkOutVisit.mutate(visit.id)} disabled={checkOutVisit.isPending}>
                      <LogOut className="h-3 w-3 mr-1" /> Check Out
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </motion.div>
    </motion.div>
  );
}
