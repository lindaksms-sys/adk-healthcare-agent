DROP POLICY IF EXISTS "Public intake can insert new cases" ON public.agent_case_logs;

CREATE POLICY "Public intake can insert new cases"
ON public.agent_case_logs
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (true);