/**
 * Shared GPS trajectory engine + distance calculation.
 *
 * EVERY distance display in the app (web Day Tracking, dashboard route card,
 * APK, check-out distance locking) must use these functions so all surfaces
 * show identical numbers for the same journey.
 *
 * Core principle: a GPS coordinate is an observation, not proof of movement.
 * Movement is counted only when the trajectory is temporally valid,
 * geographically plausible, speed-consistent, sufficiently accurate, not
 * stationary drift, and not an obvious GPS jump.
 *
 * Pipeline (processTrajectory):
 *   sort by device timestamp
 *     → drop invalid coords/timestamps + duplicate timestamps
 *     → optional attendance-window filter
 *     → accuracy gate (bands; null accuracy kept with a fallback value)
 *     → sequential pass: gap segmentation / jump rejection (soft+hard speed)
 *       / stationary centroid clustering / poor-accuracy sideways-move hold
 *     → per-segment ping-pong removal
 *     → segments + tracked distance (intra-segment only; gap legs excluded —
 *       bridging across gaps is handled downstream and classified estimated)
 *
 * SOURCE-OF-TRUTH HIERARCHY for the day's kilometres:
 *   1. attendance.total_distance_km locked at check-out via
 *      computeSnappedDistanceKm (authoritative — feeds payroll).
 *   2. Live views recompute through this engine (may differ slightly from a
 *      value locked under an older algorithm; historical locks are never
 *      rewritten).
 *   3. SQL public.compute_filtered_distance_km is a fallback/compatibility
 *      approximation used only when no locked value exists. It is intentionally
 *      NOT a full port of this engine.
 */

export interface TrackPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  /** Device-reported speed in m/s (nullable; historical rows lack it). */
  speed?: number | null;
  /** Reported horizontal accuracy radius in metres (nullable historically). */
  accuracy?: number | null;
  /** Device-reported heading in degrees (nullable; rarely present). */
  heading?: number | null;
}

export interface AttendanceWindow {
  checkInTime: string;
  checkOutTime: string | null;
}

export interface GpsProcessingConfig {
  /** Fixes worse than this are excluded from the trajectory entirely. */
  MAX_ACCURACY_METERS: number;
  /** Assumed accuracy for historical rows where accuracy is null. */
  NULL_ACCURACY_FALLBACK_METERS: number;
  /** Accuracy band edges (metres): [excellent, good, moderate]. Values above
   *  the last edge but ≤ MAX_ACCURACY_METERS are "poor". */
  ACCURACY_BANDS: [number, number, number];
  /** Same-position/same-instant epsilon for duplicate collapsing. */
  DUPLICATE_EPSILON_METERS: number;
  /** Implied speeds up to this are always plausible for a road field agent. */
  SOFT_SPEED_THRESHOLD_KMH: number;
  /** Hard physical limit. NEVER overridden — not even by an agreeing
   *  device-reported speed (both may come from the same bad fix). */
  HARD_SPEED_LIMIT_KMH: number;
  /** Clamp for sub-second / equal timestamps when computing implied speed. */
  MIN_TIME_DELTA_SECONDS: number;
  /** Consecutive rejected jumps before the anchor is declared poisoned. */
  MAX_CONSECUTIVE_JUMPS: number;
  /** After a degraded event, a fix must be at least this accurate to re-seed. */
  DEGRADED_REACCEPT_MAX_ACCURACY_METERS: number;
  /** Longer silences are tracking gaps: split the segment, never sum the leg. */
  MAX_NORMAL_GPS_GAP_SECONDS: number;
  /** Stationary cluster radius floor. */
  STATIONARY_RADIUS_FLOOR_METERS: number;
  /** Cluster radius scales with the worse accuracy of the two fixes. */
  STATIONARY_ACCURACY_MULTIPLIER: number;
  /** A worse-than-this fix making a sideways cluster exit is held until the
   *  next fix confirms it (parallel-road / stale-fix protection). */
  HOLD_MIN_ACCURACY_METERS: number;
  /** The next fix confirms a held point when within this radius of it. */
  HOLD_CONFIRM_RADIUS_METERS: number;
  /** Ping-pong outlier: far from both neighbours while they agree. */
  PING_PONG_OUTLIER_METERS: number;
  PING_PONG_RETURN_METERS: number;
  /** Grace absorbed around attendance check-in/check-out writes. */
  SESSION_GRACE_MS: number;
}

