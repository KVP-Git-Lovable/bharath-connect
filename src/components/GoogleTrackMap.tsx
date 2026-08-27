import { forwardRef, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { getSnappedRoute } from "@/utils/googleRoute";

interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface ActivityMarker {
  lat: number;
  lng: number;
  name: string;
}

interface GoogleTrackMapProps {
  location?: { lat: number; lng: number } | null;
  gpsPoints?: GPSPoint[];
  activityMarkers?: ActivityMarker[];
  /** Precomputed road-snapped path. When provided, the map skips its own routing call. */
  routePath?: { lat: number; lng: number }[] | null;
}


const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

let mapsPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).google?.maps?.Map) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  if (!BROWSER_KEY) return Promise.reject(new Error("Google Maps key missing"));

  mapsPromise = new Promise<void>((resolve, reject) => {
    const cbName = "__initGoogleTrackMap";
    (window as any)[cbName] = () => resolve();
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      loading: "async",
      callback: cbName,
      libraries: "geometry",
    });
    if (CHANNEL) params.set("channel", CHANNEL);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      mapsPromise = null;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

const livePinSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
  <circle cx="13" cy="13" r="12" fill="#ef4444" fill-opacity="0.28"/>
  <circle cx="13" cy="13" r="7" fill="#ef4444" stroke="#ffffff" stroke-width="2.5"/>
</svg>`);

const startPinSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 24 34">
  <path d="M12 0C5.4 0 0 5.4 0 12c0 8.5 12 22 12 22s12-13.5 12-22C24 5.4 18.6 0 12 0z" fill="#f97316" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
</svg>`);

const activityPinSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 24 34">
  <path d="M12 0C5.4 0 0 5.4 0 12c0 8.5 12 22 12 22s12-13.5 12-22C24 5.4 18.6 0 12 0z" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
</svg>`);

const AUTH_ERROR =
  "Google Maps rejected this domain. Add this site to the API key's HTTP referrer allowlist in Google Cloud Console.";

const GoogleTrackMap = forwardRef<HTMLDivElement, GoogleTrackMapProps>(function GoogleTrackMap(
  { location, gpsPoints, activityMarkers, routePath },
  _forwardedRef
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routedPath, setRoutedPath] = useState<{ lat: number; lng: number }[]>([]);

  const points = gpsPoints || [];

  // Load API + init map (waits until the container actually has a size, so a
  // map mounted inside a hidden/zero-height tab doesn't render blank)
  useEffect(() => {
    let cancelled = false;
    let raf: number | null = null;

    const init = () => {
      if (cancelled || mapRef.current) return;
      const el = containerRef.current;
      if (!el) {
        raf = window.requestAnimationFrame(init);
        return;
      }
      if (el.offsetWidth === 0 || el.offsetHeight === 0) {
        raf = window.requestAnimationFrame(init);
        return;
      }
      const g = (window as any).google;
      mapRef.current = new g.maps.Map(el, {
        center: { lat: 22.5, lng: 78.9 },
        zoom: 5,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
      });
      infoRef.current = new g.maps.InfoWindow();
      setReady(true);
    };

    // Google calls this global when the key is rejected (e.g. RefererNotAllowedMapError)
    const prevAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      if (!cancelled) setError(AUTH_ERROR);
      if (typeof prevAuthFailure === "function") prevAuthFailure();
    };

    loadGoogleMaps()
      .then(() => init())
      .catch((e) => !cancelled && setError(e.message || "Map unavailable"));

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // Keep the map sized correctly when its container changes (tab switch, layout shift)
  useEffect(() => {
    if (!ready || !containerRef.current || !mapRef.current) return;
    const g = (window as any).google;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const center = mapRef.current.getCenter();
      g.maps.event.trigger(mapRef.current, "resize");
      if (center) mapRef.current.setCenter(center);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);


  // Snap trail to roads (skipped when the parent already computed the route)
  useEffect(() => {
    let cancelled = false;
    if (routePath) {
      setRoutedPath(routePath);
      return;
    }
    if (points.length < 2) {
      setRoutedPath([]);
      return;
    }
    getSnappedRoute(points)
      .then((res) => !cancelled && setRoutedPath(res.path))
      .catch(() => {
        if (!cancelled) setRoutedPath(points.map((p) => ({ lat: p.latitude, lng: p.longitude })));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePath, JSON.stringify(points.map((p) => [p.latitude, p.longitude]))]);


  // Draw everything
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google;
    const map = mapRef.current;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const bounds = new g.maps.LatLngBounds();
    let hasBounds = false;

    const addMarker = (
      pos: { lat: number; lng: number },
      svg: string,
      size: { w: number; h: number },
      anchorBottom: boolean,
      content?: string
    ) => {
      const marker = new g.maps.Marker({
        position: pos,
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${svg}`,
          scaledSize: new g.maps.Size(size.w, size.h),
          anchor: new g.maps.Point(size.w / 2, anchorBottom ? size.h : size.h / 2),
        },
      });
      if (content) {
        marker.addListener("click", () => {
          infoRef.current.setContent(`<div style="font-size:12px">${content}</div>`);
          infoRef.current.open({ map, anchor: marker });
        });
      }
      overlaysRef.current.push(marker);
      bounds.extend(pos);
      hasBounds = true;
    };

    // Trail polyline
    const linePath =
      routedPath.length > 0 ? routedPath : points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    if (linePath.length > 1) {
      const line = new g.maps.Polyline({
        path: linePath,
        map,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.85,
        strokeWeight: 4,
      });
      overlaysRef.current.push(line);
      linePath.forEach((c) => {
        bounds.extend(c);
        hasBounds = true;
      });
    }

    // Start / latest
    if (points.length > 0) {
      const first = points[0];
      addMarker(
        { lat: first.latitude, lng: first.longitude },
        startPinSvg,
        { w: 26, h: 36 },
        true,
        `<strong>Start</strong><br/>${format(new Date(first.timestamp), "MMM d, hh:mm a")}`
      );
      if (points.length > 1) {
        const last = points[points.length - 1];
        addMarker(
          { lat: last.latitude, lng: last.longitude },
          livePinSvg,
          { w: 26, h: 26 },
          false,
          `<strong style="color:#dc2626">Latest location</strong><br/>${format(
            new Date(last.timestamp),
            "MMM d, hh:mm a"
          )}`
        );
      }
    }

    // Current location (no trail)
    if (location && points.length === 0) {
      addMarker({ lat: location.lat, lng: location.lng }, livePinSvg, { w: 26, h: 26 }, false, "Current location");
    }

    // Activity / stop markers
    (activityMarkers || []).forEach((m) => {
      addMarker({ lat: m.lat, lng: m.lng }, activityPinSvg, { w: 26, h: 36 }, true, m.name);
    });

    if (hasBounds) {
      map.fitBounds(bounds, 40);
      const listener = g.maps.event.addListenerOnce(map, "idle", () => {
        if (map.getZoom() > 16) map.setZoom(16);
      });
      overlaysRef.current.push({ setMap: () => g.maps.event.removeListener(listener) });
    }
  }, [ready, location, activityMarkers, points, routedPath]);

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted px-4 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
});

export default GoogleTrackMap;
