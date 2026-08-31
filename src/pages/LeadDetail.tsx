import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Edit, Phone, Mail, Globe, Building2, MapPin, Briefcase, Copy, Trash2, User, UserCog, Users, Tag, CalendarDays } from "lucide-react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useLead, useLeadStatuses, useSaveLead, useLeadAuditLog, useLeadSources, useEvents, useDeleteLead, useIndustries, statusColorClasses,
} from "@/hooks/useLeadsEvents";
import { CONTACT_ROLE_LABELS, ContactRole, useLeadScoringRules } from "@/hooks/useLeadScoring";
import { useLeadInsight, bantScore, BANT_LEVEL_CLASSES } from "@/hooks/useLeadInsights";
import { LeadAttachments } from "@/components/leads/LeadAttachments";
import { LeadActivityComposer } from "@/components/leads/LeadActivityComposer";
import { useLeadActivities } from "@/hooks/useLeadActivities";
import { Plus } from "lucide-react";
import { LeadForm } from "@/components/leads/LeadForm";
import { ConvertLeadDialog } from "@/components/leads/ConvertLeadDialog";
import { LeadScoreTab } from "@/components/leads/LeadScoreTab";
import { LeadSlaTab } from "@/components/leads/LeadSlaTab";
import { LeadStagePath } from "@/components/leads/LeadStagePath";

import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function useUserName(userId?: string | null) {
  return useQuery({
    queryKey: ["user-display-name", userId],
    enabled: !!userId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data: u } = await supabase.from("users").select("full_name, username, email").eq("id", userId!).maybeSingle();
      if (u) return (u as any).full_name || (u as any).username || (u as any).email || "";
      const { data: p } = await supabase.from("profiles").select("full_name, username").eq("id", userId!).maybeSingle();
      return (p as any)?.full_name || (p as any)?.username || "";
    },
  });
}

/** All assignable users, used by the lead owner lookup. */
function useAssignableUsers() {
  return useQuery({
    queryKey: ["assignable-users"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, username, email")
        .order("full_name");
      if (error) throw error;
      return (data ?? []).map((u: any) => ({
        id: u.id as string,
        name: (u.full_name || u.username || u.email || "Unknown") as string,
      }));
    },
  });
}



