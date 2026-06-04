GRANT INSERT ON public.agent_case_logs TO anon;
GRANT SELECT, INSERT, UPDATE ON public.agent_case_logs TO authenticated;
GRANT ALL ON public.agent_case_logs TO service_role;

DO $$
DECLARE
  seq_name text;
BEGIN
  SELECT pg_get_serial_sequence('public.agent_case_logs', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO anon', seq_name);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seq_name);
    EXECUTE format('GRANT ALL ON SEQUENCE %s TO service_role', seq_name);
  END IF;
END $$;