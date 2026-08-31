
-- Step 1: Convert existing single values to JSONB arrays
ALTER TABLE public.vendors
  ALTER COLUMN phone TYPE jsonb USING CASE WHEN phone IS NOT NULL AND phone != '' THEN jsonb_build_array(phone) ELSE '[]'::jsonb END,
  ALTER COLUMN contact_person TYPE jsonb USING CASE WHEN contact_person IS NOT NULL AND contact_person != '' THEN jsonb_build_array(contact_person) ELSE '[]'::jsonb END,
  ALTER COLUMN email TYPE jsonb USING CASE WHEN email IS NOT NULL AND email != '' THEN jsonb_build_array(email) ELSE '[]'::jsonb END;

-- Step 2: Set defaults for the new JSONB columns
ALTER TABLE public.vendors
  ALTER COLUMN phone SET DEFAULT '[]'::jsonb,
  ALTER COLUMN contact_person SET DEFAULT '[]'::jsonb,
  ALTER COLUMN email SET DEFAULT '[]'::jsonb;

-- Step 3: Drop the old unique constraint on phone (single text)
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_phone_unique;
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_phone_key;

-- Step 4: Drop the company column
ALTER TABLE public.vendors DROP COLUMN IF EXISTS company;

-- Step 5: Create a function to extract all phone numbers from vendors for uniqueness checking
CREATE OR REPLACE FUNCTION public.check_vendor_phone_unique()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  phone_val text;
  existing_id uuid;
BEGIN
  IF NEW.phone IS NULL OR jsonb_array_length(NEW.phone) = 0 THEN
    RAISE EXCEPTION 'At least one phone number is required';
  END IF;

  FOR phone_val IN SELECT jsonb_array_elements_text(NEW.phone)
  LOOP
    SELECT v.id INTO existing_id
    FROM public.vendors v
    WHERE v.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND v.phone @> jsonb_build_array(phone_val);

    IF existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Phone number % already exists for another vendor', phone_val;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Step 6: Create trigger
DROP TRIGGER IF EXISTS trg_check_vendor_phone_unique ON public.vendors;
CREATE TRIGGER trg_check_vendor_phone_unique
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vendor_phone_unique();
