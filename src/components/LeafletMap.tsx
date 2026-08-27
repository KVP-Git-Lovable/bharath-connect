import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { format } from "date-fns";
import { getRouteForTrack } from "@/utils/routeMapper";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const activityIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// "Live" pin — pulsing red divIcon for the most recent GPS point
const liveIcon = L.divIcon({
  className: "live-gps-pin",
  html: `
    <div style="position:relative;width:22px;height:22px;">
      <span style="position:absolute;inset:0;border-radius:9999px;background:#ef4444;opacity:0.35;animation:livePulse 1.6s ease-out infinite;"></span>
      <span style="position:absolute;top:4px;left:4px;width:14px;height:14px;border-radius:9999px;background:#ef4444;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>
    </div>
    <style>@keyframes livePulse{0%{transform:scale(0.6);opacity:0.6;}100%{transform:scale(2.2);opacity:0;}}</style>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Orange teardrop pin for GPS trail points
const trailIcon = L.divIcon({
  className: "trail-gps-pin",
  html: `
    <svg width="24" height="34" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 8.5 12 22 12 22s12-13.5 12-22C24 5.4 18.6 0 12 0z" fill="#f97316" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
    </svg>
  `,
  iconSize: [24, 34],
  iconAnchor: [12, 34],
  popupAnchor: [0, -30],
});

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

interface LeafletMapProps {
  location?: { lat: number; lng: number } | null;
  gpsPoints?: GPSPoint[];
  activityMarkers?: ActivityMarker[];
}

function MapAutoFit({ location, gpsPoints, activityMarkers }: LeafletMapProps) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);

    if (gpsPoints && gpsPoints.length > 0) {
      gpsPoints.forEach(p => bounds.extend([p.latitude, p.longitude]));
    }
    if (activityMarkers && activityMarkers.length > 0) {
      activityMarkers.forEach(m => bounds.extend([m.lat, m.lng]));
    }
    if (location && (!gpsPoints || gpsPoints.length === 0)) {
      bounds.extend([location.lat, location.lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [map, location, gpsPoints, activityMarkers]);

  return null;
}

export default function LeafletMap({ location, gpsPoints, activityMarkers }: LeafletMapProps) {
  const points = gpsPoints || [];
  const lastIdx = points.length - 1;
  const [routedPath, setRoutedPath] = useState<[number, number][]>([]);
  const [routingLoading, setRoutingLoading] = useState(false);

  useEffect(() => {
    if (points.length < 2) {
      setRoutedPath([]);
      return;
    }

    setRoutingLoading(true);
    getRouteForTrack(points)
      .then(path => {
        setRoutedPath(path);
      })
      .catch(() => {
        // Fallback to straight line if routing fails
        setRoutedPath(points.map(p => [p.longitude, p.latitude]) as [number, number][]);
      })
      .finally(() => setRoutingLoading(false));
  }, [points]);

  const center: [number, number] = points.length > 0
    ? [points[lastIdx].latitude, points[lastIdx].longitude]
    : location
      ? [location.lat, location.lng]
      : [22.5, 78.9];

  const zoom = points.length > 0 || location ? 14 : 5;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://osm.org">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapAutoFit location={location} gpsPoints={gpsPoints} activityMarkers={activityMarkers} />

      {/* Route line showing actual path traveled */}
      {routedPath.length > 0 && (
        <Polyline
          positions={routedPath.map(c => [c[1], c[0]]) as [number, number][]}
          pathOptions={{
            color: "#3b82f6",
            weight: 4,
            opacity: 0.8,
            lineCap: "round",
            lineJoin: "round"
          }}
        />
      )}

      {/* Fallback straight line if routing fails or is loading */}
      {routingLoading && points.length > 1 && routedPath.length === 0 && (
        <Polyline
          positions={points.map(p => [p.latitude, p.longitude]) as [number, number][]}
          pathOptions={{ color: "#94a3b8", weight: 2, opacity: 0.5, dashArray: "4 4" }}
        />
      )}

      {/* Current location pin (Current Location tab — no gpsPoints) */}
      {location && points.length === 0 && (
        <Marker position={[location.lat, location.lng]} icon={liveIcon}>
          <Popup>Current location</Popup>
        </Marker>
      )}

      {/* Trail: only show start and end points (hide intermediate points for cleaner map) */}
      {points.length > 0 && (
        <>
          {/* Start point */}
          <Marker position={[points[0].latitude, points[0].longitude]} icon={trailIcon}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">Start</div>
                <div>{format(new Date(points[0].timestamp), "MMM d, hh:mm a")}</div>
              </div>
            </Popup>
          </Marker>

          {/* End point (live location) */}
          {points.length > 1 && (
            <Marker position={[points[lastIdx].latitude, points[lastIdx].longitude]} icon={liveIcon}>
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-red-600">Latest location</div>
                  <div>{format(new Date(points[lastIdx].timestamp), "MMM d, hh:mm a")}</div>
                </div>
              </Popup>
            </Marker>
          )}
        </>
      )}

      {/* Activity / stop markers */}
      {(activityMarkers || []).map((m, i) => (
        <Marker key={`act-${i}`} position={[m.lat, m.lng]} icon={activityIcon}>
          <Popup>{m.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
