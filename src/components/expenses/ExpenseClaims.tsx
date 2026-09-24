import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, RefreshCw, Send, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  type Claim, type ClaimLine, LINE_LABEL, inr,
  addPettyCash, decideClaim, getOrCreateDraft, listClaims, loadLines, refreshAutoLines, removeLine, submitClaim,
} from "@/utils/expenseClaims";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline", submitted: "secondary", approved: "default", rejected: "destructive",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"} className="capitalize">{status}</Badge>;
}

function LineList({ lines, editable, onRemove }: { lines: ClaimLine[]; editable: boolean; onRemove?: (id: string) => void }) {
  if (!lines.length) return <p className="py-4 text-center text-sm text-muted-foreground">No lines yet.</p>;
  return (
    <div className="divide-y rounded-md border">
      {lines.map((l) => (
        <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <Badge variant="outline" className="shrink-0">{LINE_LABEL[l.line_type]}</Badge>
          <div className="min-w-0 flex-1">
            <p className="truncate">{l.description || "—"}</p>
            <p className="text-xs text-muted-foreground">
              {l.distance_km != null && `${Number(l.distance_km).toFixed(1)} km`}
              {l.distance_km != null && l.minutes != null && " · "}
              {l.minutes != null && `${l.minutes} min`}
            </p>
          </div>
          <span className="shrink-0 font-medium">{inr(l.amount)}</span>
          {editable && l.line_type === "petty_cash" && onRemove && l.id && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemove(l.id!)} aria-label="Remove line">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ExpenseClaims() {
  const { data: me } = useCurrentUser();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [claim, setClaim] = useState<Claim | null>(null);
  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [pcDesc, setPcDesc] = useState("");
  const [pcAmt, setPcAmt] = useState("");
  const [mine, setMine] = useState<Claim[]>([]);
  const [toApprove, setToApprove] = useState<Claim[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [review, setReview] = useState<{ claim: Claim; lines: ClaimLine[] } | null>(null);
  const [reason, setReason] = useState("");

  const loadLists = useCallback(async () => {
    if (!me) return;
    const [my, pending] = await Promise.all([
      listClaims({ userIds: [me.id] }),
      listClaims({ status: "submitted" }),
    ]);
    setMine(my.slice(0, 30));
    const others = pending.filter((c) => c.user_id !== me.id);
    setToApprove(others);
    const ids = Array.from(new Set(others.map((c) => c.user_id)));
    if (ids.length) {
      const { data } = await supabase.from("users").select("id, full_name").in("id", ids);
      setNames(new Map((data || []).map((u) => [u.id, u.full_name || "Unknown"])));
    }
  }, [me]);

  useEffect(() => { loadLists().catch(() => toast.error("Failed to load claims")); }, [loadLists]);

  const openClaim = async (d = date) => {
    if (!me) return;
    setBusy(true);
    try {
      const c = await getOrCreateDraft(me.id, d);
      let ls = await loadLines(c.id);
      if (!ls.length && (c.status === "draft" || c.status === "rejected")) {
        await refreshAutoLines(c);
        ls = await loadLines(c.id);
      }
      setClaim({ ...c, total_amount: ls.reduce((s, l) => s + l.amount, 0) });
      setLines(ls);
      loadLists();
    } catch (e: any) {
      toast.error(e?.message || "Could not open the claim");
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    if (!claim) return;
    const ls = await loadLines(claim.id);
    setLines(ls);
    setClaim({ ...claim, total_amount: ls.reduce((s, l) => s + l.amount, 0) });
  };

  const editable = claim?.status === "draft" || claim?.status === "rejected";

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); } catch (e: any) { toast.error(e?.message || "Something went wrong"); }
    finally { setBusy(false); }
  };

  const openReview = async (c: Claim) => setReview({ claim: c, lines: await loadLines(c.id) });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Claim for a day</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="claim-date">Date</Label>
              <Input id="claim-date" type="date" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </div>
            <Button onClick={() => openClaim()} disabled={busy || !me}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Open claim
            </Button>
          </div>

          {claim && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{format(new Date(claim.claim_date), "dd MMM yyyy")}</span>
                  <StatusBadge status={claim.status} />
                </div>
                <span className="text-lg font-bold">{inr(claim.total_amount)}</span>
              </div>
              {claim.status === "rejected" && claim.rejection_reason && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">Rejected: {claim.rejection_reason}</p>
              )}
              <LineList lines={lines} editable={editable} onRemove={(id) => run(async () => { await removeLine(claim.id, id); await reload(); })} />

              {editable && (
                <>
                  <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/50 p-3">
                    <div className="min-w-40 flex-1 space-y-1">
                      <Label htmlFor="pc-desc">Petty cash spent on</Label>
                      <Input id="pc-desc" value={pcDesc} onChange={(e) => setPcDesc(e.target.value)} placeholder="e.g. Tea for site team" />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label htmlFor="pc-amt">Amount</Label>
                      <Input id="pc-amt" type="number" min="0" value={pcAmt} onChange={(e) => setPcAmt(e.target.value)} />
                    </div>
                    <Button variant="outline" disabled={busy || !pcDesc.trim() || !(Number(pcAmt) > 0)}
                      onClick={() => run(async () => { await addPettyCash(claim.id, pcDesc.trim(), Number(pcAmt)); setPcDesc(""); setPcAmt(""); await reload(); })}>
                      <Plus className="mr-1 h-4 w-4" />Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => run(async () => { await refreshAutoLines(claim); await reload(); }, "Lines refreshed from activities")}>
                      <RefreshCw className="mr-1 h-4 w-4" />Refresh from activities
                    </Button>
                    <Button disabled={busy || !lines.length} onClick={() => run(async () => { await submitClaim(claim.id); await openClaim(claim.claim_date); }, "Claim sent to your manager")}>
                      <Send className="mr-1 h-4 w-4" />Submit claim
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {toApprove.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Waiting for your approval ({toApprove.length})</CardTitle></CardHeader>
          <CardContent className="divide-y p-0">
            {toApprove.map((c) => (
              <button key={c.id} onClick={() => openReview(c)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50">
                <span><span className="font-medium">{names.get(c.user_id) || "Employee"}</span> · {format(new Date(c.claim_date), "dd MMM yyyy")}</span>
                <span className="font-semibold">{inr(c.total_amount)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">My claims</CardTitle></CardHeader>
        <CardContent className="divide-y p-0">
          {mine.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No claims yet.</p>}
          {mine.map((c) => (
            <button key={c.id} onClick={() => { setDate(c.claim_date); openClaim(c.claim_date); }} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-muted/50">
              <span>{format(new Date(c.claim_date), "dd MMM yyyy")}</span>
              <span className="flex items-center gap-2"><StatusBadge status={c.status} /><span className="font-semibold">{inr(c.total_amount)}</span></span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!review} onOpenChange={(o) => { if (!o) { setReview(null); setReason(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {review && `${names.get(review.claim.user_id) || "Employee"} · ${format(new Date(review.claim.claim_date), "dd MMM yyyy")}`}
            </DialogTitle>
          </DialogHeader>
          {review && (
            <div className="space-y-3">
              <LineList lines={review.lines} editable={false} />
              <div className="flex justify-between font-semibold"><span>Total</span><span>{inr(review.claim.total_amount)}</span></div>
              <Textarea placeholder="Reason (needed to reject)" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="destructive" disabled={busy || !reason.trim()}
              onClick={() => review && run(async () => { await decideClaim(review.claim.id, false, reason.trim()); setReview(null); setReason(""); await loadLists(); }, "Claim rejected")}>
              <XCircle className="mr-1 h-4 w-4" />Reject
            </Button>
            <Button disabled={busy}
              onClick={() => review && run(async () => { await decideClaim(review.claim.id, true); setReview(null); setReason(""); await loadLists(); }, "Claim approved")}>
              <CheckCircle2 className="mr-1 h-4 w-4" />Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
