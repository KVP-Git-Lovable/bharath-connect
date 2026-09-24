REVOKE EXECUTE ON FUNCTION public.submit_expense_claim(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_expense_claim(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_claim_user(uuid) FROM PUBLIC, anon;