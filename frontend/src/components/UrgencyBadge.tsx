import { normalizeUrgency, URGENCY_LABEL, type UrgencyKey } from "@/lib/urgency";

const STYLES: Record<UrgencyKey, string> = {
  emergency: "bg-emergency-soft text-emergency border-emergency/20",
  urgent: "bg-urgent-soft text-urgent border-urgent/20",
  routine: "bg-routine-soft text-routine border-routine/20",
  admin: "bg-admin-soft text-admin border-admin/20",
};

export function UrgencyBadge({ value, size = "sm" }: { value: string | null; size?: "sm" | "md" }) {
  const key = normalizeUrgency(value);
  const padding = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium tracking-wide uppercase ${padding} ${STYLES[key]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${
        key === "emergency" ? "bg-emergency" :
        key === "urgent" ? "bg-urgent" :
        key === "routine" ? "bg-routine" : "bg-admin"
      }`} />
      {URGENCY_LABEL[key]}
    </span>
  );
}