export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: lead, isLoading } = useLead(id);
  const { data: statuses = [] } = useLeadStatuses(false);
  const { data: sources = [] } = useLeadSources(false);
  const { data: events = [] } = useEvents();
  const { data: industries = [] } = useIndustries();
  const { data: audit = [] } = useLeadAuditLog(id);
  const { data: createdByName } = useUserName((lead as any)?.created_by);
  const { data: ownerFetchedName } = useUserName((lead as any)?.owner_id);

  const latestActorId = (audit as any[]).find((a) => a.actor_id)?.actor_id as string | undefined;
  const { data: latestActorName } = useUserName(latestActorId);
  const modifiedByName = (audit as any[]).find((a) => a.actor_name)?.actor_name || latestActorName || createdByName;

  const save = useSaveLead();
  const del = useDeleteLead();
  const { data: activities = [] } = useLeadActivities(id);
  const { rules } = useLeadScoringRules();
  const insight = useLeadInsight(id);

  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [newAct, setNewAct] = useState(false);
  const [editAct, setEditAct] = useState<any>(null);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const { data: assignableUsers = [] } = useAssignableUsers();

  if (isLoading || !lead) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const ownerId = (lead as any).owner_id as string | null;
  const ownerDisplayName =
    assignableUsers.find((u) => u.id === ownerId)?.name || ownerFetchedName || "Unassigned";
  const ownerQuery = ownerSearch.trim().toLowerCase();
  const ownerResults = ownerQuery
    ? assignableUsers.filter((u) => u.name.toLowerCase().includes(ownerQuery))
    : assignableUsers;



  const currentStatus = statuses.find((s) => s.id === lead.lead_status_id);
  const bant = bantScore(
    {
      statusName: currentStatus?.name,
      contactRole: (lead as any).contact_role,
      activityCount: activities.length,
      createdAt: lead.created_at,
      indicativeBudget: (lead as any).indicative_budget,
      opportunityValue: (lead as any).opportunity_value,
      requirement: (lead as any).researched_information,
      closeDate: (lead as any).opportunity_close_date,
    },
    rules,
  );
  

  // ==== Activity & Effort roll-ups (derived from this lead's activities) ====
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const actDates = activities
    .map((a: any) => String(a.activity_date || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const pastDates = actDates.filter((d) => d <= todayStr);
  const lastActivityDate = pastDates.length ? pastDates[pastDates.length - 1] : null;
  const nextActivityDate = actDates.find((d) => d > todayStr) ?? null;
  const daysSinceLastActivity = lastActivityDate
    ? differenceInCalendarDays(new Date(), parseISO(lastActivityDate))
    : null;
  const productiveCount = activities.filter(
    (a: any) => String(a.outcome || "").trim().toLowerCase() === "productive",
  ).length;
  const totalEffortHours = activities.reduce((sum: number, a: any) => {
    if (a.start_time && a.end_time) {
      const mins = (new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000;
      if (mins > 0) return sum + mins / 60;
    } else if (a.total_hours) {
      return sum + Number(a.total_hours || 0);
    }
    return sum;
  }, 0);

  const source = sources.find((s) => s.id === lead.lead_source_id);
  const event = events.find((e) => e.id === lead.related_event_id);
  const isConverted = !!lead.converted_customer_id;
  const statusIsConverted =
    !!currentStatus && currentStatus.name.trim().toLowerCase() === "converted";

  const changeStatus = (statusId: string) =>
    save.mutateAsync({ id: lead.id, lead_status_id: statusId });

  const cloneLead = async () => {
    setCloning(true);
    try {
      const {
        id: _id, created_at, updated_at, converted_customer_id, converted_at, ...rest
      } = lead as any;
      const created = await save.mutateAsync({ ...rest, name: `${lead.name} (Copy)` } as any);
      if ((created as any)?.id) nav(`/leads/${(created as any).id}`);
    } finally {
      setCloning(false);
    }
  };

  const Field = ({ icon: Icon, label, value }: any) => (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words">{value ?? "—"}</div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => nav("/leads")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Back
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
              {lead.name}
              {isConverted ? (
                <Badge className={currentStatus ? statusColorClasses(currentStatus.color) : ""}>
                  {currentStatus?.name || "Converted"}
                </Badge>
              ) : (
                <Select value={lead.lead_status_id ?? undefined} onValueChange={changeStatus}>
                  <SelectTrigger
                    className={`h-auto py-1 px-2.5 border-0 gap-1.5 rounded-full text-xs font-semibold w-auto focus:ring-0 focus:ring-offset-0 hover:opacity-80 ${currentStatus ? statusColorClasses(currentStatus.color) : "bg-gray-100 text-gray-700"}`}
                  >
                    <SelectValue placeholder="Set status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </CardTitle>
            <div className="text-sm text-muted-foreground">{[lead.title, lead.company].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Popover open={ownerOpen} onOpenChange={(v) => { setOwnerOpen(v); if (!v) setOwnerSearch(""); }}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
                  title="Lead owner — tap to reassign"
                >
                  <UserCog className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Lead Owner</span>
                    <span className="block truncate text-sm font-semibold">{ownerDisplayName}</span>
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="z-50 w-64 bg-popover p-2">
                <p className="mb-2 text-xs font-semibold">Reassign lead owner</p>
                <Input
                  autoFocus
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  placeholder="Search users..."
                  className="h-8 text-sm"
                />
                <div className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">
                  {ownerResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={async () => {
                        setOwnerOpen(false);
                        setOwnerSearch("");
                        await save.mutateAsync({ id: lead.id, owner_id: u.id });
                      }}
                      className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${u.id === (lead as any).owner_id ? "font-semibold text-primary" : ""}`}
                    >
                      {u.name}
                    </button>
                  ))}
                  {ownerResults.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">No users found</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex flex-nowrap items-center gap-1.5">
              <Button size="sm" className="px-2.5" onClick={() => { setEditAct(null); setNewAct(true); }}>
                <Plus className="h-4 w-4 mr-1" />Activity
              </Button>
              <Button variant="outline" size="sm" className="px-2.5" onClick={() => setEditOpen(true)}><Edit className="h-4 w-4 mr-1" />Edit</Button>
              <Button variant="outline" size="sm" className="px-2.5" onClick={cloneLead} disabled={cloning}>
                <Copy className="h-4 w-4 mr-1" />{cloning ? "…" : "Clone"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Delete lead"
                className="h-9 w-9 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <div className="text-[11px] text-muted-foreground">BANT Score</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-lg font-bold leading-none">{bant.total}</span>
                <Badge className={`${BANT_LEVEL_CLASSES[bant.level]} text-[10px]`}>{bant.level}</Badge>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Productive Visits</div>
              <div className="text-sm font-semibold mt-0.5">{productiveCount}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Days Since Last Visit</div>
              <div className="text-sm font-semibold mt-0.5">
                {daysSinceLastActivity != null ? `${daysSinceLastActivity} day${daysSinceLastActivity === 1 ? "" : "s"}` : "—"}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-muted-foreground">Opportunity Value</div>
              <div className="text-sm font-semibold mt-0.5">
                {(lead as any).opportunity_value != null
                  ? `₹${Number((lead as any).opportunity_value).toLocaleString("en-IN")}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Close Date</div>
              <div className="text-sm font-semibold mt-0.5">
                {(lead as any).opportunity_close_date
                  ? format(new Date((lead as any).opportunity_close_date), "dd MMM yyyy")
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Probability of Win</div>
              <div className="text-sm font-semibold mt-0.5">
                {(lead as any).opportunity_probability != null ? `${(lead as any).opportunity_probability}%` : "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isConverted && statuses.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Lead Stage</div>
            <LeadStagePath
              stages={statuses.map((s) => ({ id: s.id, name: s.name }))}
              currentId={lead.lead_status_id}
              onSelect={changeStatus}
              disabled={save.isPending}
            />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activities">Activities ({activities.length})</TabsTrigger>
          <TabsTrigger value="score">Lead Score (BANT)</TabsTrigger>
          <TabsTrigger value="sla">Lead SLA</TabsTrigger>
          <TabsTrigger value="attachments">Attachments ({insight?.documentCount ?? 0})</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>


        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field icon={User} label="Name" value={lead.name} />
              <Field icon={Briefcase} label="Designation" value={lead.title} />
              <Field icon={Users} label="Contact Role" value={CONTACT_ROLE_LABELS[((lead as any).contact_role || "unknown") as ContactRole] ?? "Unknown"} />
              <Field icon={Building2} label="Company" value={lead.company} />
              <Field
                icon={Mail}
                label="Email"
                value={lead.email ? (
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline break-all">{lead.email}</a>
                ) : "—"}
              />
              <Field
                icon={Phone}
                label="Phone"
                value={lead.phone ? (
                  <a href={`tel:${String(lead.phone).replace(/[^\d+]/g, "")}`} className="text-primary hover:underline">{lead.phone}</a>
                ) : "—"}
              />
              <Field
                icon={Globe}
                label="Website"
                value={lead.website ? (
                  <a
                    href={/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {lead.website}
                  </a>
                ) : "—"}
              />
              <Field icon={Building2} label="Industry" value={industries.find((i) => i.id === lead.industry)?.name ?? lead.industry} />
              <Field
                icon={Tag}
                label="Status"
                value={currentStatus ? <Badge className={statusColorClasses(currentStatus.color)}>{currentStatus.name}</Badge> : "—"}
              />
              <Field icon={Briefcase} label="Source" value={source?.name} />
              <Field
                icon={MapPin}
                label="Address"
                value={lead.address ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline whitespace-pre-wrap"
                  >
                    {lead.address}
                  </a>
                ) : "—"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Opportunity Highlight</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Indicative Budget</div>
                  <div>{(lead as any).indicative_budget != null ? `₹${Number((lead as any).indicative_budget).toLocaleString("en-IN")}` : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Opportunity Value</div>
                  <div>{(lead as any).opportunity_value != null ? `₹${Number((lead as any).opportunity_value).toLocaleString("en-IN")}` : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Close Date</div>
                  <div>{(lead as any).opportunity_close_date ? format(new Date((lead as any).opportunity_close_date), "dd MMM yyyy") : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Probability of Win</div>
                  <div>{(lead as any).opportunity_probability != null ? `${(lead as any).opportunity_probability}%` : "—"}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Requirement Overview</div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{lead.researched_information || "—"}</div>
              </div>
            </CardContent>
          </Card>

          {lead.id && (
            <Card>
              <CardHeader><CardTitle className="text-base">Activity &amp; Effort Highlight</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground"># of Activities</div>
                  <div className="font-semibold">{activities.length}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground"># of Productive Activities</div>
                  <div className="font-semibold">{productiveCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Effort (hours)</div>
                  <div className="font-semibold">
                    {totalEffortHours > 0 ? `${(Math.round(totalEffortHours * 100) / 100).toFixed(2)} hrs` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Last Activity Date</div>
                  <div className="font-semibold">
                    {lastActivityDate ? format(parseISO(lastActivityDate), "dd MMM yyyy") : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Days Since Last Activity</div>
                  <div className="font-semibold">
                    {daysSinceLastActivity != null ? `${daysSinceLastActivity} day${daysSinceLastActivity === 1 ? "" : "s"}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Next Activity Date</div>
                  <div className="font-semibold">
                    {nextActivityDate ? format(parseISO(nextActivityDate), "dd MMM yyyy") : "—"}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>

            <CardHeader><CardTitle className="text-base">Audit &amp; System Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-3">
                <Field icon={User} label="Created By" value={createdByName || "—"} />
                <Field icon={CalendarDays} label="Created Date" value={lead.created_at ? format(new Date(lead.created_at), "dd MMM yyyy, HH:mm") : "—"} />
              </div>
              <div className="space-y-3">
                <Field icon={User} label="Last Modified By" value={modifiedByName || "—"} />
                <Field icon={CalendarDays} label="Last Modified Date" value={(lead as any).updated_at ? format(new Date((lead as any).updated_at), "dd MMM yyyy, HH:mm") : "—"} />
              </div>
            </CardContent>

          </Card>


          {lead.business_card_url && (
            <Card>
              <CardHeader><CardTitle className="text-base">Business Card</CardTitle></CardHeader>
              <CardContent><div className="text-xs text-muted-foreground">Stored at: {lead.business_card_url}</div></CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="score" className="mt-4">
          <LeadScoreTab lead={lead as any} />
        </TabsContent>

        <TabsContent value="sla" className="mt-4">
          <LeadSlaTab lead={lead as any} />
        </TabsContent>

        <TabsContent value="activities" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditAct(null); setNewAct(true); }}><Plus className="h-4 w-4 mr-1" />New Activity</Button>
          </div>
          <Card><CardContent className="p-4 space-y-3">
            {activities.map((a: any) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => { setEditAct(a); setNewAct(true); }}
                className="border-l-2 border-primary/40 pl-3 py-2 cursor-pointer rounded-r hover:bg-muted/50 transition-colors"
              >
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{a.activity_name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(a.activity_date), "dd MMM yyyy")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                  <span>{a.activity_type}</span>
                  {a.outcome && <Badge variant="outline" className="text-[10px]">{a.outcome}</Badge>}
                </div>
                {a.description && <p className="text-sm mt-1 whitespace-pre-wrap">{a.description}</p>}
              </div>
            ))}
            {activities.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No activities yet.</p>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          <LeadAttachments leadId={lead.id} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Audit Log</CardTitle></CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet</p>
              ) : (
                <div className="space-y-2">
                  {audit.map((a: any) => {
                    const isActivity = String(a.action || "").startsWith("activity");
                    return (
                      <div
                        key={a.id}
                        className={`text-sm border-l-2 pl-3 py-1 ${isActivity ? "border-amber-500" : "border-primary"}`}
                      >
                        <div className="font-medium">
                          <span className="capitalize">{String(a.action || "").replace(/_/g, " ")}</span>
                          {a.field_name && <span className="text-muted-foreground"> · {a.field_name}</span>}
                        </div>
                        {(a.from_value || a.to_value) && (
                          <div className="text-xs text-muted-foreground break-words">
                            {a.from_value ? <span className="line-through">{a.from_value}</span> : <span className="italic">empty</span>}
                            {" → "}
                            <span className="text-foreground">{a.to_value || "empty"}</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          by {a.actor_name || "System"} · {format(new Date(a.created_at), "dd MMM yyyy, HH:mm")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LeadForm open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <LeadActivityComposer
        open={newAct}
        onOpenChange={(v) => { setNewAct(v); if (!v) setEditAct(null); }}
        leadId={lead.id}
        editActivity={editAct}
      />

      <ConvertLeadDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{lead.name}” and its history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await del.mutateAsync(lead.id); nav("/leads"); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
