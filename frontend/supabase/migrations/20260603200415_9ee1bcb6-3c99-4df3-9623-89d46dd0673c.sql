GRANT INSERT ON public.agent_case_logs TO anon;
CREATE POLICY "Public intake can insert cases"
ON public.agent_case_logs
FOR INSERT
TO anon
WITH CHECK (true);