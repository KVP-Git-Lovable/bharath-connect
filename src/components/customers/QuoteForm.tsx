import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, X, ChevronsUpDown, Pencil, Link2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useMasterProducts, useQuoteItems, useSaveQuote, useAddMasterProduct, type Quote, type QuoteItem } from "@/hooks/useCustomers";
import { useUomOptions } from "@/hooks/useUomOptions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


function inr(n: number) { return `₹ ${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }

function calcLine(qty: number, unit: number, disc: number) {
  return Math.max(0, Number(qty) || 0) * Math.max(0, Number(unit) || 0) * (1 - Math.min(100, Math.max(0, Number(disc) || 0)) / 100);
}

const emptyRow = (i: number): QuoteItem => ({
  product_id: null, product_name: null, qty: 1, unit_price: 0, uom: null,
  start_date: null, end_date: null, term_months: null, discount_pct: 0, total: 0, sort_order: i,
});

export function QuoteForm({
  opportunityId, quote, onClose,
}: { opportunityId: string; quote?: Quote | null; onClose: () => void; }) {
  const { data: products = [] } = useMasterProducts();
  const { data: uoms = [] } = useUomOptions(true);
  const { data: existingItems } = useQuoteItems(quote?.id);
  const save = useSaveQuote();
  const addMaster = useAddMasterProduct();
  const [name, setName] = useState(quote?.name || "");
  const [notes, setNotes] = useState(quote?.notes || "");
  const [overallDisc, setOverallDisc] = useState<number>(Number(quote?.overall_discount_pct) || 0);
  const [isSynced, setIsSynced] = useState<boolean>(!!quote?.is_synced);
  const [rows, setRows] = useState<QuoteItem[]>([emptyRow(0)]);
  const [saveToMaster, setSaveToMaster] = useState<Record<number, boolean>>({ 0: false });


  useEffect(() => {
    if (quote && existingItems && existingItems.length) setRows(existingItems);
  }, [quote?.id, existingItems]);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + calcLine(r.qty, r.unit_price, r.discount_pct), 0), [rows]);
  const overallAmt = subtotal * (Math.min(100, Math.max(0, overallDisc)) / 100);
  const grandTotal = subtotal - overallAmt;

  const update = (i: number, patch: Partial<QuoteItem>) => {
    setRows((prev) => {
      const next = [...prev];
      const merged = { ...next[i], ...patch };
      merged.total = calcLine(merged.qty, merged.unit_price, merged.discount_pct);
      next[i] = merged;
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim()) return;
    const working = [...rows];
    // Persist free-text products to master when user opted in
    for (let i = 0; i < working.length; i++) {
      const r = working[i];
      if (!r.product_id && r.product_name && r.product_name.trim() && saveToMaster[i]) {
        try {
          const created = await addMaster.mutateAsync({
            product_name: r.product_name.trim(),
            default_unit_price: Number(r.unit_price) || 0,
          });
          working[i] = { ...r, product_id: created.id, product_name: created.product_name };
        } catch (e) {
          // If save-to-master fails (e.g. duplicate), keep as free-text and continue
          console.warn("Add to master failed", e);
        }
      }
    }
    const items = working.filter((r) => r.product_id || (r.product_name && r.product_name.trim()));
    await save.mutateAsync({
      id: quote?.id,
      opportunity_id: opportunityId,
      name: name.trim(),
      notes: notes.trim() || null,
      total: grandTotal,
      overall_discount_pct: Number(overallDisc) || 0,
      is_synced: isSynced,
      items: items.map((r, i) => ({
        ...r,
        sort_order: i,
        start_date: null,
        end_date: null,
        term_months: null,
        total: calcLine(r.qty, r.unit_price, r.discount_pct),
      })),
    });
    onClose();
  };


  return (
    <Card>
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Label>Quote Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Initial Quote" />
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">Sync to Opportunity</div>
              <div className="text-xs text-muted-foreground">Use this quote's total as the Opportunity Amount</div>
            </div>
          </div>
          <Switch checked={isSynced} onCheckedChange={setIsSynced} />
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Product</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="w-28">UOM</TableHead>
                <TableHead className="w-36">Unit Price</TableHead>
                <TableHead className="w-28">Disc %</TableHead>
                <TableHead className="w-32 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const isCustom = !!(r.product_name && !r.product_id);
                return (
                <Fragment key={i}>
                <TableRow>
                  <TableCell>
                    <ProductPicker
                      products={products}
                      productId={r.product_id}
                      productName={r.product_name}
                      onPickProduct={(p) => update(i, { product_id: p.id, product_name: p.product_name, unit_price: Number(p.default_unit_price) || 0, uom: p.default_uom ?? r.uom ?? null })}
                      onFreeText={(txt) => update(i, { product_id: null, product_name: txt })}
                    />
                  </TableCell>
                  <TableCell><NumberInput min={0} className="w-full min-w-[70px]" value={r.qty} onValueChange={(v) => update(i, { qty: v })} /></TableCell>
                  <TableCell>
                    <UomPicker uoms={uoms} value={r.uom} onChange={(v) => update(i, { uom: v })} />
                  </TableCell>
                  <TableCell><NumberInput min={0} step="0.01" className="w-full min-w-[110px]" value={r.unit_price} onValueChange={(v) => update(i, { unit_price: v })} /></TableCell>
                  <TableCell><NumberInput min={0} max={100} className="w-full min-w-[80px]" value={r.discount_pct} onValueChange={(v) => update(i, { discount_pct: v })} /></TableCell>
                  <TableCell className="text-right font-medium">{inr(calcLine(r.qty, r.unit_price, r.discount_pct))}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
                {isCustom && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-1 border-0">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pl-1">
                        <Checkbox
                          checked={saveToMaster[i] ?? false}
                          onCheckedChange={(v) => setSaveToMaster((s) => ({ ...s, [i]: !!v }))}
                        />
                        Also add <span className="font-medium text-foreground">"{r.product_name}"</span> to Product Master
                      </label>
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>

                );
              })}
            </TableBody>
          </Table>
        </div>


        {/* Mobile stacked cards */}
        <div className="md:hidden space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-3 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Item {i + 1}</span>
                <Button variant="ghost" size="sm" className="h-7 -mr-2" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div>
                <Label className="text-xs">Product</Label>
                <ProductPicker
                  products={products}
                  productId={r.product_id}
                  productName={r.product_name}
                  onPickProduct={(p) => update(i, { product_id: p.id, product_name: p.product_name, unit_price: Number(p.default_unit_price) || 0, uom: p.default_uom ?? r.uom ?? null })}
                  onFreeText={(txt) => update(i, { product_id: null, product_name: txt })}
                />
              </div>
              {r.product_name && !r.product_id && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={saveToMaster[i] ?? false}
                    onCheckedChange={(v) => setSaveToMaster((s) => ({ ...s, [i]: !!v }))}
                  />
                  Also add <span className="font-medium text-foreground">"{r.product_name}"</span> to Product Master
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Qty</Label>
                  <NumberInput min={0} value={r.qty} onValueChange={(v) => update(i, { qty: v })} />
                </div>
                <div>
                  <Label className="text-xs">UOM</Label>
                  <UomPicker uoms={uoms} value={r.uom} onChange={(v) => update(i, { uom: v })} />
                </div>
                <div>
                  <Label className="text-xs">Unit Price</Label>
                  <NumberInput min={0} step="0.01" value={r.unit_price} onValueChange={(v) => update(i, { unit_price: v })} />
                </div>
                <div>
                  <Label className="text-xs">Disc %</Label>
                  <NumberInput min={0} max={100} value={r.discount_pct} onValueChange={(v) => update(i, { discount_pct: v })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Total</Label>
                  <div className="h-10 flex items-center justify-end font-semibold">{inr(calcLine(r.qty, r.unit_price, r.discount_pct))}</div>
                </div>
              </div>
            </div>

          ))}
        </div>


        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={() => setRows((prev) => { setSaveToMaster((s) => ({ ...s, [prev.length]: false })); return [...prev, emptyRow(prev.length)]; })}>
            <Plus className="h-4 w-4 mr-1" />Add Line
          </Button>
          <div className="flex flex-col items-end gap-1 text-sm min-w-[240px]">
            <div className="flex justify-between w-full">
              <span className="text-muted-foreground">Subtotal:</span>
              <span>{inr(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-muted-foreground">Overall Discount %:</span>
              <NumberInput
                min={0} max={100} className="h-8 w-20 text-right"
                value={overallDisc}
                onValueChange={(v) => setOverallDisc(v)}
              />
            </div>
            {overallDisc > 0 && (
              <div className="flex justify-between w-full text-muted-foreground">
                <span>Discount:</span>
                <span>- {inr(overallAmt)}</span>
              </div>
            )}
            <div className="flex justify-between w-full pt-1 border-t">
              <span className="font-medium">Quote Total:</span>
              <span className="font-semibold text-base">{inr(grandTotal)}</span>
            </div>
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || save.isPending}>Save Quote</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductPicker({
  products, productId, productName, onPickProduct, onFreeText,
}: {
  products: { id: string; product_name: string; default_unit_price: number; default_uom?: string | null }[];
  productId: string | null;
  productName: string | null;
  onPickProduct: (p: { id: string; product_name: string; default_unit_price: number; default_uom?: string | null }) => void;
  onFreeText: (txt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [freeMode, setFreeMode] = useState<boolean>(!!productName && !productId);
  const [search, setSearch] = useState("");
  const display = productName || "Select product";

  if (freeMode) {
    return (
      <div className="flex gap-1">
        <Input
          value={productName || ""}
          placeholder="Enter product name"
          onChange={(e) => onFreeText(e.target.value)}
          autoFocus
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => { setFreeMode(false); onFreeText(""); }} title="Pick from list">
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
            <span className="truncate">{display}</span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[300px]" align="start">
          <Command>
            <CommandInput placeholder="Search product..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>
                <div className="p-2 text-sm">
                  <div className="text-muted-foreground mb-2">No products found.</div>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => { setFreeMode(true); onFreeText(search); setOpen(false); }}>
                    <Pencil className="h-3 w-3 mr-1" />Use "{search}" as custom
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {products.map((p) => (
                  <CommandItem key={p.id} value={p.product_name} onSelect={() => { onPickProduct(p); setOpen(false); }}>
                    <div className="flex justify-between w-full">
                      <span>{p.product_name}</span>
                      <span className="text-xs text-muted-foreground">₹{Number(p.default_unit_price || 0).toLocaleString()}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <div className="border-t p-2">
                <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => { setFreeMode(true); onFreeText(""); setOpen(false); }}>
                  <Pencil className="h-3 w-3 mr-1" />Enter custom product
                </Button>
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function UomPicker({
  uoms, value, onChange,
}: {
  uoms: { id: string; uom_name: string; short_code: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  const hasInactive = !!value && !uoms.some((u) => u.short_code === value);
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className="w-full min-w-[90px]">
        <SelectValue placeholder="UOM" />
      </SelectTrigger>
      <SelectContent>
        {uoms.map((u) => (
          <SelectItem key={u.id} value={u.short_code}>
            {u.short_code} — {u.uom_name}
          </SelectItem>
        ))}
        {hasInactive && <SelectItem value={value!}>{value} (inactive)</SelectItem>}
      </SelectContent>
    </Select>
  );
}
