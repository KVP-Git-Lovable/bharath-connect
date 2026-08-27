import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveSignedUrl } from "@/utils/signedStorage";

export interface Branding {
  company_name: string | null;
  logo_url: string | null;
}

/**
 * Company branding (name + logo) shared by the app header and the login page.
 * In-memory React Query cache only — always refetched from the backend so a
 * changed name/logo (or a different device) never shows a stale value.
 */
export function useBranding() {
  const { data, isLoading } = useQuery({
    queryKey: ["company-profile-public"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("company_branding")
        .select("company_name, logo_url")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const branding: Branding = {
        company_name: data?.company_name ?? null,
        logo_url: data?.logo_url ?? null,
      };
      return branding;
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const rawLogo = data?.logo_url ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(rawLogo);

  // Logos stored in the private employee-photos bucket need a signed URL.
  useEffect(() => {
    let active = true;
    if (!rawLogo) {
      setLogoUrl(null);
      return;
    }
    if (!rawLogo.includes("/employee-photos/")) {
      setLogoUrl(rawLogo);
      return;
    }
    resolveSignedUrl("employee-photos", rawLogo).then((u) => {
      if (active) setLogoUrl(u || null);
    });
    return () => {
      active = false;
    };
  }, [rawLogo]);

  return {
    companyName: data?.company_name ?? null,
    logoUrl,
    loading: isLoading,
  };
}
