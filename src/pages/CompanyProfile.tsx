import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Save, Globe, Building2, FileText, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function CompanyProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const companyQuery = useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_company_profile_full");
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) ?? null;
    },
  });

  const [form, setForm] = useState<any>(null);

  if (companyQuery.data && !form) {
    setForm(companyQuery.data);
  }

  const saveMutation = useMutation({
    mutationFn: async (formData: any) => {
      const { error } = await (supabase as any).rpc("upsert_company_profile", { _payload: formData });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
      queryClient.invalidateQueries({ queryKey: ["company-profile-public"] });
      toast.success("Company profile saved!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save");
    },
  });

  const handleSave = () => {
    if (form) saveMutation.mutate(form);
  };

  const updateField = (field: string, value: string) => {
    setForm((prev: any) => ({ ...(prev || {}), [field]: value }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Max 2MB.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Only PNG, JPG or WEBP files allowed.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `company-logo/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("branding").getPublicUrl(path);
      const logoUrl = urlData.publicUrl + "?t=" + Date.now();
      updateField("logo_url", logoUrl);
      toast.success("Logo uploaded! Click Save to apply.");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const companyName = form?.company_name || "Company";
  const logoUrl = form?.logo_url || null;

  return (
    <motion.div className="p-4 space-y-6 max-w-4xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Company Profile</h1>
          <p className="text-sm text-muted-foreground">Manage company details and branding settings</p>
        </div>
      </div>

      {companyQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="branding" className="space-y-6">
          <TabsList>
            <TabsTrigger value="branding" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Globe className="h-4 w-4" />
              Header Branding
            </TabsTrigger>
          </TabsList>

          {/* Header Branding Tab */}
          <TabsContent value="branding">
            <Card className="border-dashed">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Header Branding
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure the company name and logo displayed in the app header. Changes will reflect across the entire application.
                  </p>
                </div>

                {/* Company Logo */}
                <div className="space-y-3">
                  <Label className="font-semibold">Company Logo</Label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center overflow-hidden bg-muted/30">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="text-sm file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
                        onChange={handleLogoUpload}
                        disabled={uploading}
                      />
                      <p className="text-xs text-muted-foreground">
                        Recommended: Square image, max 2MB (PNG, JPG)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Company Name */}
                <div className="space-y-2">
                  <Label className="font-semibold">Company Name</Label>
                  <Input
                    value={form?.company_name || ""}
                    onChange={(e) => updateField("company_name", e.target.value)}
                    placeholder="Enter company name"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground">
                    This name will appear in the header across all pages
                  </p>
                </div>

                {/* Preview */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Preview</Label>
                  <div className="inline-flex items-center gap-2.5 gradient-hero text-primary-foreground px-4 py-2.5 rounded-xl shadow-md">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden bg-white/90 p-0.5">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <Building2 className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <span className="text-base font-semibold">{companyName}</span>
                  </div>
                </div>

                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Branding
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </motion.div>
  );
}
