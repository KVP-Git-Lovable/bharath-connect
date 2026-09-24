import { describe, expect, it } from "vitest";
import {
  canEnterFare,
  earnsTravel,
  needsCompanion,
  roleOf,
  rolesFor,
  sharedWithFor,
  travelAmountFor,
  travelGroupFor,
} from "./sharedTravel";

describe("shared travel", () => {
  it("treats an activity with no role as travelling alone", () => {
    expect(roleOf({})).toBe("solo");
    expect(roleOf({ travel_role: null })).toBe("solo");
    // Rows written before the migration read as solo, i.e. exactly as today.
    expect(earnsTravel({})).toBe(true);
    expect(travelAmountFor({}, 215)).toBe(215);
  });

  it("pays the driver in full", () => {
    expect(travelAmountFor({ travel_role: "driver" }, 215)).toBe(215);
    expect(canEnterFare({ travel_role: "driver" })).toBe(true);
  });

  it("pays a passenger nothing — the journey was paid on the other leg", () => {
    expect(travelAmountFor({ travel_role: "passenger" }, 215)).toBe(0);
    expect(earnsTravel({ travel_role: "passenger" })).toBe(false);
    expect(canEnterFare({ travel_role: "passenger" })).toBe(false);
  });

  it("keeps each leg's own amount when a fare was genuinely split", () => {
    // Both paid ₹90 of a ₹180 cab, so neither is zeroed.
    expect(travelAmountFor({ travel_role: "shared" }, 90)).toBe(90);
    expect(canEnterFare({ travel_role: "shared" })).toBe(true);
  });

  it("zeroes a passenger even when the leg has no amount to begin with", () => {
    expect(travelAmountFor({ travel_role: "passenger" }, null)).toBe(0);
  });

  it("leaves an unpriced solo leg unpriced rather than calling it zero", () => {
    // null means "not worked out yet"; 0 would claim the trip is worth nothing.
    expect(travelAmountFor({ travel_role: "solo" }, null)).toBeNull();
  });

  it("offers splitting only for public transport", () => {
    expect(rolesFor(true)).toContain("shared");
    expect(rolesFor(false)).not.toContain("shared");
    // A per-km rate reimburses the vehicle owner, so there is nothing to split.
    expect(rolesFor(false)).toEqual(["solo", "driver", "passenger"]);
  });

  it("anchors the group on whichever leg pays", () => {
    // Driver pays, so the group is the driver's own activity.
    expect(travelGroupFor("driver", "act-driver", null)).toBe("act-driver");
    // Passenger joins the payer's group, so both legs share one value without
    // either side having to coordinate.
    expect(travelGroupFor("passenger", "act-me", "act-driver")).toBe("act-driver");
    // A split leg pays its own share, so it anchors its own.
    expect(travelGroupFor("shared", "act-me", "act-other")).toBe("act-me");
    // Travelling alone is not a journey anyone shares.
    expect(travelGroupFor("solo", "act-me", null)).toBeNull();
  });

  it("points only a passenger at the activity that paid", () => {
    expect(sharedWithFor("passenger", "act-driver")).toBe("act-driver");
    expect(sharedWithFor("driver", "act-driver")).toBeNull();
    expect(sharedWithFor("solo", "act-driver")).toBeNull();
    expect(sharedWithFor("shared", "act-other")).toBeNull();
  });

  it("requires a colleague only for the roles that mean one", () => {
    expect(needsCompanion("passenger")).toBe(true);
    expect(needsCompanion("shared")).toBe(true);
    expect(needsCompanion("driver")).toBe(false);
    expect(needsCompanion("solo")).toBe(false);
  });
});
