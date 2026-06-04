import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  HeartPulse,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/intake")({
  head: () => ({
    meta: [
      { title: "Patient intake — Clinic Intake Copilot" },
      {
        name: "description",
        content:
          "Share your details and reason for visit. A nurse will review your request and follow up.",
      },
    ],
  }),
  component: IntakePage,
});

type ContactChannel = "chat" | "phone" | "whatsapp";
type ReasonCategory =
  | "pregnancy"
  | "gynae"
  | "family_planning"
  | "admin"
  | "general";
type PregnancyStatus =
  | "unknown"
  | "not_pregnant"
  | "possibly"
  | "pregnant"
  | "postpartum";
type Severity = "mild" | "moderate" | "severe";
type FamilyPlanningTopic =
  | "start_contraception"
  | "change_method"
  | "side_effects"
  | "post_delivery_advice";
type AdminRequestType =
  | "book_appointment"
  | "reschedule_appointment"
  | "cancel_appointment"
  | "clinic_hours"
  | "services"
  | "billing";

interface IntakeResponse {
  id: string | number;
  patient_message: string;
  urgency_level: string;
  recommended_queue: string;
}

const URGENCY_LABEL: Record<string, string> = {
  emergency: "Emergency",
  urgent_same_day: "Urgent — same day",
  routine: "Routine",
  admin_only: "Administrative",
};
const QUEUE_LABEL: Record<string, string> = {
  emergency: "Emergency response",
  nurse_review: "Nurse review",
  front_desk: "Front desk",
};

const REASON_OPTIONS: { value: ReasonCategory; label: string; hint: string }[] = [
  { value: "pregnancy", label: "Pregnancy / postpartum", hint: "Prenatal, postpartum, baby movement" },
  { value: "gynae", label: "Gynae symptoms", hint: "Bleeding, pain, discharge, period changes" },
  { value: "family_planning", label: "Family planning", hint: "Contraception, methods, side effects" },
  { value: "admin", label: "Administrative request", hint: "Appointments, hours, billing" },
  { value: "general", label: "General women's health", hint: "Anything else" },
];

const GYNAE_SYMPTOMS = [
  "Bleeding",
  "Discharge",
  "Pelvic pain",
  "Missed period",
  "Urinary symptoms",
];

const PREGNANCY_LABEL: Record<string, string> = {
  unknown: "Prefer not to say",
  not_pregnant: "Not pregnant",
  possibly: "Possibly pregnant",
  pregnant: "Pregnant",
  postpartum: "Recently delivered",
};
const SEVERITY_LABEL: Record<string, string> = {
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
};
const FP_LABEL: Record<string, string> = {
  start_contraception: "Start contraception",
  change_method: "Change method",
  side_effects: "Side effects",
  post_delivery_advice: "Advice after delivery",
};
const ADMIN_LABEL: Record<string, string> = {
  book_appointment: "Book appointment",
  reschedule_appointment: "Reschedule appointment",
  cancel_appointment: "Cancel appointment",
  clinic_hours: "Ask about clinic hours",
  services: "Ask about services",
  billing: "Billing / payment",
};
const CHANNEL_LABEL: Record<string, string> = {
  chat: "Chat",
  phone: "Phone",
  whatsapp: "WhatsApp",
};

const EMERGENCY_KEYWORDS = [
  "chest pain", "trouble breathing", "shortness of breath", "can't breathe",
  "cant breathe", "severe bleeding", "heavy bleeding", "unconscious",
  "passed out", "stroke", "suicidal", "overdose", "anaphylaxis", "severe pain",
  "baby not moving",
];

interface FormState {
  full_name: string;
  age_or_dob: string;
  contact_channel: ContactChannel | "";
  contact_value: string;

  reason_category: ReasonCategory | "";
  reason_for_visit: string;
  details: string;

  // Pregnancy
  pregnancy_status: PregnancyStatus | "";
  weeks_pregnant: string;
  weeks_postpartum: string;
  baby_movement_concern: boolean;
  bleeding_or_severe_pain: boolean;
  last_menstrual_period: string;

  // Gynae
  gynae_symptoms: string[];
  symptom_duration: string;
  symptom_severity: Severity | "";

