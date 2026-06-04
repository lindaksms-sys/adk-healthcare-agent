export type UrgencyKey = "emergency" | "urgent" | "routine" | "admin";

export function normalizeUrgency(value: string | null | undefined): UrgencyKey {
  const v = (value ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (v.includes("emergenc")) return "emergency";
  if (v.includes("urgent")) return "urgent";
  if (v.includes("admin")) return "admin";
  return "routine";
}

export const URGENCY_LABEL: Record<UrgencyKey, string> = {
  emergency: "Emergency",
  urgent: "Urgent — same day",
  routine: "Routine",
  admin: "Admin only",
};

export const URGENCY_DOT: Record<UrgencyKey, string> = {
  emergency: "bg-[--c-emergency]",
  urgent: "bg-[--c-urgent]",
  routine: "bg-[--c-routine]",
  admin: "bg-[--c-admin]",
};
