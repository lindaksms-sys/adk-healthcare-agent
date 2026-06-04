import {
  AlertTriangle,
  CheckCircle2,
  Phone,
  UserPlus,
  XCircle,
  Stethoscope,
  Mail,
  Clock,
  ListChecks,
  Inbox,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UrgencyBadge } from "./UrgencyBadge";
import type { CaseLog } from "@/lib/supabase";

interface Props {
  caseLog: CaseLog | null;
  onMarkReviewed?: (c: CaseLog) => void;
  isMarking?: boolean;
  onCloseCase?: (c: CaseLog) => void;
  isClosing?: boolean;
  onAssign?: (c: CaseLog, queue: "nurse_review" | "front_desk") => void;
  isAssigning?: boolean;
}

function queueLabel(q: string | null | undefined): string {
  if (!q) return "Unassigned";
  if (q === "nurse_review") return "Nurse review";
  if (q === "front_desk") return "Front desk";
  return q.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const past = diff >= 0;
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  let val: number; let unit: string;
  if (abs < min) return past ? "just now" : "in a moment";
  if (abs < hr) { val = Math.round(abs / min); unit = "min"; }
  else if (abs < day) { val = Math.round(abs / hr); unit = "hr"; }
  else if (abs < 30 * day) { val = Math.round(abs / day); unit = "day"; }
  else if (abs < 365 * day) { val = Math.round(abs / (30 * day)); unit = "mo"; }
  else { val = Math.round(abs / (365 * day)); unit = "yr"; }
  return past ? `${val} ${unit}${val === 1 ? "" : "s"} ago` : `in ${val} ${unit}${val === 1 ? "" : "s"}`;
}

type TimelineEvent = {
  key: string;
  label: string;
  iso: string;
  icon: React.ComponentType<{ className?: string }>;
};

function buildTimeline(c: CaseLog): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { key: "intake", label: "Intake received", iso: c.created_at, icon: Inbox },
  ];
  if (c.assigned_at && c.assigned_to_queue === "nurse_review") {
    events.push({ key: "assigned_nurse", label: "Assigned to nurse", iso: c.assigned_at, icon: UserPlus });
  }
  if (c.assigned_at && c.assigned_to_queue === "front_desk") {
    events.push({ key: "assigned_front", label: "Assigned to front desk", iso: c.assigned_at, icon: UserPlus });
  }
  if (c.reviewed_at) {
    events.push({ key: "reviewed", label: "Marked reviewed", iso: c.reviewed_at, icon: CheckCircle2 });
  }
  if (c.closed_at) {
    events.push({ key: "closed", label: "Case closed", iso: c.closed_at, icon: XCircle });
  }
  return events.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
}

