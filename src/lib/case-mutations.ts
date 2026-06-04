import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, type CaseLog } from "@/lib/supabase";

type Opts = {
  usingSample?: boolean;
  onSampleUpdate?: (id: string, patch: Partial<CaseLog>) => void;
};

export function useCaseMutations({ usingSample, onSampleUpdate }: Opts = {}) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["agent_case_logs"] });
    queryClient.invalidateQueries({ queryKey: ["agent_case_log"] });
  };

  const markReviewed = useMutation({
    mutationFn: async (c: CaseLog) => {
      const reviewed_at = new Date().toISOString();
      if (usingSample) return { ...c, case_status: "reviewed", reviewed_at } as CaseLog;
      const { data, error } = await supabase
        .from("agent_case_logs")
        .update({ case_status: "reviewed", reviewed_at })
        .eq("id", c.id as never)
        .select()
        .single();
      if (error) throw error;
      return data as CaseLog;
    },
    onSuccess: (u) => {
      toast.success("Case marked as reviewed");
      if (usingSample) onSampleUpdate?.(String(u.id), { case_status: u.case_status, reviewed_at: u.reviewed_at });
      else invalidate();
    },
    onError: (err: unknown) => {
      toast.error("Couldn't mark as reviewed", { description: err instanceof Error ? err.message : "Update failed" });
    },
  });

  const closeCase = useMutation({
    mutationFn: async (c: CaseLog) => {
      const closed_at = new Date().toISOString();
      if (usingSample) return { ...c, case_status: "closed", closed_at } as CaseLog;
      const { data, error } = await supabase
        .from("agent_case_logs")
        .update({ case_status: "closed", closed_at })
        .eq("id", c.id as never)
        .select()
        .single();
      if (error) throw error;
      return data as CaseLog;
    },
    onSuccess: (u) => {
      toast.success("Case closed");
      if (usingSample) onSampleUpdate?.(String(u.id), { case_status: u.case_status, closed_at: u.closed_at });
      else invalidate();
    },
    onError: (err: unknown) => {
      toast.error("Couldn't close case", { description: err instanceof Error ? err.message : "Update failed" });
    },
  });

  const assignCase = useMutation({
    mutationFn: async ({ c, queue }: { c: CaseLog; queue: "nurse_review" | "front_desk" }) => {
      const assigned_at = new Date().toISOString();
      if (usingSample) return { ...c, assigned_to_queue: queue, assigned_at } as CaseLog;
      const { data, error } = await supabase
        .from("agent_case_logs")
        .update({ assigned_to_queue: queue, assigned_at })
        .eq("id", c.id as never)
        .select()
        .single();
      if (error) throw error;
      return data as CaseLog;
    },
    onSuccess: (u) => {
      const label = u.assigned_to_queue === "nurse_review" ? "Assigned to nurse" : "Assigned to front desk";
      toast.success(label);
      if (usingSample) onSampleUpdate?.(String(u.id), { assigned_to_queue: u.assigned_to_queue, assigned_at: u.assigned_at });
      else invalidate();
    },
    onError: (err: unknown) => {
      toast.error("Couldn't assign case", { description: err instanceof Error ? err.message : "Update failed" });
    },
  });

  return { markReviewed, closeCase, assignCase };
}
