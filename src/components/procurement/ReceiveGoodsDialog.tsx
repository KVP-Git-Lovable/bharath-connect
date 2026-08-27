import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import GRNForm, { type POItem } from "./GRNForm";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string;
  currentUserId?: string;
  onSaved?: () => void;
}

/** Loads a PO (items, products, already-received) and opens the GRN form to receive goods. */
export default function ReceiveGoodsDialog({ open, onOpenChange, poId, currentUserId, onSaved }: Props) {
  const [poNumber, setPoNumber] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [items, setItems] = useState<POItem[]>([]);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setReady(false);
    const { data: po } = await supabase
      .from("procurement_orders")
      .select("po_number, vendor_id, procurement_items(id, product_id, rate, qty, uom)")
      .eq("id", poId)
      .single();
    const its: POItem[] = ((po as any)?.procurement_items || []).map((it: any) => ({
      id: it.id, product_id: it.product_id, rate: Number(it.rate || 0), qty: Number(it.qty || 0), uom: it.uom,
    }));
    setPoNumber((po as any)?.po_number || "(No PO #)");
    setVendorId((po as any)?.vendor_id || null);
    setItems(its);

    const productIds = [...new Set(its.filter((i) => i.product_id).map((i) => i.product_id as string))];
    if (productIds.length) {
      const { data: prods } = await supabase.from("master_products").select("id, name").in("id", productIds);
      const pmap: Record<string, string> = {};
      (prods || []).forEach((p: any) => { pmap[p.id] = p.name; });
      setProducts(pmap);
    }

    const { data: grns } = await supabase
      .from("procurement_grns")
      .select("procurement_grn_items(procurement_item_id, received_qty)")
      .eq("po_id", poId);
    const rmap: Record<string, number> = {};
    ((grns || []) as any[]).forEach((g) => {
      (g.procurement_grn_items || []).forEach((gi: any) => {
        if (gi.procurement_item_id) rmap[gi.procurement_item_id] = (rmap[gi.procurement_item_id] || 0) + Number(gi.received_qty || 0);
      });
    });
    setReceived(rmap);
    setReady(true);
  }, [poId]);

  useEffect(() => { if (open && poId) load(); }, [open, poId, load]);

  const productName = useMemo(() => (id: string | null) => (id ? products[id] || "Product" : "Product"), [products]);

  if (!open || !ready) return null;

  return (
    <GRNForm
      open={open}
      onOpenChange={onOpenChange}
      poId={poId}
      poNumber={poNumber}
      vendorId={vendorId}
      items={items}
      alreadyReceived={received}
      productName={productName}
      createdBy={currentUserId}
      onSaved={() => { onSaved?.(); }}
    />
  );
}
