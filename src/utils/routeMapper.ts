const OSRM_API = "https://router.project-osrm.org/route/v1/driving";

interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

interface RoutedPath {
  coordinates: [number, number][];
  distance: number;
  duration: number;
}

export async function getRouteBetweenPoints(
  start: RouteCoordinate,
  end: RouteCoordinate
): Promise<RoutedPath | null> {
  try {
    const coords = `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;
    const response = await fetch(
      `${OSRM_API}/${coords}?steps=false&geometries=geojson&overview=full`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coordinates = route.geometry.coordinates as [number, number][];

    return {
      coordinates,
      distance: route.distance, // meters
      duration: route.duration, // seconds
    };
  } catch {
    return null;
  }
}

export async function getRouteForTrack(points: RouteCoordinate[]): Promise<[number, number][]> {
  if (points.length < 2) return [];

  // For small tracks, route each consecutive pair of points
  if (points.length <= 50) {
    const routedSegments: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const route = await getRouteBetweenPoints(points[i], points[i + 1]);
      if (route) {
        // Add all coordinates except the last (to avoid duplicates at segment boundaries)
        routedSegments.push(...route.coordinates.slice(0, -1));
      } else {
        // Fallback to straight line if routing fails
        routedSegments.push([points[i].longitude, points[i].latitude]);
      }
    }
    // Add the final point
    routedSegments.push([points[points.length - 1].longitude, points[points.length - 1].latitude]);
    return routedSegments;
  }

  // For large tracks, sample every Nth point and route those, then interpolate
  const sampleRate = Math.ceil(points.length / 50); // Keep ~50 routing calls max
  const sampledPoints = points.filter((_, i) => i % sampleRate === 0 || i === points.length - 1);

  const routedSegments: [number, number][] = [];
  for (let i = 0; i < sampledPoints.length - 1; i++) {
    const route = await getRouteBetweenPoints(sampledPoints[i], sampledPoints[i + 1]);
    if (route) {
      routedSegments.push(...route.coordinates.slice(0, -1));
    } else {
      routedSegments.push([sampledPoints[i].longitude, sampledPoints[i].latitude]);
    }
  }
  routedSegments.push([sampledPoints[sampledPoints.length - 1].longitude, sampledPoints[sampledPoints.length - 1].latitude]);

  return routedSegments;
}