export const GPS_PROCESSING_CONFIG: GpsProcessingConfig = {
  MAX_ACCURACY_METERS: 150,
  NULL_ACCURACY_FALLBACK_METERS: 50,
  ACCURACY_BANDS: [20, 50, 100],
  DUPLICATE_EPSILON_METERS: 10,
  SOFT_SPEED_THRESHOLD_KMH: 120,
  HARD_SPEED_LIMIT_KMH: 160,
  MIN_TIME_DELTA_SECONDS: 1,
  MAX_CONSECUTIVE_JUMPS: 3,
  DEGRADED_REACCEPT_MAX_ACCURACY_METERS: 50,
  MAX_NORMAL_GPS_GAP_SECONDS: 180,
  STATIONARY_RADIUS_FLOOR_METERS: 30,
  STATIONARY_ACCURACY_MULTIPLIER: 1.5,
  HOLD_MIN_ACCURACY_METERS: 50,
  HOLD_CONFIRM_RADIUS_METERS: 100,
  PING_PONG_OUTLIER_METERS: 300,
  PING_PONG_RETURN_METERS: 150,
  SESSION_GRACE_MS: 15 * 60 * 1000,
};

export interface GpsProcessingMetrics {
  rawPointCount: number;
  acceptedPointCount: number;
  /** invalid + duplicates + poor accuracy + jumps + degraded discards +
   *  discarded holds + ping-pong outliers. Window-filtered and
   *  stationary-collapsed points are tracked separately (not "rejected"). */
  rejectedPointCount: number;
  invalidPointCount: number;
  duplicatePointCount: number;
  windowFilteredPointCount: number;
  poorAccuracyPointCount: number;
  /** Points kept with the null-accuracy fallback (assumed, not reported). */
  accuracyFallbackPointCount: number;
  gpsJumpCount: number;
  gpsDegradedEvents: number;
  degradedDiscardCount: number;
  heldPointDiscardCount: number;
  pingPongRemovedCount: number;
  stationaryPointCount: number;
  gpsGapCount: number;
  segmentCount: number;
  longestGapMinutes: number;
  /** Filled by snapping callers; 0 straight out of processTrajectory. */
  snappedPointCount: number;
  /** GPS-confirmed kilometres (validated trajectory, intra-segment only). */
  trackedDistanceKm: number;
  /** Estimated kilometres (gap bridging); 0 at engine level. */
  estimatedDistanceKm: number;
  totalDistanceKm: number;
}

