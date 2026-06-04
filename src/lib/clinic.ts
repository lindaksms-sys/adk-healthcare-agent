import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_BUSINESS_ID = "00000000-0000-0000-0000-000000000001";

export type ClinicRole = "clinic_admin" | "staff";

export interface ClinicMembership {
  id: string;
  business_id: string;
  user_id: string;
  role: ClinicRole;
  full_name: string | null;
  job_title: string | null;
  created_at: string;
}

export interface StaffMember extends ClinicMembership {
  email: string | null;
  last_sign_in_at: string | null;
  assigned_open_count: number;
}

export function displayName(m: { full_name?: string | null; email?: string | null } | null | undefined): string {
  if (!m) return "Unknown";
  return m.full_name?.trim() || m.email || "Unknown";
}

export function roleLabel(role: ClinicRole | string): string {
  return role === "clinic_admin" ? "Clinic admin" : "Staff";
}

export function useCurrentMembership() {
  return useQuery({
    queryKey: ["clinic_membership_me"],
    queryFn: async (): Promise<ClinicMembership | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("clinic_memberships")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as ClinicMembership | null) ?? null;
    },
    staleTime: 60_000,
  });
}
