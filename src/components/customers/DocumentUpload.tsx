import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCreateCustomerDocument } from "@/hooks/useCustomers";
import { toast } from "sonner";

export function DocumentUpload({ opportunityId, customerId }: { opportunityId?: string; customerId?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const create = useCreateCustomerDocument();
  const [uploading, setUploading] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const base = opportunityId ?? customerId ?? "general";
      const path = `${base}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("customer-documents").upload(path, file);
      if (error) throw error;
      await create.mutateAsync({
        opportunity_id: opportunityId ?? null,
        customer_id: customerId ?? null,
        file_name: file.name,
        file_url: path,
        file_size: file.size,
        file_type: file.type,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };


  return (
    <>
      <input ref={ref} type="file" className="hidden" onChange={handle} />
      <Button size="sm" onClick={() => ref.current?.click()} disabled={uploading}>
        <Upload className="h-4 w-4 mr-2" />{uploading ? "Uploading…" : "Upload"}
      </Button>
    </>
  );
}
