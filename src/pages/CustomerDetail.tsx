import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Trash2, FileText, Download, LayoutGrid, List, ArrowLeft,
  Target, Wallet, Trophy, Users, Clock, Phone, Mail, CalendarDays, StickyNote, CheckSquare, FileImage, FileSpreadsheet, File as FileIcon,
  Star, Pencil,
} from "lucide-react";

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  useOpportunities, useContacts, useDeleteContact,
  useCustomerActivities, useCustomerDocuments, useDeleteCustomerDocument,
  useOppStages, useOppTypes, useUserLookup, useUpdateOpportunity,
  useCustomer, stageColorClasses,
  useContactRoles, useUpsertContactRole, useDeleteContactRole, useSetPrimaryContact,
  CONTACT_ROLE_OPTIONS,
} from "@/hooks/useCustomers";

import { OpportunityForm } from "@/components/customers/OpportunityForm";
import { ContactForm } from "@/components/customers/ContactForm";
import { ContactOrgChart } from "@/components/customers/ContactOrgChart";
import { ActivityForm } from "@/components/customers/ActivityForm";
import { DocumentUpload } from "@/components/customers/DocumentUpload";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { MobileCardList, MobileCard, Field } from "@/components/ui/mobile-card";
import { formatCurrency, sumByCurrency, formatMixedCurrencyTotals } from "@/lib/currency";

const mixed = (rows: any[]) =>
  formatMixedCurrencyTotals(sumByCurrency(rows, (o) => Number(o.amount || 0), (o) => o.currency));

