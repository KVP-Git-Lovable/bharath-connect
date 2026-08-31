import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the global "DA applicable" switch from expense_master_config.
 * Defaults to true until loaded so existing behaviour is unchanged.
 */
export function useDaApplicable() {
  const [daApplicable, setDaApplicable] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("expense_master_config" as any)
      .select("da_applicable")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!active) return;
        if (data && typeof data.da_applicable === "boolean") setDaApplicable(data.da_applicable);
        setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  return { daApplicable, loaded };
}

export default useDaApplicable;
