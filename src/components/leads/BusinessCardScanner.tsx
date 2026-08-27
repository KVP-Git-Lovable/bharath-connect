import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScanLine, Loader2, Camera, Upload, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CameraCapture from "@/components/CameraCapture";

export interface ScannedCard {
  name?: string; title?: string; company?: string;
  email?: string; phone?: string; website?: string; address?: string;
}

export function BusinessCardScanner({ onScanned }: { onScanned: (data: ScannedCard, uploadedPath: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const processBlob = async (blob: Blob, ext: string) => {
    setBusy(true);
    try {
      const path = `leads/cards/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("customer-documents").upload(path, blob);
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage.from("customer-documents").createSignedUrl(path, 300);
      if (sErr) throw sErr;

      const { data, error } = await supabase.functions.invoke("scan-business-card", {
        body: { image_url: signed.signedUrl },
      });
      if (error) throw error;
      const parsed = (data as any)?.data ?? {};
      onScanned(parsed as ScannedCard, path);
      toast.success("Card scanned — please review the fields");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to scan card");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop() || "jpg";
    await processBlob(file, ext);
    if (ref.current) ref.current.value = "";
  };

  const handleCapture = async (blob: Blob) => {
    await processBlob(blob, "jpg");
  };

  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanLine className="h-4 w-4 mr-1" />}
            {busy ? "Scanning…" : "Scan Business Card"}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCameraOpen(true)}>
            <Camera className="h-4 w-4 mr-2" /> Use Camera
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => ref.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Upload Image
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCapture}
        title="Scan Business Card"
      />
    </>
  );
}
