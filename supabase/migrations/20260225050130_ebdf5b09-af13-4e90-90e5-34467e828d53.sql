-- Add new role values to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'data_viewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_manager';