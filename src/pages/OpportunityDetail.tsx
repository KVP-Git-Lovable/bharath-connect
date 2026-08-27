import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, FileText, Trash2, Download, Copy } from "lucide-react";
import {
  useOpportunity, useMilestones, useUpdateMilestone, useDeleteMilestone,
  useCustomerActivities, useCustomerDocuments, useDeleteCustomerDocument,
  useOppStages, useOppTypes, useUserLookup, useCustomers, stageColorClasses,
  useQuotes, useDeleteQuote, useToggleQuoteSync, useCloneQuote,
  useUpdateOpportunity,
} from "@/hooks/useCustomers";
import { QuoteForm } from "@/components/customers/QuoteForm";
import { MobileCardList, MobileCard, Field as MField } from "@/components/ui/mobile-card";


import { MilestoneForm } from "@/components/customers/MilestoneForm";
import { ActivityForm } from "@/components/customers/ActivityForm";
import { DocumentUpload } from "@/components/customers/DocumentUpload";
import { OpportunityForm } from "@/components/customers/OpportunityForm";
import { OpportunityHealthTab } from "@/components/customers/OpportunityHealthTab";
import { OpportunityBantTab } from "@/components/customers/OpportunityBantTab";
import { InlineEditField } from "@/components/customers/InlineEditField";
import { useCurrencies, usePaymentTerms, currencySymbol } from "@/hooks/useOpportunityMasters";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const MILESTONE_STATUSES = ["Pending", "Invoiced", "Paid"];

