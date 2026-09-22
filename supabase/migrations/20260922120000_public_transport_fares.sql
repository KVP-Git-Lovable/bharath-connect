-- Public transport (bus / cab) fares on activities.
--
-- Travel allowance is otherwise km x rate. A bus or cab is a fare the employee
-- paid, so it needs an amount of its own and a way to mark which vehicles are
-- charged that way.
--
-- Additive only: two nullable/defaulted columns. No renames, no drops, no data
-- rewritten. Safe to re-run.

-- Amount the employee actually paid for this leg. NULL = not a fare trip,
-- so existing activities keep behaving exactly as they do now.
ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS manual_fare_amount numeric;

COMMENT ON COLUMN public.activity_events.manual_fare_amount IS
  'Fare paid for public transport on this activity. NULL means the km x rate calculation applies.';

-- Marks a vehicle type as charged by fare rather than per km.
-- Defaults to false, so every existing vehicle keeps its current behaviour.
ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS is_fare_based boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vehicle_types.is_fare_based IS
  'When true the rate/km and fixed price are ignored and the employee enters the fare they paid.';
