import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GPSPoint {
  lat: number;
  lng: number;
  timestamp?: string;
}

interface DistanceResult {
  totalDistance: number;
  distanceKm: number;
  segments: Array<{
    from: string;
    to: string;
    distance: number;
    duration: number;
  }>;
  error?: string;
}

export function useRouteDistance() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateDistance = useCallback(
    async (points: GPSPoint[]): Promise<DistanceResult | null> => {
      if (!points || points.length < 2) {
        setError('At least 2 GPS points required');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'calculate-route-distance',
          {
            body: { points },
          }
        );

        if (fnError) {
          setError(fnError.message);
          return null;
        }

        if (data?.error) {
          setError(data.error);
          return null;
        }

        return data as DistanceResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('Error calculating route distance:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { calculateDistance, loading, error };
}
