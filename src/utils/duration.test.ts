import { describe, it, expect } from "vitest";
import { formatHHMM } from "./duration";

describe("formatHHMM", () => {
  it("renders absence as an em dash, not as zero", () => {
    expect(formatHHMM(null)).toBe("—");
    expect(formatHHMM(undefined)).toBe("—");
    expect(formatHHMM(Number.NaN)).toBe("—");
  });

  it("renders a recorded zero as 00:00", () => {
    expect(formatHHMM(0)).toBe("00:00");
  });

  it("floors sub-minute usage rather than rounding it up", () => {
    expect(formatHHMM(1)).toBe("00:00");
    expect(formatHHMM(59)).toBe("00:00");
    expect(formatHHMM(60)).toBe("00:01");
    expect(formatHHMM(119)).toBe("00:01");
  });

  it("formats the worked example: 65 minutes of foreground", () => {
    expect(formatHHMM(65 * 60)).toBe("01:05");
  });

  it("does not cap hours at two digits", () => {
    expect(formatHHMM(142 * 3600 + 30 * 60)).toBe("142:30");
  });

  it("clamps negative input from device clock skew", () => {
    expect(formatHHMM(-7200)).toBe("00:00");
  });
});
