import { useState } from "react";
import { Check, UserCheck, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useClinicStaff, useAssignCaseToUser } from "@/lib/case-assignment";
import { displayName, roleLabel } from "@/lib/clinic";
import type { CaseLog } from "@/lib/supabase";

interface Props {
  caseLog: CaseLog;
  canReassign: boolean;
}

export function AssignToControl({ caseLog, canReassign }: Props) {
  const [open, setOpen] = useState(false);
  const staff = useClinicStaff();
  const assign = useAssignCaseToUser();

  const current = staff.data?.find((s) => s.user_id === caseLog.assigned_user_id) ?? null;
  const label = current ? displayName(current) : "Unassigned";

  if (!canReassign) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs">
        <UserCheck className="h-3 w-3 opacity-70" />
        <span className="text-muted-foreground">Assigned to</span>
        <span className="font-medium">{label}</span>
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={assign.isPending}>
          <UserCheck className="h-4 w-4" />
          {current ? `Assigned: ${displayName(current)}` : "Assign to…"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="end">
        <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Assign to staff
        </div>
        <div className="max-h-72 overflow-y-auto">
          {(staff.data ?? []).map((m) => {
            const active = m.user_id === caseLog.assigned_user_id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  assign.mutate({ c: caseLog, userId: m.user_id });
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="min-w-0">
                  <div className="truncate font-medium">{displayName(m)}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {m.job_title ?? roleLabel(m.role)}
                  </div>
                </span>
                {active && <Check className="h-4 w-4 text-foreground" />}
              </button>
            );
          })}
          {(staff.data ?? []).length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">No staff yet.</div>
          )}
        </div>
        {current && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              onClick={() => { assign.mutate({ c: caseLog, userId: null }); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <UserMinus className="h-4 w-4" /> Clear assignment
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
