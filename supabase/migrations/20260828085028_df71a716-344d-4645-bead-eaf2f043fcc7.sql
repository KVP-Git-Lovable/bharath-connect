UPDATE public.permission_definitions SET sort_order = 54 WHERE name = 'module_expenses';
UPDATE public.permission_definitions SET sort_order = 55 WHERE name = 'field_expense_bill';
UPDATE public.permission_definitions SET sort_order = 56 WHERE name = 'field_expense_amount';
UPDATE public.permission_definitions SET sort_order = 57 WHERE name = 'action_expense_submit';
UPDATE public.permission_definitions SET sort_order = 58 WHERE name = 'action_expense_approve';
UPDATE public.permission_definitions SET sort_order = 59 WHERE name = 'widget_pending_expenses';

INSERT INTO public.profile_object_permissions (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
VALUES
  ('7b479303-e1dc-476d-9aad-ec1d3a23810c','module_expenses','module',true,true,true,true,true,true),
  ('010b572c-540f-4a0f-a3c5-496da255bf00','module_expenses','module',true,true,true,true,true,true),
  ('2cb465f4-fe58-495b-b96b-647c1cbd9901','module_expenses','module',true,true,true,false,false,false)
ON CONFLICT (profile_id, object_name, permission_type) DO UPDATE
SET can_read = EXCLUDED.can_read,
    can_create = EXCLUDED.can_create,
    can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete,
    can_view_all = EXCLUDED.can_view_all,
    can_modify_all = EXCLUDED.can_modify_all;