export interface ProcessedTrajectory {
  /** Chronological validated segments; boundaries are tracking gaps. */
  segments: TrackPoint[][];
  /** Flattened segments (display / legacy callers). */
  points: TrackPoint[];
  /** GPS-confirmed distance: intra-segment sums only, no gap legs. */
  trackedDistanceKm: number;
  /** Straight-line length of the excluded gap legs (informational). */
  gapLegsKm: number;
  metrics: GpsProcessingMetrics;
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function havP(a: TrackPoint | ClusterState, b: TrackPoint): number {
  const aLat = "latitude" in a ? a.latitude : a.lat;
  const aLng = "longitude" in a ? a.longitude : a.lng;
  return haversineMeters(aLat, aLng, b.latitude, b.longitude);
}

/** Initial great-circle bearing from a to b, degrees 0–360. */
function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δλ = ((bLng - aLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function emptyMetrics(raw: number): GpsProcessingMetrics {
  return {
    rawPointCount: raw,
    acceptedPointCount: 0,
    rejectedPointCount: 0,
    invalidPointCount: 0,
    duplicatePointCount: 0,
    windowFilteredPointCount: 0,
    poorAccuracyPointCount: 0,
    accuracyFallbackPointCount: 0,
    gpsJumpCount: 0,
    gpsDegradedEvents: 0,
    degradedDiscardCount: 0,
    heldPointDiscardCount: 0,
    pingPongRemovedCount: 0,
    stationaryPointCount: 0,
    gpsGapCount: 0,
    segmentCount: 0,
    longestGapMinutes: 0,
    snappedPointCount: 0,
    trackedDistanceKm: 0,
    estimatedDistanceKm: 0,
    totalDistanceKm: 0,
  };
}

interface Candidate extends TrackPoint {
  tsMs: number;
  /** Reported accuracy, or the null-accuracy fallback. */
  effAcc: number;
}

interface ClusterState {
  lat: number;
  lng: number;
  count: number;
  /** First fix of the cluster — emitted so directional movement folded into a
   *  drifting centroid isn't collapsed away (slow walk stays credited). */
  seed: Candidate;
  /** Last real fix folded into the cluster (timestamps/speed read from it). */
  rep: Candidate;
}

/** Device speed + heading may CONFIRM a fast-but-plausible leg; they can
 *  never authorize one past the hard limit (checked by the caller). */
function isCorroborated(prev: Candidate, curr: Candidate, impliedKmh: number): boolean {
  const speeds = [prev.speed, curr.speed].filter(
    (s): s is number => s != null && Number.isFinite(s)
  );
  if (speeds.length < 2) return false;
  const reportedKmh = Math.max(...speeds.map((s) => Math.abs(s))) * 3.6;
  if (reportedKmh <= 0 || impliedKmh > reportedKmh * 1.5) return false;
  if (prev.heading != null && curr.heading != null && reportedKmh > 10) {
    const legBearing = bearingDeg(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    if (angleDiffDeg(legBearing, curr.heading) > 45) return false;
  }
  return true;
}

export function processTrajectory(
  raw: TrackPoint[],
  options?: { window?: AttendanceWindow | null; config?: Partial<GpsProcessingConfig> }
): ProcessedTrajectory {
  const cfg: GpsProcessingConfig = { ...GPS_PROCESSING_CONFIG, ...(options?.config ?? {}) };
  const m = emptyMetrics(raw?.length ?? 0);
  const empty = (): ProcessedTrajectory => ({
    segments: [],
    points: [],
    trackedDistanceKm: 0,
    gapLegsKm: 0,
    metrics: m,
  });

  try {
    if (!Array.isArray(raw) || raw.length === 0) return empty();

    // ---- Sanitize: validity, sorting, duplicate timestamps, window, accuracy
    const windowStart = options?.window
      ? new Date(options.window.checkInTime).getTime() - cfg.SESSION_GRACE_MS
      : -Infinity;
    const windowEnd = options?.window
      ? options.window.checkOutTime
        ? new Date(options.window.checkOutTime).getTime() + cfg.SESSION_GRACE_MS
        : Infinity
      : Infinity;

    const parsed: Candidate[] = [];
    for (const p of raw) {
      const tsMs = Date.parse(p?.timestamp ?? "");
      if (
        p == null ||
        !Number.isFinite(p.latitude) ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.latitude) > 90 ||
        Math.abs(p.longitude) > 180 ||
        !Number.isFinite(tsMs)
      ) {
        m.invalidPointCount++;
        continue;
      }
      if (tsMs < windowStart || tsMs > windowEnd) {
        m.windowFilteredPointCount++;
        continue;
      }
      if (p.accuracy != null && p.accuracy > cfg.MAX_ACCURACY_METERS) {
        m.poorAccuracyPointCount++;
        continue;
      }
      if (p.accuracy == null) m.accuracyFallbackPointCount++;
      parsed.push({
        ...p,
        tsMs,
        effAcc: p.accuracy ?? cfg.NULL_ACCURACY_FALLBACK_METERS,
      });
    }

    parsed.sort((a, b) => a.tsMs - b.tsMs);

    // Duplicate / reversed timestamps: keep the better-accuracy twin.
    const candidates: Candidate[] = [];
    for (const c of parsed) {
      const prev = candidates[candidates.length - 1];
      if (prev && c.tsMs <= prev.tsMs) {
        if (c.effAcc < prev.effAcc) candidates[candidates.length - 1] = { ...c, tsMs: prev.tsMs };
        m.duplicatePointCount++;
        continue;
      }
      if (
        prev &&
        havP(prev, c) < cfg.DUPLICATE_EPSILON_METERS &&
        c.tsMs - prev.tsMs < 1000
      ) {
        m.duplicatePointCount++;
        continue;
      }
      candidates.push(c);
    }

    // Capture-health diagnostic over everything that survived sanitation.
    for (let i = 1; i < candidates.length; i++) {
      const gapMin = (candidates[i].tsMs - candidates[i - 1].tsMs) / 60000;
      if (gapMin > m.longestGapMinutes) m.longestGapMinutes = gapMin;
    }

    // ---- Sequential pass: gaps / jumps / stationary clustering / holds
    const segments: Candidate[][] = [];
    let current: Candidate[] = [];
    let cluster: ClusterState | null = null;
    let held: Candidate | null = null;
    let consecutiveJumps = 0;
    let degraded = false;
    let gapLegsM = 0;

    // A single-point cluster passes the original fix through. A multi-point
    // cluster emits its seed and its centroid: the centroid averages jitter
    // out, and the seed preserves any directional creep that got folded in
    // (a slow walk is credited, at the small cost of ≤ one wobble amplitude
    // of extra distance per stationary episode).
    const emitCluster = (cl: ClusterState) => {
      if (cl.count === 1) {
        current.push(cl.rep);
        return;
      }
      current.push(cl.seed);
      current.push({ ...cl.rep, latitude: cl.lat, longitude: cl.lng });
    };

    const flushCluster = () => {
      if (cluster) {
        emitCluster(cluster);
        cluster = null;
      }
    };
    const closeSegment = () => {
      flushCluster();
      if (current.length > 0) segments.push(current);
      current = [];
    };
    const newCluster = (c: Candidate): ClusterState => ({
      lat: c.latitude,
      lng: c.longitude,
      count: 1,
      seed: c,
      rep: c,
    });

    for (const c of candidates) {
      if (!cluster) {
        // Segment start — after a degraded event only a high-quality fix
        // may re-seed the trajectory (never "accept the newest bad point").
        if (degraded && c.effAcc > cfg.DEGRADED_REACCEPT_MAX_ACCURACY_METERS) {
          m.degradedDiscardCount++;
          continue;
        }
        degraded = false;
        cluster = newCluster(c);
        continue;
      }

      // Resolve a pending held point against this fix first.
      if (held) {
        if (havP(held, c) <= cfg.HOLD_CONFIRM_RADIUS_METERS) {
          // Confirmed relocation: commit the cluster, restart it at the
          // held point, then judge the current fix against the new cluster.
          emitCluster(cluster);
          cluster = newCluster(held);
          held = null;
        } else {
          // Unconfirmed sideways move from a poor fix — noise, drop it.
          held = null;
          m.heldPointDiscardCount++;
        }
      }

      const dtSec = (c.tsMs - cluster.rep.tsMs) / 1000;

      if (dtSec > cfg.MAX_NORMAL_GPS_GAP_SECONDS) {
        // Tracking gap: never sum the leg — split, and let downstream
        // bridging estimate it (classified estimated, not GPS-confirmed).
        m.gpsGapCount++;
        gapLegsM += havP(cluster, c);
        closeSegment();
        cluster = newCluster(c);
        consecutiveJumps = 0;
        degraded = false;
        continue;
      }

      const distM = havP(cluster, c);
      const impliedKmh =
        distM / 1000 / (Math.max(dtSec, cfg.MIN_TIME_DELTA_SECONDS) / 3600);

      const overHard = impliedKmh > cfg.HARD_SPEED_LIMIT_KMH;
      const overSoft = impliedKmh > cfg.SOFT_SPEED_THRESHOLD_KMH;
      if (overHard || (overSoft && !isCorroborated(cluster.rep, c, impliedKmh))) {
        m.gpsJumpCount++;
        consecutiveJumps++;
        if (consecutiveJumps >= cfg.MAX_CONSECUTIVE_JUMPS) {
          // Anchor is poisoned: close out what we trust, go degraded, and
          // wait for a high-quality fix to start a NEW segment. The pre-jump
          // anchor is never connected to whatever comes next.
          m.gpsDegradedEvents++;
          closeSegment();
          degraded = true;
          consecutiveJumps = 0;
        }
        continue;
      }
      consecutiveJumps = 0;

      const radius = Math.max(
        cfg.STATIONARY_RADIUS_FLOOR_METERS,
        cfg.STATIONARY_ACCURACY_MULTIPLIER * Math.max(cluster.rep.effAcc, c.effAcc)
      );
      if (distM < radius) {
        // Stationary drift: fold into the running centroid, contribute 0.
        cluster.lat += (c.latitude - cluster.lat) / (cluster.count + 1);
        cluster.lng += (c.longitude - cluster.lng) / (cluster.count + 1);
        cluster.count++;
        cluster.rep = c;
        m.stationaryPointCount++;
        continue;
      }

      // Cluster exit = real displacement... unless it comes from a fix too
      // inaccurate to trust on its own for a modest sideways move (this is
      // what keeps one 140 m-accuracy fix from dragging the route onto a
      // parallel road). Hold it until the next fix agrees.
      if (
        c.effAcc > cfg.HOLD_MIN_ACCURACY_METERS &&
        distM < cfg.PING_PONG_OUTLIER_METERS
      ) {
        held = c;
        continue;
      }

      emitCluster(cluster);
      cluster = newCluster(c);
    }

    if (held) m.heldPointDiscardCount++; // unconfirmed tail — never counted
    closeSegment();

    // ---- Ping-pong removal, per segment (never across a gap boundary)
    const finalSegments: TrackPoint[][] = [];
    for (const seg of segments) {
      const deduped: Candidate[] = [];
      for (let i = 0; i < seg.length; i++) {
        const curr = seg[i];
        const prev = deduped[deduped.length - 1];
        const next = seg[i + 1];
        if (prev && next) {
          const outM = havP(prev, curr);
          const backM = havP(curr, next);
          const spanM = havP(prev, next);
          if (
            outM >= cfg.PING_PONG_OUTLIER_METERS &&
            backM >= cfg.PING_PONG_OUTLIER_METERS &&
            spanM <= cfg.PING_PONG_RETURN_METERS
          ) {
            m.pingPongRemovedCount++;
            continue; // stale-fix outlier between two agreeing fixes
          }
        }
        deduped.push(curr);
      }
      if (deduped.length > 0)
        finalSegments.push(
          deduped.map(({ tsMs: _t, effAcc: _e, ...p }) => p as TrackPoint)
        );
    }

    // ---- Assemble
    const points = finalSegments.flat();
    let trackedM = 0;
    for (const seg of finalSegments) {
      for (let i = 1; i < seg.length; i++) {
        trackedM += haversineMeters(
          seg[i - 1].latitude,
          seg[i - 1].longitude,
          seg[i].latitude,
          seg[i].longitude
        );
      }
    }

    m.acceptedPointCount = points.length;
    m.rejectedPointCount =
      m.invalidPointCount +
      m.duplicatePointCount +
      m.poorAccuracyPointCount +
      m.gpsJumpCount +
      m.degradedDiscardCount +
      m.heldPointDiscardCount +
      m.pingPongRemovedCount;
    m.segmentCount = finalSegments.length;
    m.trackedDistanceKm = trackedM / 1000;
    m.totalDistanceKm = m.trackedDistanceKm;

    if (import.meta.env.DEV) {
      console.debug("[gpsDistance] trajectory metrics", m);
    }

    return {
      segments: finalSegments,
      points,
      trackedDistanceKm: trackedM / 1000,
      gapLegsKm: gapLegsM / 1000,
      metrics: m,
    };
  } catch (e) {
    // One bad day of data must never blank the page or throw into callers.
    if (import.meta.env.DEV) console.warn("[gpsDistance] processTrajectory failed", e);
    return empty();
  }
}

export type SnappedDistanceSource = "road-snapped" | "validated-gps" | "estimated-gap" | "mixed";

export interface SnappedDistanceResult {
  /** GPS-confirmed kilometres (road-snapped where snapping succeeded). */
  trackedKm: number;
  /** Estimated kilometres (bridged tracking gaps). */
  estimatedKm: number;
  totalKm: number;
  source: SnappedDistanceSource;
  metrics: GpsProcessingMetrics;
}

/**
 * Authoritative day-distance computation: validated trajectory → snap-roads →
 * tracked + estimated split. Never throws; falls back to the validated
 * trajectory distance (never raw unfiltered GPS) when snapping is unavailable.
 * Used by check-out locking so payroll matches Day Tracking.
 */
export async function computeSnappedDistanceKm(
  raw: TrackPoint[],
  window?: AttendanceWindow | null
): Promise<SnappedDistanceResult> {
  const t = processTrajectory(raw, { window });
  const fallback: SnappedDistanceResult = {
    trackedKm: t.trackedDistanceKm,
    estimatedKm: 0,
    totalKm: t.trackedDistanceKm,
    source: "validated-gps",
    metrics: t.metrics,
  };
  if (t.points.length < 2) return fallback;
  try {
    // Dynamic import: googleRoute imports from this module.
    const { getSnappedRoute } = await import("@/utils/googleRoute");
    const route = await getSnappedRoute(t.segments);
    if (route.distanceMeters == null) return fallback;
    t.metrics.snappedPointCount = route.path.length;
    t.metrics.trackedDistanceKm = route.trackedMeters / 1000;
    t.metrics.estimatedDistanceKm = route.estimatedMeters / 1000;
    t.metrics.totalDistanceKm = route.distanceMeters / 1000;
    return {
      trackedKm: route.trackedMeters / 1000,
      estimatedKm: route.estimatedMeters / 1000,
      totalKm: route.distanceMeters / 1000,
      source: route.source,
      metrics: t.metrics,
    };
  } catch {
    return fallback;
  }
}

/**
 * Backward-compatible wrapper: validated (flattened) trajectory points.
 * Note: the flat array crosses gap boundaries; distance callers should use
 * computeFilteredDistanceKm / processTrajectory, which never sum gap legs.
 */
export function filterTrackPoints(points: TrackPoint[]): TrackPoint[] {
  return processTrajectory(points).points;
}

/** Total straight-line distance (km) of an already-filtered track. */
export function computeDistanceKm(points: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return total / 1000;
}

/** Convenience: full validation pipeline + tracked distance in one call. */
export function computeFilteredDistanceKm(rawPoints: TrackPoint[]): number {
  return processTrajectory(rawPoints).trackedDistanceKm;
}
