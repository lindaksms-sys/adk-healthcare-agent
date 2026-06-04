
-- 1. businesses table
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Seed the default clinic
INSERT INTO public.businesses (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Clinic', 'default-clinic');

-- 2. clinic_memberships table
CREATE TABLE public.clinic_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('clinic_admin','staff')),
  full_name text,
  job_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

CREATE INDEX clinic_memberships_business_id_idx ON public.clinic_memberships(business_id);
CREATE INDEX clinic_memberships_user_id_idx ON public.clinic_memberships(user_id);
CREATE INDEX clinic_memberships_role_idx ON public.clinic_memberships(role);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_memberships TO authenticated;
GRANT ALL ON public.clinic_memberships TO service_role;

ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;

-- 3. Helper functions (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_clinic_member(business_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE business_id = business_uuid AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_admin(business_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE business_id = business_uuid
      AND user_id = auth.uid()
      AND role = 'clinic_admin'
  );
$$;

-- 4. agent_case_logs: add business + assignment columns
ALTER TABLE public.agent_case_logs
  ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  ADD COLUMN assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
-- assigned_at already exists on this table

-- Backfill existing cases to default clinic
UPDATE public.agent_case_logs
  SET business_id = '00000000-0000-0000-0000-000000000001'
  WHERE business_id IS NULL;

ALTER TABLE public.agent_case_logs
  ALTER COLUMN business_id SET NOT NULL,
  ALTER COLUMN business_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

CREATE INDEX agent_case_logs_business_id_idx ON public.agent_case_logs(business_id);
CREATE INDEX agent_case_logs_assigned_user_id_idx ON public.agent_case_logs(assigned_user_id);
CREATE INDEX agent_case_logs_business_assigned_idx ON public.agent_case_logs(business_id, assigned_user_id);
CREATE INDEX agent_case_logs_case_status_idx ON public.agent_case_logs(case_status);

-- 5. RLS for businesses
CREATE POLICY "Members can view their business"
  ON public.businesses FOR SELECT
  TO authenticated
  USING (public.is_clinic_member(id));

-- 6. RLS for clinic_memberships
CREATE POLICY "Members can view memberships in their business"
  ON public.clinic_memberships FOR SELECT
  TO authenticated
  USING (public.is_clinic_member(business_id));

CREATE POLICY "Clinic admins can insert memberships"
  ON public.clinic_memberships FOR INSERT
  TO authenticated
  WITH CHECK (public.is_clinic_admin(business_id));

CREATE POLICY "Clinic admins can update memberships"
  ON public.clinic_memberships FOR UPDATE
  TO authenticated
  USING (public.is_clinic_admin(business_id))
  WITH CHECK (public.is_clinic_admin(business_id));

CREATE POLICY "Clinic admins can delete memberships"
  ON public.clinic_memberships FOR DELETE
  TO authenticated
  USING (public.is_clinic_admin(business_id));

-- 7. Replace permissive agent_case_logs policies with business-scoped ones
DROP POLICY IF EXISTS "Authenticated staff can read cases" ON public.agent_case_logs;
DROP POLICY IF EXISTS "Authenticated staff can insert cases" ON public.agent_case_logs;
DROP POLICY IF EXISTS "Authenticated staff can update cases" ON public.agent_case_logs;
DROP POLICY IF EXISTS "agent_case_logs_select_authenticated" ON public.agent_case_logs;
DROP POLICY IF EXISTS "agent_case_logs_update_authenticated" ON public.agent_case_logs;

CREATE POLICY "Clinic members can view their cases"
  ON public.agent_case_logs FOR SELECT
  TO authenticated
  USING (public.is_clinic_member(business_id));

CREATE POLICY "Clinic members can insert cases for their business"
  ON public.agent_case_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_clinic_member(business_id));

CREATE POLICY "Clinic admins can update any case in their business"
  ON public.agent_case_logs FOR UPDATE
  TO authenticated
  USING (public.is_clinic_admin(business_id))
  WITH CHECK (public.is_clinic_admin(business_id));

CREATE POLICY "Staff can update cases assigned to them"
  ON public.agent_case_logs FOR UPDATE
  TO authenticated
  USING (
    public.is_clinic_member(business_id)
    AND assigned_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_clinic_member(business_id)
    AND assigned_user_id = auth.uid()
  );

-- Public intake: keep anon insert, ensure it targets default clinic
DROP POLICY IF EXISTS "Public intake can insert new cases" ON public.agent_case_logs;
CREATE POLICY "Public intake can insert new cases"
  ON public.agent_case_logs FOR INSERT
  TO anon
  WITH CHECK (
    user_message IS NOT NULL
    AND length(btrim(user_message)) BETWEEN 3 AND 2500
    AND COALESCE(case_status, 'new') = 'new'
    AND reviewed_at IS NULL
    AND closed_at IS NULL
    AND assigned_to_queue IS NULL
    AND assigned_at IS NULL
    AND assigned_user_id IS NULL
    AND business_id = '00000000-0000-0000-0000-000000000001'
  );

-- 8. Seed demo users (idempotent) + memberships
DO $$
DECLARE
  v_business uuid := '00000000-0000-0000-0000-000000000001';
  v_password text := crypt('ChangeMe123!', gen_salt('bf'));
  v_admin uuid;
  v_nurse uuid;
  v_desk  uuid;
BEGIN
  -- Admin
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@clinic.local';
  IF v_admin IS NULL THEN
    v_admin := gen_random_uuid();
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@clinic.local', v_password, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Admin User"}'::jsonb, now(), now());
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin, v_admin::text, jsonb_build_object('sub', v_admin::text, 'email', 'admin@clinic.local'), 'email', now(), now(), now());
  END IF;

  -- Nurse
  SELECT id INTO v_nurse FROM auth.users WHERE email = 'sister.ndlovu@clinic.local';
  IF v_nurse IS NULL THEN
    v_nurse := gen_random_uuid();
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_nurse, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sister.ndlovu@clinic.local', v_password, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Sister Ndlovu"}'::jsonb, now(), now());
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_nurse, v_nurse::text, jsonb_build_object('sub', v_nurse::text, 'email', 'sister.ndlovu@clinic.local'), 'email', now(), now(), now());
  END IF;

  -- Front desk
  SELECT id INTO v_desk FROM auth.users WHERE email = 'tariro.moyo@clinic.local';
  IF v_desk IS NULL THEN
    v_desk := gen_random_uuid();
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_desk, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tariro.moyo@clinic.local', v_password, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Tariro Moyo"}'::jsonb, now(), now());
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_desk, v_desk::text, jsonb_build_object('sub', v_desk::text, 'email', 'tariro.moyo@clinic.local'), 'email', now(), now(), now());
  END IF;

  -- Memberships (idempotent via unique constraint)
  INSERT INTO public.clinic_memberships (business_id, user_id, role, full_name, job_title)
  VALUES
    (v_business, v_admin, 'clinic_admin', 'Admin User', 'Clinic admin'),
    (v_business, v_nurse, 'staff', 'Sister Ndlovu', 'Nurse'),
    (v_business, v_desk,  'staff', 'Tariro Moyo', 'Front desk')
  ON CONFLICT (business_id, user_id) DO NOTHING;
END $$;

-- updated_at trigger for businesses
CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
