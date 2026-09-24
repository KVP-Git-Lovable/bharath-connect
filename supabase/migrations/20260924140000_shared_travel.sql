-- Two people travelling to the same visit in one vehicle.
--
-- Until now every activity was priced on its own, so two reps sharing a car
-- were each paid a full travel allowance, and two reps sharing a cab could
-- each claim the whole fare. Nothing in the schema said they travelled
-- together, so nobody could tell a shared trip from two separate ones.
--
-- Additive only: three nullable/defaulted columns. Every existing activity
-- reads as 'solo', which is exactly how it behaves today. Safe to re-run.

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS travel_role text NOT NULL DEFAULT 'solo',
  ADD COLUMN IF NOT EXISTS shared_with_activity_id uuid REFERENCES public.activity_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS travel_group_id uuid;

-- solo      : travelled alone. Priced as before.
-- driver    : paid for this journey. Priced as before.
-- passenger : rode with someone else. No travel allowance of its own.
-- shared    : public transport fare genuinely split, each leg keeps what that
--             person paid.
ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_travel_role_check;
ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_travel_role_check
  CHECK (travel_role IN ('solo', 'driver', 'passenger', 'shared'));

COMMENT ON COLUMN public.activity_events.travel_role IS
  'solo | driver | passenger | shared. A passenger earns no travel allowance; the driver or the split legs carry the cost.';
COMMENT ON COLUMN public.activity_events.shared_with_activity_id IS
  'For a passenger, the activity that is actually being paid for this journey.';
COMMENT ON COLUMN public.activity_events.travel_group_id IS
  'Shared by every leg of one journey, so a split reads as one trip rather than duplicate claims.';

-- Finding the other legs of a journey, and finding passengers of one activity.
CREATE INDEX IF NOT EXISTS activity_events_travel_group_idx
  ON public.activity_events (travel_group_id) WHERE travel_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activity_events_shared_with_idx
  ON public.activity_events (shared_with_activity_id) WHERE shared_with_activity_id IS NOT NULL;
