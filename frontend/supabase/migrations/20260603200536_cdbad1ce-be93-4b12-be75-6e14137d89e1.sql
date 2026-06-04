DROP POLICY IF EXISTS "Public intake can insert cases" ON public.agent_case_logs;
CREATE POLICY "Public intake can insert new cases"
ON public.agent_case_logs
FOR INSERT
TO anon
WITH CHECK (
  user_message IS NOT NULL
  AND length(trim(user_message)) BETWEEN 3 AND 2500
  AND coalesce(case_status, 'new') = 'new'
  AND reviewed_at IS NULL
  AND closed_at IS NULL
  AND assigned_to_queue IS NULL
  AND assigned_at IS NULL
);