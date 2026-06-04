import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Phone, UserPlus, XCircle,
  Mail, Clock, ListChecks, Inbox, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { supabase, type CaseLog } from "@/lib/supabase";
import { SAMPLE_CASES } from "@/lib/sample-cases";
import { useCaseMutations } from "@/lib/case-mutations";
import { AssignToControl } from "@/components/AssignToControl";
import { useCurrentMembership, displayName } from "@/lib/clinic";
import { useClinicStaff } from "@/lib/case-assignment";

export const Route = createFileRoute("/_authenticated/dashboard/cases/$id")({
  head: () => ({ meta: [{ title: "Case — Clinic Intake Copilot" }] }),
  component: CaseView,
});

async function fetchCase(id: string): Promise<CaseLog | null> {
  const { data, error } = await supabase
    .from("agent_case_logs")
    .select("*")
    .eq("id", id as never)
    .maybeSingle();
  if (error) throw error;
  return (data as CaseLog | null) ?? null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
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
  else { val = Math.round(abs / (30 * day)); unit = "mo"; }
  return past ? `${val} ${unit}${val === 1 ? "" : "s"} ago` : `in ${val} ${unit}${val === 1 ? "" : "s"}`;
}
function queueLabel(q: string | null | undefined) {
  if (!q) return "Unassigned";
  if (q === "nurse_review") return "Nurse review";
  if (q === "front_desk") return "Front desk";
  return q.replace(/_/g, " ");
}
function statusLabel(s: string | null | undefined) {
  if (!s) return "New";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function statusTone(s: string | null | undefined) {
  const v = (s ?? "new").toLowerCase();
  if (v === "reviewed") return "border-routine/25 bg-routine-soft text-routine";
  if (v === "closed") return "border-border bg-muted text-muted-foreground";
  if (v === "in_progress") return "border-urgent/25 bg-urgent-soft text-urgent";
  return "border-foreground/15 bg-card text-foreground";
}
function redFlagsList(value: CaseLog["red_flags"]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

function Chip({
  icon: Icon, label, value, className = "",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string; value: React.ReactNode; className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${className}`}>
      {Icon && <Icon className="h-3 w-3 opacity-70" />}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function CaseView() {
  const { id } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Try cache from dashboard list first to avoid loading flicker
  const cachedList = queryClient.getQueryData<CaseLog[]>(["agent_case_logs"]);
  const initial =
    cachedList?.find((c) => String(c.id) === id) ??
    SAMPLE_CASES.find((c) => String(c.id) === id) ??
    null;

  const isSampleId = !!SAMPLE_CASES.find((c) => String(c.id) === id);

  const [sampleOverride, setSampleOverride] = useState<Partial<CaseLog>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["agent_case_log", id],
    queryFn: () => fetchCase(id),
    enabled: !isSampleId,
    initialData: !isSampleId ? initial ?? undefined : undefined,
  });

  const caseLog = useMemo(() => {
    const base = isSampleId ? initial : (data ?? initial);
    if (!base) return null;
    return { ...base, ...sampleOverride } as CaseLog;
  }, [data, initial, isSampleId, sampleOverride]);

  const { markReviewed, closeCase, assignCase } = useCaseMutations({
    usingSample: isSampleId,
    onSampleUpdate: (_, patch) => setSampleOverride((p) => ({ ...p, ...patch })),
  });

  const me = useCurrentMembership();
  const staff = useClinicStaff();
  const isAdmin = me.data?.role === "clinic_admin";
  const canReassign = !isSampleId && (isAdmin || (caseLog?.assigned_user_id === me.data?.user_id));
  const assigneeMember = staff.data?.find((s) => s.user_id === caseLog?.assigned_user_id) ?? null;

  const goBack = () => {
    if (window.history.length > 1) router.history.back();
    else router.navigate({ to: "/dashboard" });
  };

  const Header = (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto max-w-[960px] px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{caseLog?.session_id ?? (caseLog ? `#${caseLog.id}` : "—")}</span>
            {caseLog && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{fmtTime(caseLog.created_at)}</span>
              </>
            )}
          </div>
          <h1 className="truncate text-sm font-semibold text-foreground">
            {caseLog?.reason_for_visit ?? "Case"}
          </h1>
        </div>
        {caseLog && (
          <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${statusTone(caseLog.case_status)}`}>
            {statusLabel(caseLog.case_status)}
          </span>
        )}
      </div>
    </header>
  );

  if (isLoading && !caseLog) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Toaster position="top-right" />
        {Header}
        <main className="mx-auto max-w-[960px] px-6 py-10 space-y-4">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </main>
      </div>
    );
  }

  if (!caseLog) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Toaster position="top-right" />
        {Header}
        <main className="mx-auto max-w-[960px] px-6 py-16 text-center">
          <p className="text-sm font-medium">Case not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isError ? "Couldn't load this case." : "It may have been removed."}
          </p>
          <div className="mt-6">
            <Link to="/dashboard">
              <Button variant="outline" size="sm">Back to dashboard</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const flags = redFlagsList(caseLog.red_flags);
  const status = (caseLog.case_status ?? "new").toLowerCase();
  const isClosed = status === "closed";
  const reviewedDisabled = status === "reviewed" || isClosed || markReviewed.isPending;
  const closeDisabled = isClosed || closeCase.isPending;
  const assignDisabled = isClosed || assignCase.isPending;
  const assignedQueue = caseLog.assigned_to_queue;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" />
      {Header}

      <main className="mx-auto max-w-[960px] px-6 py-8 space-y-8">
        {/* Narrative */}
        <section>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span>{caseLog.contact_channel ?? "Unknown channel"}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{caseLog.age_band ?? "Age n/a"}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>Logged {relTime(caseLog.created_at)}</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {caseLog.reason_for_visit ?? "Reason not specified"}
          </h2>
          <blockquote className="mt-5 border-l-2 border-foreground/15 pl-5 text-[16px] leading-8 text-foreground/90">
            {caseLog.user_message ?? "No patient message provided."}
          </blockquote>

          {flags.length > 0 && (
            <div className="mt-6 rounded-lg border border-emergency/20 bg-emergency-soft px-4 py-3">
              <div className="flex items-center gap-2 text-emergency">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Red flags</span>
              </div>
              <ul className="mt-2 space-y-1">
                {flags.map((f, i) => <li key={i} className="text-sm">• {f}</li>)}
              </ul>
            </div>
          )}
        </section>

        {/* Metadata strip */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Chip label="Status" value={statusLabel(caseLog.case_status)} className={statusTone(caseLog.case_status)} />
          <Chip label="Urgency" value={<UrgencyBadge value={caseLog.urgency_level} />} className="border-border bg-card" />
          <Chip icon={Inbox} label="Queue" value={caseLog.recommended_queue ?? "Unassigned"} className="border-border bg-card" />
          {caseLog.escalation_required ? (
            <Chip icon={ShieldAlert} label="Escalation" value="Required" className="border-emergency/25 bg-emergency-soft text-emergency" />
          ) : (
            <Chip label="Escalation" value="Not required" className="border-border bg-card" />
          )}
          {assignedQueue && (
            <Chip icon={UserPlus} label="Queue" value={queueLabel(assignedQueue)} className="border-border bg-card" />
          )}
          <Chip
            icon={UserPlus}
            label="Assigned to"
            value={assigneeMember ? displayName(assigneeMember) : caseLog.assigned_user_id ? "—" : "Unassigned"}
            className="border-border bg-card"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
          <Button size="sm" disabled={reviewedDisabled} onClick={() => markReviewed.mutate(caseLog)}>
            <CheckCircle2 className="h-4 w-4" />
            {status === "reviewed" ? "Reviewed" : "Mark reviewed"}
          </Button>
          <AssignToControl caseLog={caseLog} canReassign={canReassign} />
          <Button size="sm" variant="ghost" disabled={assignDisabled} onClick={() => assignCase.mutate({ c: caseLog, queue: "nurse_review" })}>
            <UserPlus className="h-4 w-4" />
            {assignedQueue === "nurse_review" ? "Nurse queue ✓" : "Nurse queue"}
          </Button>
          <Button size="sm" variant="ghost" disabled={assignDisabled} onClick={() => assignCase.mutate({ c: caseLog, queue: "front_desk" })}>
            <UserPlus className="h-4 w-4" />
            {assignedQueue === "front_desk" ? "Front desk ✓" : "Front desk"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toast.success("Calling patient…")}>
            <Phone className="h-4 w-4" /> Call
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" disabled={closeDisabled} onClick={() => closeCase.mutate(caseLog)}>
            <XCircle className="h-4 w-4" /> {isClosed ? "Closed" : "Close case"}
          </Button>
        </div>

        {/* Supporting */}
        <section className="space-y-3">
          <SectionHeader icon={ListChecks}>Triage</SectionHeader>
          <div className="space-y-4 rounded-lg border border-border bg-card px-5 py-4">
            <Field label="Next action">{caseLog.next_action ?? "—"}</Field>
            <Field label="Staff summary">{caseLog.staff_summary ?? "No staff summary generated."}</Field>
            <Field label="Human-readable summary">{caseLog.human_readable_summary ?? "—"}</Field>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader icon={Mail}>Patient-facing message</SectionHeader>
          <p className="rounded-lg border border-border bg-card px-5 py-4 text-sm leading-relaxed">
            {caseLog.patient_message ?? "—"}
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeader icon={Clock}>Activity</SectionHeader>
          <ol className="space-y-3 rounded-lg border border-border bg-card px-5 py-4">
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
                    <div className="text-sm font-medium">{ev.label}</div>
                    <div className="text-xs text-muted-foreground">{relTime(ev.iso)}</div>
                    <div className="text-[11px] text-muted-foreground/70">{fmtTime(ev.iso)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({ icon: Icon, children }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
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
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

type TimelineEvent = { key: string; label: string; iso: string; icon: React.ComponentType<{ className?: string }> };
function buildTimeline(c: CaseLog): TimelineEvent[] {
  const events: TimelineEvent[] = [{ key: "intake", label: "Intake received", iso: c.created_at, icon: Inbox }];
  if (c.assigned_at && c.assigned_to_queue === "nurse_review")
    events.push({ key: "assigned_nurse", label: "Assigned to nurse", iso: c.assigned_at, icon: UserPlus });
  if (c.assigned_at && c.assigned_to_queue === "front_desk")
    events.push({ key: "assigned_front", label: "Assigned to front desk", iso: c.assigned_at, icon: UserPlus });
  if (c.reviewed_at) events.push({ key: "reviewed", label: "Marked reviewed", iso: c.reviewed_at, icon: CheckCircle2 });
  if (c.closed_at) events.push({ key: "closed", label: "Case closed", iso: c.closed_at, icon: XCircle });
  return events.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
}