export default function CustomerDetail() {
  const nav = useNavigate();
  const { id: customerId = "" } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
  const { data: customer } = useCustomer(customerId);
  const { data: opps = [] } = useOpportunities(customerId);
  const { data: contacts = [] } = useContacts(customerId);
  const { data: activities = [] } = useCustomerActivities({ customerId });
  const { data: docs = [] } = useCustomerDocuments({ customerId });
  const { data: stages = [] } = useOppStages();
  const { data: types = [] } = useOppTypes();
  const { data: users = [] } = useUserLookup();

  const updateOpp = useUpdateOpportunity();
  const deleteContact = useDeleteContact();
  const deleteDoc = useDeleteCustomerDocument();
  const { data: contactRoles = [] } = useContactRoles(customerId);
  const upsertRole = useUpsertContactRole();
  const deleteRole = useDeleteContactRole();
  const setPrimary = useSetPrimaryContact();
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; row?: any }>({ open: false });

  const usersMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])), [users]);
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);
  const oppMap = useMemo(() => Object.fromEntries(opps.map((o) => [o.id, o])), [opps]);

  const [newOpp, setNewOpp] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [newAct, setNewAct] = useState(false);
  const [contactView, setContactView] = useState<"list" | "org">("list");
  const [oppView, setOppView] = useState<"table" | "kanban">("table");
  const [fStage, setFStage] = useState("all");
  const [fType, setFType] = useState("all");
  const [fOwner, setFOwner] = useState("all");

  const stats = useMemo(() => {
    const openPipeline = opps
      .filter((o) => !stageMap[o.stage ?? ""]?.is_closed)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const wonValue = opps
      .filter((o) => stageMap[o.stage ?? ""]?.is_won)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const lastActivity = activities[0]?.activity_date ?? null;
    return { total: opps.length, openPipeline, wonValue, lastActivity, contacts: contacts.length };
  }, [opps, stageMap, activities, contacts]);

  const pipelineByStage = useMemo(() => {
    const counts = new Map<string, number>();
    opps.forEach((o) => {
      const key = o.stage || "Unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, value]) => ({
      name, value, hex: stageHex(stageMap[name]?.color),
    }));
  }, [opps, stageMap]);

  const pipelineByType = useMemo(() => {
    const totals = new Map<string, number>();
    opps.forEach((o) => {
      const key = o.type || "Unspecified";
      totals.set(key, (totals.get(key) ?? 0) + Number(o.amount || 0));
    });
    const palette = ["hsl(217 91% 60%)", "hsl(38 92% 50%)", "hsl(160 84% 39%)", "hsl(280 65% 60%)", "hsl(340 82% 60%)"];
    return Array.from(totals.entries()).map(([name, value], i) => ({
      name, value, hex: palette[i % palette.length],
    }));
  }, [opps]);

  const winRate = useMemo(() => {
    const closed = opps.filter((o) => stageMap[o.stage ?? ""]?.is_closed).length;
    const won = opps.filter((o) => stageMap[o.stage ?? ""]?.is_won).length;
    return { closed, won, percent: closed > 0 ? Math.round((won / closed) * 100) : 0 };
  }, [opps, stageMap]);

  const filteredOpps = opps.filter((o) => {
    if (fStage !== "all" && o.stage !== fStage) return false;
    if (fType !== "all" && o.type !== fType) return false;
    if (fOwner !== "all" && o.owner_id !== fOwner) return false;
    return true;
  });

  const downloadDoc = async (path: string, name: string) => {
    const { data } = await supabase.storage.from("customer-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl; a.download = name; a.click();
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => nav("/customers")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />All Customers
      </Button>
      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{customer?.name ?? "Customer"}</h1>
              <p className="text-sm text-muted-foreground">{customer?.industry || "—"}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{customer?.status || "active"}</Badge>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{stats.total}</span> opps ·{" "}
                <span className="font-medium text-foreground">{mixed(opps.filter((o) => !stageMap[o.stage ?? ""]?.is_closed))}</span> pipeline ·{" "}
                <span className="font-medium text-foreground">{stats.contacts}</span> contacts
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      <Tabs value={activeTab} onValueChange={(v) => setSearchParams(v === "overview" ? {} : { tab: v })}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="contact-roles">Contact Roles</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* KPI CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="Total Opportunities" value={String(stats.total)} icon={Target} accent="indigo" />
            <KpiCard label="Open Pipeline" value={mixed(opps.filter((o) => !stageMap[o.stage ?? ""]?.is_closed))} icon={Wallet} accent="blue" />
            <KpiCard label="Won Value" value={mixed(opps.filter((o) => stageMap[o.stage ?? ""]?.is_won))} icon={Trophy} accent="emerald" />
            <KpiCard label="Total Contacts" value={String(stats.contacts)} icon={Users} accent="violet" />
            <KpiCard label="Last Activity" value={stats.lastActivity ? format(new Date(stats.lastActivity), "dd MMM yyyy") : "—"} icon={Clock} accent="amber" />
          </div>

          {/* VISUAL BREAKDOWNS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Pipeline Insights</h2>
              <span className="text-xs text-muted-foreground">Live snapshot</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Pipeline by Stage — donut */}
              <Card className="shadow-card hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold">Pipeline by Stage</h3>
                  <p className="text-xs text-muted-foreground mb-2">Opportunities grouped by stage</p>
                  <div className="h-[220px]">
                    {pipelineByStage.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pipelineByStage} dataKey="value" nameKey="name" cx="50%" cy="50%"
                            innerRadius={50} outerRadius={80} paddingAngle={2}>
                            {pipelineByStage.map((s, i) => <Cell key={i} fill={s.hex} />)}
                          </Pie>
                          <RTooltip formatter={(v: any, n: any) => [`${v}`, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <EmptyChart label="No opportunities yet" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {pipelineByStage.map((s) => (
                      <div key={s.name} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.hex }} />
                        <span className="text-muted-foreground">{s.name}</span>
                        <span className="font-semibold">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Pipeline by Type — horizontal bars */}
              <Card className="shadow-card hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold">Pipeline by Type</h3>
                  <p className="text-xs text-muted-foreground mb-2">Total value per type</p>
                  <div className="h-[220px]">
                    {pipelineByType.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pipelineByType} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                          <RTooltip formatter={(v: any) => Number(v).toLocaleString()} />
                          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                            {pipelineByType.map((t, i) => <Cell key={i} fill={t.hex} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyChart label="No pipeline data" />}
                  </div>
                </CardContent>
              </Card>

              {/* Win Rate gauge */}
              <Card className="shadow-card hover:shadow-lg transition-shadow bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-transparent">
                <CardContent className="p-4 h-full flex flex-col">
                  <h3 className="text-sm font-semibold">Win Rate</h3>
                  <p className="text-xs text-muted-foreground mb-4">Won vs total closed opportunities</p>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <WinRateGauge percent={winRate.percent} />
                    <div className="mt-3 grid grid-cols-2 gap-3 text-center w-full">
                      <div>
                        <div className="text-xs text-muted-foreground">Won</div>
                        <div className="text-lg font-bold text-emerald-600">{winRate.won}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Closed</div>
                        <div className="text-lg font-bold">{winRate.closed}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* RECENT ACTIVITY & DOCS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Recent Activity</h2>
              <span className="text-xs text-muted-foreground">Latest 5 entries</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="shadow-card">
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold text-sm mb-1">Activities</h3>
                  {activities.slice(0, 5).map((a) => {
                    const style = activityStyle(a.type);
                    const Icon = style.icon;
                    return (
                      <div key={a.id} className="flex items-start gap-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors p-2.5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                          <Icon className={`h-4 w-4 ${style.text}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-sm truncate">{a.subject}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(a.activity_date), "dd MMM")}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] py-0 h-4 ${style.badge}`}>{a.type}</Badge>
                            {a.opportunity_id && (
                              <Badge variant="secondary" className="text-[10px] py-0 h-4">{oppMap[a.opportunity_id]?.name ?? "Opportunity"}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {activities.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No activities yet.</p>}
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold text-sm mb-1">Documents</h3>
                  {docs.slice(0, 5).map((d) => {
                    const style = docStyle(d.file_name, d.file_type);
                    const Icon = style.icon;
                    return (
                      <div key={d.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors p-2.5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                          <Icon className={`h-4 w-4 ${style.text}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-sm truncate">{d.file_name}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(d.created_at), "dd MMM")}</span>
                          </div>
                          <div className="mt-1">
                            {d.opportunity_id && (
                              <Badge variant="secondary" className="text-[10px] py-0 h-4">{oppMap[d.opportunity_id]?.name ?? "Opportunity"}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {docs.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No documents yet.</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>


        {/* OPPORTUNITIES */}
        <TabsContent value="opportunities" className="mt-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button size="sm" variant={oppView === "table" ? "default" : "ghost"} onClick={() => setOppView("table")}>
                <List className="h-4 w-4 mr-1" />Table
              </Button>
              <Button size="sm" variant={oppView === "kanban" ? "default" : "ghost"} onClick={() => setOppView("kanban")}>
                <LayoutGrid className="h-4 w-4 mr-1" />Kanban
              </Button>
            </div>
            <Button size="sm" onClick={() => setNewOpp(true)}><Plus className="h-4 w-4 mr-1" />New Opportunity</Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Select value={fStage} onValueChange={setFStage}>
              <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fOwner} onValueChange={setFOwner}>
              <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.username || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {oppView === "table" ? (
            <Card><CardContent className="p-0">
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Stage</TableHead>
                    <TableHead>Prob.</TableHead><TableHead>Close Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead><TableHead>Owner</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredOpps.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => nav(`/opportunities/${o.id}`)}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell>{o.type || "—"}</TableCell>
                        <TableCell><Badge className={stageColorClasses(stageMap[o.stage ?? ""]?.color)}>{o.stage || "—"}</Badge></TableCell>
                        <TableCell>{o.probability}%</TableCell>
                        <TableCell>{o.close_date ? format(new Date(o.close_date), "dd MMM yyyy") : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(o.amount), (o as any).currency)}</TableCell>
                        <TableCell>{o.owner_id ? usersMap[o.owner_id] ?? "—" : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {filteredOpps.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No opportunities.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <MobileCardList className="md:hidden p-3">
                {filteredOpps.map((o) => (
                  <MobileCard
                    key={o.id}
                    onClick={() => nav(`/opportunities/${o.id}`)}
                    title={o.name}
                    badge={<Badge className={stageColorClasses(stageMap[o.stage ?? ""]?.color)}>{o.stage || "—"}</Badge>}
                  >
                    <Field label="Type" value={o.type || "—"} />
                    <Field label="Prob." value={`${o.probability}%`} />
                    <Field label="Amount" value={formatCurrency(Number(o.amount), (o as any).currency)} />
                    <Field label="Close" value={o.close_date ? format(new Date(o.close_date), "dd MMM yy") : "—"} />
                    <Field label="Owner" full value={o.owner_id ? usersMap[o.owner_id] ?? "—" : "—"} />
                  </MobileCard>
                ))}
                {filteredOpps.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">No opportunities.</p>
                )}
              </MobileCardList>
            </CardContent></Card>

          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {stages.map((s) => {
                const col = filteredOpps.filter((o) => o.stage === s.name);
                return (
                  <div key={s.id} className="min-w-[280px] w-72 flex-shrink-0">
                    <div className="bg-muted/50 rounded-t-lg px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={stageColorClasses(s.color)}>{s.name}</Badge>
                        <span className="text-xs text-muted-foreground">{col.length}</span>
                      </div>
                      <span className="text-xs font-medium">{mixed(col)}</span>
                    </div>
                    <div
                      className="bg-muted/20 rounded-b-lg p-2 space-y-2 min-h-[200px]"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const oppId = e.dataTransfer.getData("text/plain");
                        if (oppId) updateOpp.mutate({ id: oppId, stage: s.name });
                      }}
                    >
                      {col.map((o) => (
                        <div key={o.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", o.id)}
                          onClick={() => nav(`/opportunities/${o.id}`)}
                          className="bg-card rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow"
                        >
                          <div className="font-medium text-sm truncate">{o.name}</div>
                          <div className="flex justify-between mt-2 text-xs">
                            <span>{o.probability}%</span>
                            <span className="font-medium">{formatCurrency(Number(o.amount), (o as any).currency)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* CONTACTS */}
        <TabsContent value="contacts" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button size="sm" variant={contactView === "list" ? "default" : "ghost"} onClick={() => setContactView("list")}>List</Button>
              <Button size="sm" variant={contactView === "org" ? "default" : "ghost"} onClick={() => setContactView("org")}>Org Chart</Button>
            </div>
            <Button size="sm" onClick={() => { setEditContact(null); setNewContact(true); }}>
              <Plus className="h-4 w-4 mr-1" />Add Contact
            </Button>
          </div>

          {contactView === "list" ? (
            <Card><CardContent className="p-0">
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Title</TableHead><TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead><TableHead>Reports To</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.title || "—"}</TableCell>
                        <TableCell>{c.email || "—"}</TableCell>
                        <TableCell>{c.phone || "—"}</TableCell>
                        <TableCell>{contacts.find((x) => x.id === c.reports_to_id)?.name ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setEditContact(c); setNewContact(true); }}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteContact.mutate(c.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {contacts.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No contacts yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <MobileCardList className="md:hidden p-3">
                {contacts.map((c) => (
                  <MobileCard
                    key={c.id}
                    title={c.name}
                    badge={c.title ? <Badge variant="outline" className="text-[10px]">{c.title}</Badge> : undefined}
                    actions={
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditContact(c); setNewContact(true); }}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteContact.mutate(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    }
                  >
                    <Field label="Email" full value={c.email || "—"} />
                    <Field label="Phone" value={c.phone || "—"} />
                    <Field label="Reports To" value={contacts.find((x) => x.id === c.reports_to_id)?.name ?? "—"} />
                  </MobileCard>
                ))}
                {contacts.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">No contacts yet.</p>
                )}
              </MobileCardList>
            </CardContent></Card>

          ) : (
            <Card><CardContent className="p-4">
              <ContactOrgChart contacts={contacts} />
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ACTIVITIES */}
        <TabsContent value="activities" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setNewAct(true)}><Plus className="h-4 w-4 mr-1" />New Activity</Button>
          </div>
          <Card><CardContent className="p-4 space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="border-l-2 border-primary/40 pl-3 py-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{a.subject}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(a.activity_date), "dd MMM yyyy")}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.type}{a.outcome ? ` · ${a.outcome}` : ""}{a.opportunity_id ? ` · ${oppMap[a.opportunity_id]?.name ?? "Opportunity"}` : ""}
                </div>
                {a.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{a.notes}</p>}
              </div>
            ))}
            {activities.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No activities yet.</p>}
          </CardContent></Card>
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <DocumentUpload customerId={customerId} />
          </div>
          <Card><CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>File</TableHead><TableHead>Linked To</TableHead><TableHead>Size</TableHead>
                  <TableHead>Uploaded By</TableHead><TableHead>Uploaded</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />{d.file_name}
                      </TableCell>
                      <TableCell>{d.opportunity_id ? oppMap[d.opportunity_id]?.name ?? "Opportunity" : "General"}</TableCell>
                      <TableCell>{d.file_size ? `${Math.round(d.file_size / 1024)} KB` : "—"}</TableCell>
                      <TableCell>{d.uploaded_by ? usersMap[d.uploaded_by] ?? "—" : "—"}</TableCell>
                      <TableCell>{format(new Date(d.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => downloadDoc(d.file_url, d.file_name)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteDoc.mutate({ id: d.id, fileUrl: d.file_url })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {docs.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No documents yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <MobileCardList className="md:hidden p-3">
              {docs.map((d) => (
                <MobileCard
                  key={d.id}
                  title={
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{d.file_name}</span>
                    </span>
                  }
                  badge={<Badge variant="secondary" className="text-[10px]">{d.opportunity_id ? oppMap[d.opportunity_id]?.name ?? "Opportunity" : "General"}</Badge>}
                  actions={
                    <>
                      <Button size="sm" variant="ghost" onClick={() => downloadDoc(d.file_url, d.file_name)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteDoc.mutate({ id: d.id, fileUrl: d.file_url })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  }
                >
                  <Field label="Size" value={d.file_size ? `${Math.round(d.file_size / 1024)} KB` : "—"} />
                  <Field label="Uploaded" value={format(new Date(d.created_at), "dd MMM yy")} />
                  <Field label="Uploaded By" full value={d.uploaded_by ? usersMap[d.uploaded_by] ?? "—" : "—"} />
                </MobileCard>
              ))}
              {docs.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">No documents yet.</p>
              )}
            </MobileCardList>
          </CardContent></Card>

        </TabsContent>

        {/* CONTACT ROLES */}
        <TabsContent value="contact-roles" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setRoleDialog({ open: true })}>
              <Plus className="h-4 w-4 mr-1" />Assign Contact Role
            </Button>
          </div>
          <Card><CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Contact Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {contactRoles.map((r) => {
                    const c = contacts.find((x) => x.id === r.contact_id);
                    const isPrimary = customer?.primary_contact_id === r.contact_id;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{c?.name ?? "—"}</TableCell>
                        <TableCell>{c?.title || "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{r.role}</Badge></TableCell>
                        <TableCell>
                          <Button
                            size="sm" variant={isPrimary ? "default" : "ghost"}
                            className={isPrimary ? "" : "text-muted-foreground"}
                            onClick={() => setPrimary.mutate({
                              customer_id: customerId,
                              contact_id: isPrimary ? null : r.contact_id,
                            })}
                          >
                            <Star className={`h-4 w-4 mr-1 ${isPrimary ? "fill-current" : ""}`} />
                            {isPrimary ? "Yes" : "No"}
                          </Button>
                        </TableCell>
                        <TableCell>{c?.email || "—"}</TableCell>
                        <TableCell>{c?.phone || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setRoleDialog({ open: true, row: r })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteRole.mutate({ id: r.id, customer_id: customerId })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {contactRoles.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No contact roles assigned yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <MobileCardList className="md:hidden p-3">
              {contactRoles.map((r) => {
                const c = contacts.find((x) => x.id === r.contact_id);
                const isPrimary = customer?.primary_contact_id === r.contact_id;
                return (
                  <MobileCard
                    key={r.id}
                    title={c?.name ?? "—"}
                    badge={<Badge variant="secondary" className="text-[10px]">{r.role}</Badge>}
                    actions={
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setRoleDialog({ open: true, row: r })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteRole.mutate({ id: r.id, customer_id: customerId })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    }
                  >
                    <Field label="Designation" value={c?.title || "—"} />
                    <Field label="Primary" value={isPrimary ? "Yes" : "No"} />
                    <Field label="Email" full value={c?.email || "—"} />
                    <Field label="Phone" value={c?.phone || "—"} />
                    <div className="col-span-2">
                      <Button
                        size="sm" variant={isPrimary ? "default" : "outline"} className="w-full"
                        onClick={() => setPrimary.mutate({
                          customer_id: customerId,
                          contact_id: isPrimary ? null : r.contact_id,
                        })}
                      >
                        <Star className={`h-4 w-4 mr-1 ${isPrimary ? "fill-current" : ""}`} />
                        {isPrimary ? "Primary Contact" : "Set as Primary"}
                      </Button>
                    </div>
                  </MobileCard>
                );
              })}
              {contactRoles.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">No contact roles assigned yet.</p>
              )}
            </MobileCardList>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <OpportunityForm open={newOpp} onOpenChange={setNewOpp} lockCustomerId={customerId} />
      <ContactForm open={newContact} onOpenChange={setNewContact} contact={editContact ?? undefined} customerId={customerId} />
      <ActivityForm open={newAct} onOpenChange={setNewAct} customerId={customerId} />

      <ContactRoleDialog
        open={roleDialog.open}
        onOpenChange={(o) => setRoleDialog({ open: o, row: o ? roleDialog.row : undefined })}
        contacts={contacts}
        assigned={contactRoles}
        row={roleDialog.row}
        onSave={(payload) => upsertRole.mutate(
          { id: roleDialog.row?.id, customer_id: customerId, ...payload },
          { onSuccess: () => setRoleDialog({ open: false }) },
        )}
      />


    </div>
  );
}

// ---------- Overview helpers ----------

const ACCENTS: Record<string, { border: string; bg: string; text: string; ring: string }> = {
  indigo:  { border: "border-l-indigo-500",  bg: "bg-indigo-100 dark:bg-indigo-900/30",   text: "text-indigo-600 dark:text-indigo-300",   ring: "ring-indigo-500/20" },
  blue:    { border: "border-l-blue-500",    bg: "bg-blue-100 dark:bg-blue-900/30",       text: "text-blue-600 dark:text-blue-300",       ring: "ring-blue-500/20" },
  emerald: { border: "border-l-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-300", ring: "ring-emerald-500/20" },
  violet:  { border: "border-l-violet-500",  bg: "bg-violet-100 dark:bg-violet-900/30",   text: "text-violet-600 dark:text-violet-300",   ring: "ring-violet-500/20" },
  amber:   { border: "border-l-amber-500",   bg: "bg-amber-100 dark:bg-amber-900/30",     text: "text-amber-600 dark:text-amber-300",     ring: "ring-amber-500/20" },
};

function KpiCard({
  label, value, icon: Icon, accent,
}: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent: keyof typeof ACCENTS }) {
  const a = ACCENTS[accent];
  return (
    <Card className={`border-l-4 ${a.border} shadow-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}>
      <CardContent className="p-3 flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${a.bg}`}>
          <Icon className={`h-5 w-5 ${a.text}`} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
          <div className="text-base md:text-lg font-bold mt-0.5 truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}

function WinRateGauge({ percent }: { percent: number }) {
  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} strokeWidth={stroke} className="stroke-muted" fill="none" />
        <circle
          cx={size/2} cy={size/2} r={r} strokeWidth={stroke}
          className="stroke-emerald-500 transition-all duration-700"
          strokeLinecap="round" fill="none"
          strokeDasharray={c} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-emerald-600">{percent}%</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Win Rate</span>
      </div>
    </div>
  );
}

function stageHex(color?: string) {
  switch (color) {
    case "blue":   return "hsl(217 91% 60%)";
    case "amber":  return "hsl(38 92% 50%)";
    case "green":  return "hsl(160 84% 39%)";
    case "red":    return "hsl(0 84% 60%)";
    case "purple": return "hsl(280 65% 60%)";
    default:       return "hsl(215 16% 55%)";
  }
}

function activityStyle(type?: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("call"))    return { icon: Phone,        bg: "bg-blue-100 dark:bg-blue-900/30",     text: "text-blue-600 dark:text-blue-300",       badge: "border-blue-300 text-blue-700 dark:text-blue-300" };
  if (t.includes("meeting")) return { icon: CalendarDays, bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-600 dark:text-violet-300",   badge: "border-violet-300 text-violet-700 dark:text-violet-300" };
  if (t.includes("email"))   return { icon: Mail,         bg: "bg-amber-100 dark:bg-amber-900/30",   text: "text-amber-600 dark:text-amber-300",     badge: "border-amber-300 text-amber-700 dark:text-amber-300" };
  if (t.includes("task"))    return { icon: CheckSquare,  bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-300", badge: "border-emerald-300 text-emerald-700 dark:text-emerald-300" };
  return                            { icon: StickyNote,  bg: "bg-slate-100 dark:bg-slate-800",      text: "text-slate-600 dark:text-slate-300",     badge: "border-slate-300 text-slate-700 dark:text-slate-300" };
}

function docStyle(fileName: string, fileType?: string | null) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const t = (fileType || "").toLowerCase();
  if (ext === "pdf" || t.includes("pdf"))
    return { icon: FileText, bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-600 dark:text-rose-300" };
  if (["xls", "xlsx", "csv"].includes(ext) || t.includes("sheet") || t.includes("excel"))
    return { icon: FileSpreadsheet, bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-300" };
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext) || t.startsWith("image"))
    return { icon: FileImage, bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-300" };
  return { icon: FileIcon, bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300" };
}


function ContactRoleDialog({
  open, onOpenChange, contacts, assigned, row, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contacts: any[];
  assigned: any[];
  row?: any;
  onSave: (p: { contact_id: string; role: string }) => void;
}) {
  const [contactId, setContactId] = useState<string>("");
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    if (open) {
      setContactId(row?.contact_id ?? "");
      setRole(row?.role ?? "");
    }
  }, [open, row]);

  const takenRoles = new Set(
    assigned
      .filter((a) => a.contact_id === contactId && a.id !== row?.id)
      .map((a) => a.role),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? "Edit Contact Role" : "Assign Contact Role"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact</label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.title ? ` — ${c.title}` : ""}
                  </SelectItem>
                ))}
                {contacts.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No contacts. Add one from the Contacts tab first.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {CONTACT_ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r} disabled={takenRoles.has(r)}>
                    {r}{takenRoles.has(r) ? " (already assigned)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!contactId || !role}
            onClick={() => onSave({ contact_id: contactId, role })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
