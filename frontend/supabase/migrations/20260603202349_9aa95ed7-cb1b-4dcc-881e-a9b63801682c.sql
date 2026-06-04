DROP POLICY IF EXISTS "Public intake can insert new cases" ON public.agent_case_logs;

CREATE POLICY "Public intake can insert new cases"
ON public.agent_case_logs
FOR INSERT
TO anon
WITH CHECK (
  user_message IS NOT NULL
  AND length(btrim(user_message)) BETWEEN 3 AND 2500
  AND COALESCE(case_status, 'new') = 'new'
);