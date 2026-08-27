import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FaceMatchResult {
  confidence: number;
  matched: boolean;
  status: "verified" | "failed" | "bypassed" | "error";
}

export function useFaceMatching() {
  const [matching, setMatching] = useState(false);
  const [result, setResult] = useState<FaceMatchResult | null>(null);

  const compareImages = async (
    baselineUrl: string,
    attendanceUrl: string
  ): Promise<FaceMatchResult> => {
    setMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-face-match", {
        body: { baselineUrl, attendanceUrl },
      });

      if (error) {
        console.error("Face match error:", error);
        const bypassResult: FaceMatchResult = {
          confidence: 0,
          matched: false,
          status: "bypassed",
        };
        setResult(bypassResult);
        return bypassResult;
      }

      const confidence = data.confidence || 0;
      const matched = confidence >= 75 && (data.matched === true);
      const matchResult: FaceMatchResult = {
        confidence,
        matched,
        status: matched ? "verified" : "failed",
      };
      setResult(matchResult);
      return matchResult;
    } catch (err) {
      console.error("Face match exception:", err);
      const bypassResult: FaceMatchResult = {
        confidence: 0,
        matched: false,
        status: "bypassed",
      };
      setResult(bypassResult);
      return bypassResult;
    } finally {
      setMatching(false);
    }
  };

  const reset = () => {
    setResult(null);
    setMatching(false);
  };

  return { compareImages, matching, result, reset };
}
