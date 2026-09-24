/**
 * Two people reaching the same visit in one vehicle.
 *
 * Travel allowance reimburses the cost of getting there, so it is owed once
 * per journey, not once per person. Daily allowance is separate and untouched:
 * a passenger still earns their DA for being in the field, they simply do not
 * earn a second travel allowance for a car they did not run.
 */
export type TravelRole = "solo" | "driver" | "passenger" | "shared";

export const TRAVEL_ROLE_LABEL: Record<TravelRole, string> = {
  solo: "Travelled alone",
  driver: "I paid for this journey",
  passenger: "I travelled with someone else",
  shared: "We split the fare",
};

export interface SharedTravel {
  /** Untyped on purpose: it arrives from the database. roleOf narrows it. */
  travel_role?: string | null;
  shared_with_activity_id?: string | null;
  travel_group_id?: string | null;
}

/** Roles that may be chosen for a per-km vehicle. */
export const OWN_VEHICLE_ROLES: TravelRole[] = ["solo", "driver", "passenger"];
/** Public transport adds a genuine split, where each leg keeps what that person paid. */
export const FARE_ROLES: TravelRole[] = ["solo", "driver", "passenger", "shared"];

/**
 * Splitting only makes sense for a fare. Per-km rates reimburse the owner of
 * the vehicle for fuel and wear, so there is nothing for a passenger to split.
 */
export function rolesFor(fareBased: boolean): TravelRole[] {
  return fareBased ? FARE_ROLES : OWN_VEHICLE_ROLES;
}

export function roleOf(activity: SharedTravel): TravelRole {
  const r = activity.travel_role;
  return r === "driver" || r === "passenger" || r === "shared" ? r : "solo";
}

/** A passenger rode with someone else, so this leg carries no travel cost. */
export function earnsTravel(activity: SharedTravel): boolean {
  return roleOf(activity) !== "passenger";
}

/**
 * The travel amount for one leg, given what the leg would be worth on its own.
 * Only a passenger differs: their journey was already paid on someone else's
 * activity.
 */
export function travelAmountFor(activity: SharedTravel, ownAmount: number | null): number | null {
  return earnsTravel(activity) ? ownAmount : 0;
}

/** Whether a fare may be entered on this leg at all. */
export function canEnterFare(activity: SharedTravel): boolean {
  return earnsTravel(activity);
}

export interface TravelCompanion {
  activity_id: string;
  user_id: string;
  full_name: string;
  activity_label: string | null;
  start_time: string | null;
}

/**
 * The group is the id of the activity that carries the cost, so every leg of
 * one journey lands on the same value without anyone coordinating. A driver or
 * solo leg is its own group; a passenger joins the payer's.
 */
export function travelGroupFor(
  role: TravelRole,
  ownActivityId: string,
  companionActivityId: string | null,
): string | null {
  if (role === "solo") return null;
  if (role === "passenger") return companionActivityId;
  // driver or shared: this leg pays, so it anchors the group.
  return ownActivityId;
}

/** Only a passenger points at the activity that paid for them. */
export function sharedWithFor(role: TravelRole, companionActivityId: string | null): string | null {
  return role === "passenger" ? companionActivityId : null;
}

/** A companion must be named before a role that depends on one can be saved. */
export function needsCompanion(role: TravelRole): boolean {
  return role === "passenger" || role === "shared";
}
