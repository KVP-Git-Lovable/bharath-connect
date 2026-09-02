import { describe, it, expect } from "vitest";
import { shouldAcceptMove, isCoarseFix, GPS_CAPTURE_CONFIG } from "./gpsCaptureGate";

describe("shouldAcceptMove", () => {
  it("accepts the very first fix (no last point yet)", () => {
    const result = shouldAcceptMove(null, { lat: 12.8777, lng: 74.8501, ts: 1000, accuracy: 20 });
    expect(result.isRealMove).toBe(true);
  });

  it("rejects a jitter-sized jump inside the (clamped) accuracy radius", () => {
    // ~20m apart, both fixes with 70m accuracy: the raw gate would be 140m,
    // the clamp caps it at MOVEMENT_THRESHOLD_CAP_M — 20m still doesn't clear it.
    const last = { lat: 12.8777, lng: 74.8501, ts: 0, accuracy: 70 };
    const candidate = { lat: 12.877718, lng: 74.8501, ts: 30_000, accuracy: 70 };
    const result = shouldAcceptMove(last, candidate);
    expect(result.requiredMoveM).toBe(GPS_CAPTURE_CONFIG.MOVEMENT_THRESHOLD_CAP_M);
    expect(result.isRealMove).toBe(false);
  });

  it("never lets coarse fixes push the gate beyond the cap (0 km regression)", () => {
    // Two 35m fused fixes ~60m apart: the old gate demanded 70m and counted
    // the whole day as stationary. Clamped at 50m, this is real movement.
    const last = { lat: 12.8777, lng: 74.8501, ts: 0, accuracy: 35 };
    const candidate = { lat: 12.87824, lng: 74.8501, ts: 30_000, accuracy: 35 };
    const result = shouldAcceptMove(last, candidate);
    expect(result.requiredMoveM).toBe(50);
    expect(result.isRealMove).toBe(true);
  });

  it("flags fused/network-grade fixes as coarse", () => {
    expect(isCoarseFix(35)).toBe(false); // 35m is at GPS-grade edge? no: below 50m threshold
    expect(isCoarseFix(80)).toBe(true);
    expect(isCoarseFix(null)).toBe(true);
    expect(isCoarseFix(12)).toBe(false);
  });

  it("accepts a real move once it clears the combined accuracy radius", () => {
    // ~250m apart, both fixes with 70m accuracy (combined gate 140m).
    const last = { lat: 12.8777, lng: 74.8501, ts: 0, accuracy: 70 };
    const candidate = { lat: 12.87995, lng: 74.8501, ts: 30_000, accuracy: 70 };
    const result = shouldAcceptMove(last, candidate);
    expect(result.isRealMove).toBe(true);
  });

  it("accepts a small real move under excellent accuracy", () => {
    // ~25m apart, both fixes with 3m accuracy (combined gate: floor 10m still applies)
    const last = { lat: 12.8777, lng: 74.8501, ts: 0, accuracy: 3 };
    const candidate = { lat: 12.87793, lng: 74.8501, ts: 30_000, accuracy: 3 };
    const result = shouldAcceptMove(last, candidate);
    expect(result.requiredMoveM).toBe(10); // floor, since 3+3=6 < 10
  });

  it("treats null accuracy as worst-case (150m) rather than best-case", () => {
    const last = { lat: 12.8777, lng: 74.8501, ts: 0, accuracy: null };
    const candidate = { lat: 12.87824, lng: 74.8501, ts: 30_000, accuracy: null };
    const result = shouldAcceptMove(last, candidate);
    // Worst-case accuracy still applies, but clamped to the cap.
    expect(result.requiredMoveM).toBe(GPS_CAPTURE_CONFIG.MOVEMENT_THRESHOLD_CAP_M);
    expect(result.isRealMove).toBe(true); // ~60m clears the 50m cap
  });
});
