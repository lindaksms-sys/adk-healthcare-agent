-- Staff-only RLS policies
CREATE POLICY "Authenticated staff can read cases"
ON public.agent_case_logs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated staff can update cases"
ON public.agent_case_logs FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated staff can insert cases"
ON public.agent_case_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Auto-maintain updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_case_logs_set_updated_at
BEFORE UPDATE ON public.agent_case_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();