function money(sym: string, n: number) { return `${sym} ${(n ?? 0).toLocaleString()}`; }

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: opp } = useOpportunity(id);
  const { data: milestones = [] } = useMilestones(id);
  const { data: activities = [] } = useCustomerActivities(id);
  const { data: docs = [] } = useCustomerDocuments(id);
  const { data: quotes = [] } = useQuotes(id);
  const deleteQuote = useDeleteQuote();
  const cloneQuote = useCloneQuote();
  const toggleSync = useToggleQuoteSync();
  const { data: stages = [] } = useOppStages();
  const { data: types = [] } = useOppTypes();
  const { data: users = [] } = useUserLookup();
  const { data: customers = [] } = useCustomers();
  const { data: currencies = [] } = useCurrencies(false);
  const { data: paymentTerms = [] } = usePaymentTerms(false);
  const updateOpp = useUpdateOpportunity();
  const saveField = (field: string) => async (value: any) => {
    await updateOpp.mutateAsync({ id: id!, [field]: value } as any);
  };
  const sym = currencySymbol(currencies, (opp as any)?.currency);
  const inr = (n: number) => money(sym, n);
  const usersMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])), [users]);
  const customersMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);

  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);
  const updateMs = useUpdateMilestone();
  const deleteMs = useDeleteMilestone();
  const deleteDoc = useDeleteCustomerDocument();

  const [addMs, setAddMs] = useState(false);
  const [newAct, setNewAct] = useState(false);
  const [editOpp, setEditOpp] = useState(false);
  const [quoteEditor, setQuoteEditor] = useState<{ mode: "new" | "edit"; quoteId?: string } | null>(null);
  const editingQuote = quoteEditor?.mode === "edit" ? quotes.find((q) => q.id === quoteEditor.quoteId) : null;

  const total = milestones.reduce((s, m) => s + Number(m.invoice_value || 0), 0);

  const downloadDoc = async (path: string, name: string) => {
    const { data } = await supabase.storage.from("customer-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) {
      const a = document.createElement("a"); a.href = data.signedUrl; a.download = name; a.click();
    }
  };

  if (!opp) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => nav(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Back
      </Button>

      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{opp.name}</h1>
              <p className="text-sm text-muted-foreground">{opp.type || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={stageColorClasses(stageMap[opp.stage ?? ""]?.color)}>{opp.stage || "—"}</Badge>
              <Button size="sm" variant="outline" onClick={() => setEditOpp(true)}>Edit</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
          <TabsTrigger value="milestones">Payment Milestones</TabsTrigger>
          <TabsTrigger value="health">Health Analysis</TabsTrigger>
          <TabsTrigger value="bant">BANT Analysis</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <OpportunityHealthTab opp={opp} />
        </TabsContent>

        <TabsContent value="bant" className="mt-4">
          <OpportunityBantTab opp={opp} />
        </TabsContent>


        <TabsContent value="overview" className="mt-4">
          <Card><CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <InlineEditField
                label="Opportunity Name"
                value={opp.name}
                onSave={saveField("name")}
              />
              <InlineEditField
                label="Customer / Account"
                type="select"
                value={opp.customer_id}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                display={
                  opp.customer_id ? (
                    <Link to={`/customers/${opp.customer_id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                      {customersMap[opp.customer_id] ?? "—"}
                    </Link>
                  ) : undefined
                }
                onSave={saveField("customer_id")}
              />
              <InlineEditField
                label="Type"
                type="select"
                value={opp.type}
                options={types.map((t: any) => ({ value: t.name, label: t.name }))}
                onSave={saveField("type")}
              />
              <InlineEditField
                label="Stage"
                type="select"
                value={opp.stage}
                options={stages.map((s: any) => ({ value: s.name, label: s.name }))}
                display={opp.stage ? <Badge className={stageColorClasses(stageMap[opp.stage]?.color)}>{opp.stage}</Badge> : undefined}
                onSave={saveField("stage")}
              />
              <InlineEditField
                label="Probability"
                type="number"
                value={opp.probability}
                display={<>{opp.probability}%</>}
                onSave={saveField("probability")}
              />
              <InlineEditField
                label="Close Date"
                type="date"
                value={opp.close_date ? format(new Date(opp.close_date), "yyyy-MM-dd") : ""}
                display={opp.close_date ? format(new Date(opp.close_date), "dd MMM yyyy") : undefined}
                onSave={saveField("close_date")}
              />
              <InlineEditField
                label="Amount"
                type="number"
                value={opp.amount}
                display={<>{inr(Number(opp.amount))}</>}
                onSave={saveField("amount")}
              />
              <InlineEditField
                label="Currency"
                type="select"
                value={(opp as any).currency || "INR"}
                options={currencies.map((c) => ({ value: c.code, label: `${c.code} (${c.symbol})` }))}
                onSave={saveField("currency")}
              />
              <InlineEditField
                label="Payment Terms"
                type="select"
                value={(opp as any).payment_terms}
                options={paymentTerms.map((p) => ({ value: p.name, label: p.name }))}
                onSave={saveField("payment_terms")}
              />
              <InlineEditField
                label="Owner"
                type="select"
                value={opp.owner_id}
                options={users.map((u: any) => ({ value: u.id, label: u.full_name || u.username || u.email }))}
                display={opp.owner_id ? <>{usersMap[opp.owner_id] ?? "—"}</> : undefined}
                onSave={saveField("owner_id")}
              />
            </div>
            <div className="mt-6 pt-4 border-t">
              <InlineEditField
                label="Requirements Highlights"
                type="textarea"
                fullWidth
                value={(opp as any).requirements_highlights}
                display={
                  (opp as any).requirements_highlights ? (
                    <p className="text-sm whitespace-pre-wrap font-normal">{(opp as any).requirements_highlights}</p>
                  ) : undefined
                }
                onSave={saveField("requirements_highlights")}
              />
            </div>
          </CardContent></Card>
        </TabsContent>


        <TabsContent value="quotes" className="mt-4 space-y-3">
          {quoteEditor ? (
            <QuoteForm
              opportunityId={id!}
              quote={editingQuote}
              onClose={() => setQuoteEditor(null)}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{quotes.length} quote{quotes.length === 1 ? "" : "s"}</div>
                <Button size="sm" onClick={() => setQuoteEditor({ mode: "new" })}>
                  <Plus className="h-4 w-4 mr-1" />New Quote
                </Button>
              </div>
              {quotes.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No quotes yet.</CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {quotes.map((q) => {
                    const items = (q as any).items || [];
                    const sorted = [...items].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                    const names = sorted.map((it: any) => it.product_name).filter(Boolean);
                    const preview = names.length === 0 ? "No items"
                      : names.length <= 2 ? names.join(", ")
                      : `${names.slice(0, 2).join(", ")}, +${names.length - 2} more`;
                    const edited = q.updated_at && new Date(q.updated_at).getTime() - new Date(q.created_at).getTime() > 60_000;
                    return (
                      <Card
                        key={q.id}
                        className={`cursor-pointer hover:shadow-md transition-shadow rounded-xl ${q.is_synced ? "ring-2 ring-primary/60" : ""}`}
                        onClick={() => setQuoteEditor({ mode: "edit", quoteId: q.id })}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold truncate">{q.name}</h3>
                                {q.is_synced && (
                                  <Badge className="bg-primary text-primary-foreground text-xs">Synced</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{preview}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-semibold">{inr(Number(q.total))}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {items.length} product{items.length === 1 ? "" : "s"}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <span>Created {format(new Date(q.created_at), "dd MMM yyyy")}</span>
                            {edited && <span>· Updated {format(new Date(q.updated_at), "dd MMM yyyy")}</span>}
                            {Number(q.overall_discount_pct) > 0 && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                {Number(q.overall_discount_pct)}% off
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant={q.is_synced ? "default" : "outline"}
                              onClick={() => toggleSync.mutate({ id: q.id, oppId: id!, sync: !q.is_synced })}
                              disabled={toggleSync.isPending}
                            >
                              {q.is_synced ? "Synced ✓" : "Sync to Opportunity"}
                            </Button>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => cloneQuote.mutate({ id: q.id, oppId: id! })} disabled={cloneQuote.isPending} title="Clone quote">
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteQuote.mutate({ id: q.id, oppId: id! })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

            </>
          )}
        </TabsContent>



        <TabsContent value="milestones" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Total Invoiced Value:</span>{" "}
              <span className="font-semibold text-base">{inr(total)}</span>
            </div>
            <Button size="sm" onClick={() => setAddMs(true)}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </div>
          <Card><CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Invoice #</TableHead><TableHead>Invoice Date</TableHead>
                  <TableHead className="text-right">Invoice Value</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {milestones.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.invoice_number || "—"}</TableCell>
                      <TableCell>{m.invoice_date ? format(new Date(m.invoice_date), "dd MMM yyyy") : "—"}</TableCell>
                      <TableCell className="text-right">{inr(Number(m.invoice_value))}</TableCell>
                      <TableCell>
                        <Select value={m.status} onValueChange={(v) => updateMs.mutate({ id: m.id, status: v, opportunity_id: m.opportunity_id })}>
                          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{MILESTONE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => deleteMs.mutate({ id: m.id, oppId: id! })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {milestones.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No milestones yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <MobileCardList className="md:hidden p-3">
              {milestones.map((m) => (
                <MobileCard
                  key={m.id}
                  title={m.name}
                  badge={<Badge variant="outline">{m.status}</Badge>}
                  actions={
                    <>
                      <Select value={m.status} onValueChange={(v) => updateMs.mutate({ id: m.id, status: v, opportunity_id: m.opportunity_id })}>
                        <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{MILESTONE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => deleteMs.mutate({ id: m.id, oppId: id! })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  }
                >
                  <MField label="Invoice #" value={m.invoice_number || "—"} />
                  <MField label="Invoice Date" value={m.invoice_date ? format(new Date(m.invoice_date), "dd MMM yy") : "—"} />
                  <MField label="Value" full value={inr(Number(m.invoice_value))} />
                </MobileCard>
              ))}
              {milestones.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">No milestones yet.</p>
              )}
            </MobileCardList>
          </CardContent></Card>

        </TabsContent>

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
                <div className="text-xs text-muted-foreground">{a.type}</div>
                {a.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{a.notes}</p>}
              </div>
            ))}
            {activities.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No activities yet.</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <DocumentUpload opportunityId={id!} />
          </div>
          <Card><CardContent className="p-0">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>File</TableHead><TableHead>Size</TableHead>
                  <TableHead>Uploaded By</TableHead><TableHead>Uploaded</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />{d.file_name}
                      </TableCell>
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
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No documents yet.</TableCell></TableRow>
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
                  <MField label="Size" value={d.file_size ? `${Math.round(d.file_size / 1024)} KB` : "—"} />
                  <MField label="Uploaded" value={format(new Date(d.created_at), "dd MMM yy")} />
                  <MField label="Uploaded By" full value={d.uploaded_by ? usersMap[d.uploaded_by] ?? "—" : "—"} />
                </MobileCard>
              ))}
              {docs.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">No documents yet.</p>
              )}
            </MobileCardList>
          </CardContent></Card>

        </TabsContent>
      </Tabs>

      <MilestoneForm open={addMs} onOpenChange={setAddMs} opportunityId={id!} />
      <ActivityForm open={newAct} onOpenChange={setNewAct} opportunityId={id!} lockOpportunity />
      <OpportunityForm open={editOpp} onOpenChange={setEditOpp} opportunity={opp} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
