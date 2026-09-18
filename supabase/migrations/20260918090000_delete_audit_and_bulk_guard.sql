-- After the 18 Sep data loss (vehicle setup + that day's activities deleted with no trace):
-- 1. data_audit_log: every deleted row is kept with who deleted it, so it can be restored.
-- Limits allow for normal use, including rows removed by cascade when one vehicle or group is deleted.
-- 2. Bulk-delete guard: a single statement deleting more than N rows from these tables fails,
--    unless it deliberately opts in with:  set local app.allow_bulk_delete = 'on';

CREATE TABLE IF NOT EXISTS public.data_audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  op text NOT NULL,
  row_id text,
  actor_uid uuid,
  actor_role text NOT NULL DEFAULT current_user,
  row_data jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_audit_log_table_at_idx ON public.data_audit_log(table_name, at DESC);

ALTER TABLE public.data_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_audit_log admin read" ON public.data_audit_log;
CREATE POLICY "data_audit_log admin read" ON public.data_audit_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.data_audit_log TO authenticated;
GRANT ALL ON public.data_audit_log TO service_role;

-- Keeps a copy of every deleted row.
CREATE OR REPLACE FUNCTION public.audit_deleted_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb := to_jsonb(OLD);
BEGIN
  INSERT INTO public.data_audit_log (table_name, op, row_id, actor_uid, actor_role, row_data)
  VALUES (TG_TABLE_NAME, TG_OP, v_row->>'id', auth.uid(), current_user, v_row);
  RETURN OLD;
END;
$function$;

-- Fails a statement that deletes more than TG_ARGV[0] rows at once.
CREATE OR REPLACE FUNCTION public.guard_bulk_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count bigint;
  v_max int := TG_ARGV[0]::int;
BEGIN
  IF current_setting('app.allow_bulk_delete', true) = 'on' THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO v_count FROM removed_rows;
  IF v_count > v_max THEN
    RAISE EXCEPTION
      'Blocked: % rows would be deleted from % in one statement (limit %). Deliberate bulk delete: set local app.allow_bulk_delete = ''on'';',
      v_count, TG_TABLE_NAME, v_max;
  END IF;
  RETURN NULL;
END;
$function$;

DO $do$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('activity_events', 5),
      ('attendance', 3),
      ('vehicle_types', 2),
      ('vehicle_rate_history', 20),
      ('role_vehicle_types', 25),
      ('vehicle_user_overrides', 10),
      ('daily_vehicle_selections', 10),
      ('user_pinned_vehicles', 20),
      ('expense_master_config', 1),
      ('expense_groups', 3),
      ('expense_group_members', 10),
      ('expense_overrides', 10),
      ('petty_cash_advances', 3),
      ('petty_cash_transactions', 5),
      ('ta_rate_history', 5),
      ('da_rate_history', 5)
    ) AS v(tbl, max_rows)
    WHERE to_regclass('public.' || v.tbl) IS NOT NULL
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit_delete ON public.%I', t.tbl);
    EXECUTE format(
      'CREATE TRIGGER zz_audit_delete AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_deleted_row()', t.tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS zz_guard_bulk_delete ON public.%I', t.tbl);
    EXECUTE format(
      'CREATE TRIGGER zz_guard_bulk_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS removed_rows FOR EACH STATEMENT EXECUTE FUNCTION public.guard_bulk_delete(%L)',
      t.tbl, t.max_rows);
  END LOOP;
END
$do$;