function redFlagsList(value: CaseLog["red_flags"]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

function statusLabel(s: string | null | undefined): string {
  if (!s) return "New";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusTone(s: string | null | undefined): string {
  const v = (s ?? "new").toLowerCase();
  if (v === "reviewed") return "border-routine/25 bg-routine-soft text-routine";
  if (v === "closed") return "border-border bg-muted text-muted-foreground";
  if (v === "in_progress") return "border-urgent/25 bg-urgent-soft text-urgent";
  return "border-foreground/15 bg-card text-foreground";
}

function Chip({
  icon: Icon,
  label,
  value,
  className = "",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${className}`}
    >
      {Icon && <Icon className="h-3 w-3 opacity-70" />}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function CaseDetail({ caseLog, onMarkReviewed, isMarking, onCloseCase, isClosing, onAssign, isAssigning }: Props) {
  if (!caseLog) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center px-6 py-20">
        <Stethoscope className="h-8 w-8 text-muted-foreground/40" />
        <p className="mt-4 text-sm font-medium text-foreground">Select a case to review details</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a case from the list on the left.
        </p>
      </div>
    );
  }

  const flags = redFlagsList(caseLog.red_flags);
  const status = (caseLog.case_status ?? "new").toLowerCase();
  const isClosed = status === "closed";
  const reviewedDisabled = status === "reviewed" || isClosed || !!isMarking;
  const closeDisabled = isClosed || !!isClosing;
  const assignDisabled = isClosed || !!isAssigning;
  const assignedQueue = caseLog.assigned_to_queue;
  const act = (label: string) =>
    toast.success(label, { description: `Case ${caseLog.session_id ?? caseLog.id}` });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {/* 1. Case narrative — primary focus */}
        <section className="px-7 pt-7 pb-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-mono">{caseLog.session_id ?? `#${caseLog.id}`}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{caseLog.contact_channel ?? "Unknown channel"}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{caseLog.age_band ?? "Age n/a"}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>Logged {relTime(caseLog.created_at)}</span>
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
            {caseLog.reason_for_visit ?? "Reason not specified"}
          </h2>
          <blockquote className="mt-4 border-l-2 border-foreground/15 pl-4 text-[15px] leading-7 text-foreground/90">
            {caseLog.user_message ?? "No patient message provided."}
          </blockquote>

          {flags.length > 0 && (
            <div className="mt-5 rounded-lg border border-emergency/20 bg-emergency-soft px-4 py-3">
              <div className="flex items-center gap-2 text-emergency">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Red flags</span>
              </div>
              <ul className="mt-2 space-y-1">
                {flags.map((f, i) => (
                  <li key={i} className="text-sm text-foreground">• {f}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 2. Compact status strip */}
        <div className="border-y border-border bg-muted/30 px-7 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip
              label="Status"
              value={statusLabel(caseLog.case_status)}
              className={statusTone(caseLog.case_status)}
            />
            <Chip label="Urgency" value={<UrgencyBadge value={caseLog.urgency_level} />} className="border-border bg-card" />
            <Chip
              icon={Inbox}
              label="Queue"
              value={caseLog.recommended_queue ?? "Unassigned"}
              className="border-border bg-card"
            />
            {caseLog.escalation_required ? (
              <Chip
                icon={ShieldAlert}
                label="Escalation"
                value="Required"
                className="border-emergency/25 bg-emergency-soft text-emergency"
              />
            ) : (
              <Chip label="Escalation" value="Not required" className="border-border bg-card" />
            )}
            {assignedQueue && (
              <Chip
                icon={UserPlus}
                label="Assigned"
                value={queueLabel(assignedQueue)}
                className="border-border bg-card"
              />
            )}
          </div>
        </div>

        {/* 3. Actions */}
        <div className="border-b border-border px-7 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={reviewedDisabled}
              onClick={() => onMarkReviewed?.(caseLog)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {status === "reviewed" ? "Reviewed" : "Mark reviewed"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={assignDisabled}
              onClick={() => onAssign?.(caseLog, "nurse_review")}
            >
              <UserPlus className="h-4 w-4" />
              {assignedQueue === "nurse_review" ? "Nurse ✓" : "Nurse"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={assignDisabled}
              onClick={() => onAssign?.(caseLog, "front_desk")}
            >
              <UserPlus className="h-4 w-4" />
              {assignedQueue === "front_desk" ? "Front desk ✓" : "Front desk"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act("Calling patient…")}>
              <Phone className="h-4 w-4" /> Call
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              disabled={closeDisabled}
              onClick={() => onCloseCase?.(caseLog)}
            >
              <XCircle className="h-4 w-4" /> {isClosed ? "Closed" : "Close case"}
            </Button>
          </div>
        </div>

        {/* 4. Supporting sections */}
        <div className="px-7 py-6 space-y-7">
          <section className="space-y-3">
            <SectionHeader icon={ListChecks}>Triage</SectionHeader>
            <div className="space-y-4 rounded-lg border border-border bg-card px-4 py-4">
              <Field label="Next action">{caseLog.next_action ?? "—"}</Field>
              <Field label="Staff summary">
                {caseLog.staff_summary ?? "No staff summary generated."}
              </Field>
              <Field label="Human-readable summary">
                {caseLog.human_readable_summary ?? "—"}
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader icon={Mail}>Patient-facing message</SectionHeader>
            <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground">
              {caseLog.patient_message ?? "—"}
            </p>
          </section>

          <section className="space-y-3">
            <SectionHeader icon={Clock}>Activity</SectionHeader>
            <ol className="space-y-3 rounded-lg border border-border bg-card px-4 py-4">
              {buildTimeline(caseLog).map((ev, i, arr) => {
                const Icon = ev.icon;
                const isLast = i === arr.length - 1;
                return (
                  <li key={ev.key} className="relative flex gap-3 pl-1">
                    <div className="flex flex-col items-center">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                        <Icon className="h-3 w-3" />
                      </span>
                      {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="text-sm font-medium text-foreground">{ev.label}</div>
                      <div className="text-xs text-muted-foreground">{relTime(ev.iso)}</div>
                      <div className="text-[11px] text-muted-foreground/70">{fmtTime(ev.iso)}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
