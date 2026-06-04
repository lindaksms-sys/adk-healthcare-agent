import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listClinicStaff } from "@/lib/staff.functions";
import type { CaseLog } from "@/lib/supabase";
import type { StaffMember } from "@/lib/clinic";

export function useClinicStaff() {
  const list = useServerFn(listClinicStaff);
  return useQuery({
    queryKey: ["clinic_staff"],
    queryFn: () => list() as Promise<StaffMember[]>,
    staleTime: 30_000,
  });
}

export function useAssignCaseToUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ c, userId }: { c: CaseLog; userId: string | null }) => {
      const { data: me } = await supabase.auth.getUser();
      const assigned_at = userId ? new Date().toISOString() : null;
      const { data, error } = await supabase
        .from("agent_case_logs")
        .update({
          assigned_user_id: userId,
          assigned_at,
          assigned_by_user_id: userId ? me.user?.id ?? null : null,
        })
        .eq("id", c.id as never)
        .select()
        .single();
      if (error) throw error;
      return data as CaseLog;
    },
    onSuccess: (u) => {
      toast.success(u.assigned_user_id ? "Case assigned" : "Assignment cleared");
      qc.invalidateQueries({ queryKey: ["agent_case_logs"] });
      qc.invalidateQueries({ queryKey: ["agent_case_log"] });
      qc.invalidateQueries({ queryKey: ["clinic_staff"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't assign"),
  });
}
