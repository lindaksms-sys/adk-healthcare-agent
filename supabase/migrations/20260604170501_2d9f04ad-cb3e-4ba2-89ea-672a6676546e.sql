
REVOKE EXECUTE ON FUNCTION public.is_clinic_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_clinic_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_clinic_admin(uuid) TO authenticated, service_role;
