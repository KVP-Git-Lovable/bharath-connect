-- Notifications & Reports — Phase 4: Notification History
-- Read-only functions. Notifications RLS is unchanged (users still see only
-- their own rows); admins get a cross-user view through SECURITY DEFINER
-- functions that check notif_can_manage() first.

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications (created_at DESC);

-- Classify a notification's origin.
CREATE OR REPLACE FUNCTION public.notif_source_of(p_meta jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE COALESCE(p_meta->>'source', '')
    WHEN 'rules_engine' THEN 'rules_engine'
    WHEN 'report' THEN 'report'
    ELSE 'app' END
$$;

-- Paged, filtered history for admins.
CREATE OR REPLACE FUNCTION public.notif_history_list(
  p_from      timestamptz DEFAULT now() - interval '7 days',
  p_to        timestamptz DEFAULT now(),
  p_search    text DEFAULT NULL,
  p_source    text DEFAULT NULL,   -- rules_engine | report | app
  p_module    text DEFAULT NULL,   -- related_table
  p_user      uuid DEFAULT NULL,   -- recipient
  p_read      text DEFAULT NULL,   -- read | unread
  p_delivery  text DEFAULT NULL,   -- pushed | no_device | push_failed | in_app
  p_limit     int  DEFAULT 25,
  p_offset    int  DEFAULT 0
)
RETURNS TABLE (
  id uuid, created_at timestamptz, user_id uuid, recipient_name text,
  title text, message text, type text, related_table text, related_id uuid,
  is_read boolean, read_at timestamptz, is_dismissed boolean, delivery_status text,
  source text, rule_name text, event_code text, route text, is_test boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.notif_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN QUERY
  SELECT n.id, n.created_at, n.user_id,
         COALESCE(u.full_name, u.username, u.email)::text,
         n.title, n.message, n.type, n.related_table, n.related_id,
         COALESCE(n.is_read, false), n.read_at, n.is_dismissed, n.delivery_status,
         public.notif_source_of(n.metadata),
         n.metadata->>'rule_name', n.metadata->>'event_code', n.metadata->>'route',
         COALESCE((n.metadata->>'is_test')::boolean, false),
         count(*) OVER ()
  FROM public.notifications n
  LEFT JOIN public.users u ON u.id = n.user_id
  WHERE n.deleted_at IS NULL
    AND n.created_at >= COALESCE(p_from, '-infinity'::timestamptz)
    AND n.created_at <  COALESCE(p_to, 'infinity'::timestamptz)
    AND (p_source IS NULL OR public.notif_source_of(n.metadata) = p_source)
    AND (p_module IS NULL OR n.related_table = p_module)
    AND (p_user IS NULL OR n.user_id = p_user)
    AND (p_read IS NULL
         OR (p_read = 'read' AND COALESCE(n.is_read, false))
         OR (p_read = 'unread' AND NOT COALESCE(n.is_read, false)))
    AND (p_delivery IS NULL
         OR (p_delivery = 'in_app' AND n.delivery_status IN ('delivered', 'push_skipped'))
         OR n.delivery_status = p_delivery)
    AND (p_search IS NULL OR p_search = ''
         OR n.title ILIKE '%' || p_search || '%'
         OR n.message ILIKE '%' || p_search || '%'
         OR COALESCE(u.full_name, '') ILIKE '%' || p_search || '%')
  ORDER BY n.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notif_history_list(timestamptz, timestamptz, text, text, text, uuid, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notif_history_list(timestamptz, timestamptz, text, text, text, uuid, text, text, int, int) TO authenticated;

-- Headline numbers + module list for the same period.
CREATE OR REPLACE FUNCTION public.notif_history_stats(
  p_from timestamptz DEFAULT now() - interval '7 days',
  p_to   timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.notif_can_manage(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  WITH base AS (
    SELECT n.* FROM public.notifications n
    WHERE n.deleted_at IS NULL
      AND n.created_at >= COALESCE(p_from, '-infinity'::timestamptz)
      AND n.created_at <  COALESCE(p_to, 'infinity'::timestamptz)
  )
  SELECT jsonb_build_object(
    'total',        (SELECT count(*) FROM base),
    'read',         (SELECT count(*) FROM base WHERE COALESCE(is_read, false)),
    'pushed',       (SELECT count(*) FROM base WHERE delivery_status = 'pushed'),
    'no_device',    (SELECT count(*) FROM base WHERE delivery_status = 'no_device'),
    'push_failed',  (SELECT count(*) FROM base WHERE delivery_status = 'push_failed'),
    'by_source',    COALESCE((SELECT jsonb_object_agg(src, c) FROM (
                      SELECT public.notif_source_of(metadata) src, count(*) c FROM base GROUP BY 1) s), '{}'::jsonb),
    'modules',      COALESCE((SELECT jsonb_agg(related_table ORDER BY related_table) FROM (
                      SELECT DISTINCT related_table FROM base WHERE related_table IS NOT NULL) m), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notif_history_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notif_history_stats(timestamptz, timestamptz) TO authenticated;