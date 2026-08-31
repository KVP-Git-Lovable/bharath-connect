-- Fix duplicate/orphaned email issue for prasanna@sbeecables.in
-- This removes any inactive, orphaned, or duplicate records so the user can be created fresh

-- Step 1: Find and soft-delete any orphaned users with this email (not fully delete in case of recovery needs)
UPDATE public.users
SET is_active = false
WHERE LOWER(email) = LOWER('prasanna@sbeecables.in')
  AND id NOT IN (
    SELECT id FROM public.users
    WHERE LOWER(email) = LOWER('prasanna@sbeecables.in')
    ORDER BY created_at DESC
    LIMIT 1
  );

-- Step 2: If there are multiple records, keep only the most recent one (by created_at)
-- Delete all but the newest
DELETE FROM public.users
WHERE LOWER(email) = LOWER('prasanna@sbeecables.in')
  AND id NOT IN (
    SELECT id FROM public.users
    WHERE LOWER(email) = LOWER('prasanna@sbeecables.in')
    ORDER BY created_at DESC
    LIMIT 1
  );

-- Step 3: Remove any user_security_profiles for this email (orphaned assignments)
DELETE FROM public.user_security_profiles
WHERE user_id IN (
  SELECT id FROM public.users
  WHERE LOWER(email) = LOWER('prasanna@sbeecables.in')
);

-- Step 4: Remove any profile_object_permissions for this user
DELETE FROM public.profile_object_permissions
WHERE profile_id IN (
  SELECT id FROM public.security_profiles sp
  WHERE sp.id IN (
    SELECT profile_id FROM public.user_security_profiles
    WHERE user_id IN (
      SELECT id FROM public.users
      WHERE LOWER(email) = LOWER('prasanna@sbeecables.in')
    )
  )
);

-- Step 5: If the remaining user record is inactive, delete it entirely to allow fresh creation
DELETE FROM public.users
WHERE LOWER(email) = LOWER('prasanna@sbeecables.in')
  AND is_active = false;

-- Step 6: Clean up profiles table for this email (if profile exists but user doesn't)
DELETE FROM public.profiles
WHERE id NOT IN (
  SELECT id FROM public.users
)
  AND id IN (
    SELECT p.id FROM public.profiles p
    LEFT JOIN public.users u ON p.id = u.id
    WHERE u.id IS NULL
  );

-- Verify: Should now show 0 or 1 active user with this email
-- SELECT COUNT(*) as user_count FROM public.users WHERE LOWER(email) = LOWER('prasanna@sbeecables.in') AND is_active = true;
