import { describe, it, expect } from "vitest";
import { shouldAcceptMove } from "./gpsCaptureGate";

describe("shouldAcceptMove", () => {
  it("accepts the very first fix (no last point yet)", () => {
    const result = shouldAcceptMove(null, { lat: 12.8777, lng: 74.8501, ts: 1000, accuracy: 20 });
    expect(result.isRealMove).toBe(true);
  });

  it("rejects a jitter-sized jump within the combined accuracy radius", () => {
    // ~60m apart (roughly 0.00054 deg lat), both fixes with 70m accuracy —
    // combined 140m radius comfortably covers a 60m hop.
    const last = { lat: 12.8777, lng: 74.8501, ts: 0, accuracy: 70 };
    const candidate = { lat: 12.87824, lng: 74.8501, ts: 30_000, accuracy: 70 };
    const result = shouldAcceptMove(last, candidate);
    expect(result.isRealMove).toBe(false);
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
    expect(result.requiredMoveM).toBe(300); // 150 + 150
    expect(result.isRealMove).toBe(false); // ~60m move doesn't clear 300m gate
  });
});
