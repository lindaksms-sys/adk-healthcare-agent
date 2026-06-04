import type { CaseLog } from "@/lib/supabase";
import { normalizeUrgency } from "@/lib/urgency";

export type KpiFilterKey =
  | "new_today"
  | "urgent_open"
  | "nurse_review"
  | "front_desk"
  | "closed_today"
  | "emergency"
  | "routine"
  | "admin";

export const KPI_LABEL: Record<KpiFilterKey, string> = {
  new_today: "New today",
  urgent_open: "Urgent open",
  nurse_review: "Nurse review",
  front_desk: "Front desk",
  closed_today: "Closed today",
  emergency: "Emergency",
  routine: "Routine",
  admin: "Admin",
};

function isToday(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

export function matchesKpi(c: CaseLog, key: KpiFilterKey): boolean {
  const closed = c.case_status === "closed";
  const u = normalizeUrgency(c.urgency_level);
  switch (key) {
    case "new_today":
      return isToday(c.created_at);
    case "urgent_open":
      return !closed && (u === "emergency" || u === "urgent");
    case "nurse_review":
      return !closed && c.assigned_to_queue === "nurse_review";
    case "front_desk":
      return !closed && c.assigned_to_queue === "front_desk";
    case "closed_today":
      return isToday(c.closed_at);
    case "emergency":
      return u === "emergency";
    case "routine":
      return u === "routine";
    case "admin":
      return u === "admin";
  }
}