  // Family planning
  family_planning_topic: FamilyPlanningTopic | "";

  // Admin
  admin_request_type: AdminRequestType | "";

  consent: boolean;
}

const INITIAL: FormState = {
  full_name: "",
  age_or_dob: "",
  contact_channel: "",
  contact_value: "",
  reason_category: "",
  reason_for_visit: "",
  details: "",
  pregnancy_status: "",
  weeks_pregnant: "",
  weeks_postpartum: "",
  baby_movement_concern: false,
  bleeding_or_severe_pain: false,
  last_menstrual_period: "",
  gynae_symptoms: [],
  symptom_duration: "",
  symptom_severity: "",
  family_planning_topic: "",
  admin_request_type: "",
  consent: false,
};

function IntakePage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const redFlag = useMemo(() => {
    const text = `${form.reason_for_visit} ${form.details} ${form.gynae_symptoms.join(" ")}`.toLowerCase();
    if (EMERGENCY_KEYWORDS.some((kw) => text.includes(kw))) return true;
    if (form.baby_movement_concern || form.bleeding_or_severe_pain) return true;
    if (form.symptom_severity === "severe") return true;
    if (form.gynae_symptoms.includes("Bleeding") && form.bleeding_or_severe_pain) return true;
    return false;
  }, [form]);

  const step1Valid =
    form.full_name.trim().length > 0 &&
    form.age_or_dob.trim().length > 0 &&
    form.contact_channel !== "" &&
    form.contact_value.trim().length > 0;

  const step2Valid = (() => {
    if (!form.reason_category) return false;
    switch (form.reason_category) {
      case "admin":
        return !!form.admin_request_type;
      case "family_planning":
        return !!form.family_planning_topic;
      case "pregnancy":
        return !!form.pregnancy_status && form.details.trim().length >= 3;
      case "gynae":
        return form.gynae_symptoms.length > 0 && form.details.trim().length >= 3;
      case "general":
        return form.details.trim().length >= 3;
      default:
        return false;
    }
  })();

  const canSubmit = step1Valid && step2Valid && form.consent;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const cat = form.reason_category as ReasonCategory;
      const reasonLabel =
        REASON_OPTIONS.find((r) => r.value === cat)?.label ?? "";

      // Build clean payload — only fields relevant to the selected category.
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        age_or_dob: form.age_or_dob.trim(),
        contact_channel: form.contact_channel || null,
        contact_value: form.contact_value.trim(),
        reason_category: cat,
        reason_for_visit: reasonLabel,
        consent: form.consent,
      };
      if (form.details.trim()) payload.details = form.details.trim();

      if (cat === "pregnancy") {
        payload.pregnancy_status = form.pregnancy_status || null;
        if (form.weeks_pregnant.trim()) payload.weeks_pregnant = form.weeks_pregnant.trim();
        if (form.weeks_postpartum.trim()) payload.weeks_postpartum = form.weeks_postpartum.trim();
        if (form.baby_movement_concern) payload.baby_movement_concern = true;
        if (form.bleeding_or_severe_pain) payload.bleeding_or_severe_pain = true;
        if (form.last_menstrual_period) payload.last_menstrual_period = form.last_menstrual_period;
      }
      if (cat === "gynae") {
        payload.gynae_symptoms = form.gynae_symptoms;
        if (form.symptom_duration.trim()) payload.symptom_duration = form.symptom_duration.trim();
        if (form.symptom_severity) payload.symptom_severity = form.symptom_severity;
      }
      if (cat === "family_planning") {
        payload.family_planning_topic = form.family_planning_topic;
      }
      if (cat === "admin") {
        payload.admin_request_type = form.admin_request_type;
      }

      const res = await fetch("/api/public/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      if (!isJson) {
        const text = await res.text().catch(() => "");
        if (import.meta.env.DEV) {
          console.error("[intake] non-JSON response", res.status, text.slice(0, 500));
        }
        throw new Error(
          "We couldn't reach the intake service. Please try again in a moment.",
        );
      }

      const json = (await res.json().catch(() => null)) as
        | (IntakeResponse & { error?: string })
        | null;

      if (!res.ok || !json) {
        if (import.meta.env.DEV) {
          console.error("[intake] error response", res.status, json);
        }
        throw new Error(json?.error ?? "Something went wrong. Please try again.");
      }
      setResult(json as IntakeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNew = () => {
    setForm(INITIAL);
    setResult(null);
    setError(null);
    setStep(1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-5 py-8 sm:py-12">
        <header className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Clinic Intake</p>
            <p className="text-xs text-muted-foreground">Secure patient request</p>
          </div>
        </header>

        <div className="mt-7">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
            {result ? "Request received" : "Tell us what is going on"}
          </h1>
          {!result && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A nurse will review your request and follow up. Please share a few details
              so we can help you faster.
            </p>
          )}
        </div>

        {!result && (
          <div className="mt-5 flex gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              If you have severe bleeding, chest pain, trouble breathing, or feel very
              unwell, seek urgent medical care immediately.
            </p>
          </div>
        )}

        {!result && redFlag && (
          <div className="mt-3 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs leading-relaxed text-destructive">
              This may need urgent medical review. Please contact the clinic now or seek
              emergency care if symptoms are severe.
            </p>
          </div>
        )}

        {result ? (
          <ResponseCard result={result} onNew={handleNew} />
        ) : (
          <div className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
            <Stepper step={step} />

            {step === 1 && <StepContact form={form} set={set} />}
            {step === 2 && <StepReason form={form} set={set} />}
            {step === 3 && <StepReview form={form} set={set} />}

            {error && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              {step > 1 ? (
                <Button
                  variant="ghost"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  disabled={submitting}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              ) : (
                <span />
              )}

              {step < 3 ? (
                <Button
                  onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                  disabled={step === 1 ? !step1Valid : !step2Valid}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Review &amp; submit
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {!result && (
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Your information is sent securely to the clinic team.
          </p>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "Contact" },
    { n: 2, label: "Reason" },
    { n: 3, label: "Review" },
  ];
  return (
    <ol className="mb-6 flex items-center gap-2">
      {items.map((it, i) => {
        const active = step === it.n;
        const done = step > it.n;
        return (
          <li key={it.n} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                done
                  ? "border-foreground bg-foreground text-background"
                  : active
                    ? "border-foreground bg-background text-foreground"
                    : "border-border bg-background text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : it.n}
            </div>
            <span
              className={`text-xs ${
                active ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {it.label}
            </span>
            {i < items.length - 1 && <div className="ml-1 h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

type SetFn = <K extends keyof FormState>(k: K, v: FormState[K]) => void;

function StepContact({ form, set }: { form: FormState; set: SetFn }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input
          id="full_name"
          required
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          placeholder="Maria Rodriguez"
          autoComplete="name"
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="age_or_dob">Age or date of birth</Label>
        <Input
          id="age_or_dob"
          required
          value={form.age_or_dob}
          onChange={(e) => set("age_or_dob", e.target.value)}
          placeholder="34 or 1991-04-12"
          maxLength={40}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="channel">Preferred contact</Label>
          <Select
            value={form.contact_channel}
            onValueChange={(v) => set("contact_channel", v as ContactChannel)}
          >
            <SelectTrigger id="channel">
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_value">Phone or WhatsApp</Label>
          <Input
            id="contact_value"
            required
            value={form.contact_value}
            onChange={(e) => set("contact_value", e.target.value)}
            placeholder="+1 555 123 4567"
            inputMode="tel"
            autoComplete="tel"
            maxLength={60}
          />
        </div>
      </div>
    </div>
  );
}

function StepReason({ form, set }: { form: FormState; set: SetFn }) {
  const cat = form.reason_category;
  const isPostpartum = form.pregnancy_status === "postpartum";

  const toggleSymptom = (s: string) => {
    const next = form.gynae_symptoms.includes(s)
      ? form.gynae_symptoms.filter((x) => x !== s)
      : [...form.gynae_symptoms, s];
    set("gynae_symptoms", next);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>What is your reason for visit?</Label>
        <div className="grid gap-2">
          {REASON_OPTIONS.map((opt) => {
            const active = cat === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("reason_category", opt.value)}
                className={`flex flex-col items-start rounded-lg border px-4 py-3 text-left transition ${
                  active
                    ? "border-foreground bg-foreground/5"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                <span className="mt-0.5 text-[11px] text-muted-foreground">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {cat === "pregnancy" && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pregnancy">Pregnancy status</Label>
              <Select
                value={form.pregnancy_status}
                onValueChange={(v) => set("pregnancy_status", v as PregnancyStatus)}
              >
                <SelectTrigger id="pregnancy">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pregnant">Pregnant</SelectItem>
                  <SelectItem value="possibly">Possibly pregnant</SelectItem>
                  <SelectItem value="postpartum">Recently delivered</SelectItem>
                  <SelectItem value="not_pregnant">Not pregnant</SelectItem>
                  <SelectItem value="unknown">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weeks">
                {isPostpartum ? "Weeks since delivery" : "Weeks pregnant"}{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="weeks"
                value={isPostpartum ? form.weeks_postpartum : form.weeks_pregnant}
                onChange={(e) =>
                  isPostpartum
                    ? set("weeks_postpartum", e.target.value)
                    : set("weeks_pregnant", e.target.value)
                }
                placeholder="e.g. 28"
                inputMode="numeric"
                maxLength={20}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details-preg">What's going on?</Label>
            <Textarea
              id="details-preg"
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              placeholder="When did it start? How are you feeling?"
              rows={4}
              maxLength={2000}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
              <Checkbox
                checked={form.baby_movement_concern}
                onCheckedChange={(v) => set("baby_movement_concern", v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground">
                I'm worried about my baby's movements{" "}
                <span className="text-muted-foreground">(optional)</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
              <Checkbox
                checked={form.bleeding_or_severe_pain}
                onCheckedChange={(v) => set("bleeding_or_severe_pain", v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground">
                I have bleeding or severe pain{" "}
                <span className="text-muted-foreground">(optional)</span>
              </span>
            </label>
          </div>
        </div>
      )}

      {cat === "gynae" && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <Label>Which symptoms?</Label>
            <div className="flex flex-wrap gap-2">
              {GYNAE_SYMPTOMS.map((s) => {
                const active = form.gynae_symptoms.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSymptom(s)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-foreground hover:bg-muted/40"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Input
                id="duration"
                value={form.symptom_duration}
                onChange={(e) => set("symptom_duration", e.target.value)}
                placeholder="e.g. 3 days, 2 weeks"
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Select
                value={form.symptom_severity}
                onValueChange={(v) => set("symptom_severity", v as Severity)}
              >
                <SelectTrigger id="severity">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mild">Mild</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="severe">Severe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details-gynae">More details</Label>
            <Textarea
              id="details-gynae"
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              placeholder="Anything else the nurse should know?"
              rows={3}
              maxLength={2000}
              className="resize-none"
            />
          </div>
        </div>
      )}

      {cat === "family_planning" && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <Label>What would you like help with?</Label>
            <div className="grid gap-2">
              {(Object.keys(FP_LABEL) as FamilyPlanningTopic[]).map((k) => {
                const active = form.family_planning_topic === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("family_planning_topic", k)}
                    className={`rounded-lg border px-4 py-2.5 text-left text-sm transition ${
                      active
                        ? "border-foreground bg-foreground/5 font-medium"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    {FP_LABEL[k]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="details-fp">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="details-fp"
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              placeholder="Anything you'd like the nurse to know"
              rows={3}
              maxLength={2000}
              className="resize-none"
            />
          </div>
        </div>
      )}

      {cat === "admin" && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <Label>Request type</Label>
            <div className="grid gap-2">
              {(Object.keys(ADMIN_LABEL) as AdminRequestType[]).map((k) => {
                const active = form.admin_request_type === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("admin_request_type", k)}
                    className={`rounded-lg border px-4 py-2.5 text-left text-sm transition ${
                      active
                        ? "border-foreground bg-foreground/5 font-medium"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    {ADMIN_LABEL[k]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="details-admin">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="details-admin"
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              placeholder="Preferred date, reference number, etc."
              rows={3}
              maxLength={2000}
              className="resize-none"
            />
          </div>
        </div>
      )}

      {cat === "general" && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <Label htmlFor="details-gen">What's your concern?</Label>
            <Textarea
              id="details-gen"
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              placeholder="Describe what's going on in your own words."
              rows={5}
              maxLength={2000}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              {form.details.length}/2000
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function StepReview({ form, set }: { form: FormState; set: SetFn }) {
  const cat = form.reason_category as ReasonCategory;
  const reasonLabel = REASON_OPTIONS.find((r) => r.value === cat)?.label ?? "—";
  const isPostpartum = form.pregnancy_status === "postpartum";

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Review your details
        </p>
        <dl className="mt-2 divide-y divide-border">
          <ReviewRow label="Full name" value={form.full_name} />
          <ReviewRow label="Age / DOB" value={form.age_or_dob} />
          <ReviewRow
            label="Contact"
            value={
              form.contact_channel
                ? `${CHANNEL_LABEL[form.contact_channel]} · ${form.contact_value}`
                : form.contact_value
            }
          />
          <ReviewRow label="Reason" value={reasonLabel} />

          {cat === "pregnancy" && (
            <>
              <ReviewRow
                label="Pregnancy status"
                value={form.pregnancy_status ? PREGNANCY_LABEL[form.pregnancy_status] : null}
              />
              <ReviewRow
                label={isPostpartum ? "Weeks since delivery" : "Weeks pregnant"}
                value={isPostpartum ? form.weeks_postpartum : form.weeks_pregnant}
              />
              {form.baby_movement_concern && (
                <ReviewRow label="Baby movement concern" value="Yes" />
              )}
              {form.bleeding_or_severe_pain && (
                <ReviewRow label="Bleeding or severe pain" value="Yes" />
              )}
              <ReviewRow label="Last menstrual period" value={form.last_menstrual_period} />
            </>
          )}

          {cat === "gynae" && (
            <>
              <ReviewRow
                label="Symptoms"
                value={form.gynae_symptoms.join(", ") || null}
              />
              <ReviewRow label="Duration" value={form.symptom_duration} />
              <ReviewRow
                label="Severity"
                value={form.symptom_severity ? SEVERITY_LABEL[form.symptom_severity] : null}
              />
            </>
          )}

          {cat === "family_planning" && (
            <ReviewRow
              label="Help needed"
              value={
                form.family_planning_topic ? FP_LABEL[form.family_planning_topic] : null
              }
            />
          )}

          {cat === "admin" && (
            <ReviewRow
              label="Request"
              value={
                form.admin_request_type ? ADMIN_LABEL[form.admin_request_type] : null
              }
            />
          )}

          <ReviewRow label="Details" value={form.details} />
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Emergency disclaimer.</span>{" "}
          This intake form is not for emergencies. If you are experiencing a medical
          emergency, call your local emergency number or go to the nearest emergency
          room right away.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
        <Checkbox
          id="consent"
          checked={form.consent}
          onCheckedChange={(v) => set("consent", v === true)}
          className="mt-0.5"
        />
        <span className="text-xs leading-relaxed text-foreground">
          I consent to the clinic team contacting me about this request and storing the
          information I provided for my medical record.
        </span>
      </label>
    </div>
  );
}

function ResponseCard({
  result,
  onNew,
}: {
  result: IntakeResponse;
  onNew: () => void;
}) {
  const urgency = URGENCY_LABEL[result.urgency_level] ?? result.urgency_level;
  const queue = QUEUE_LABEL[result.recommended_queue] ?? result.recommended_queue;
  const isEmergency = result.urgency_level === "emergency";

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isEmergency
              ? "bg-destructive/10 text-destructive"
              : "bg-foreground/5 text-foreground"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">
            The clinic has received your request.
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {result.patient_message}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Urgency
          </dt>
          <dd
            className={`mt-1 font-medium ${
              isEmergency ? "text-destructive" : "text-foreground"
            }`}
          >
            {urgency}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Routed to
          </dt>
          <dd className="mt-1 font-medium text-foreground">{queue}</dd>
        </div>
      </dl>

      <Button variant="outline" className="mt-5 w-full" onClick={onNew}>
        Send another request
      </Button>
    </div>
  );
}
