import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}



const IntakeSchema = z.object({
  // Legacy single-message support
  message: z.string().trim().min(3).max(2000).optional(),
  contact_channel: z.enum(["chat", "phone", "whatsapp"]).optional().nullable(),
  age_band: z.string().optional().nullable(),
  age: z.number().int().min(0).max(120).optional(),


  // Structured intake fields
  full_name: z.string().trim().min(1).max(120).optional(),
  age_or_dob: z.string().trim().max(40).optional(),
  contact_value: z.string().trim().max(60).optional(),
  reason_for_visit: z.string().trim().min(1).max(200).optional(),
  reason_category: z
    .enum(["pregnancy", "gynae", "family_planning", "admin", "general"])
    .optional(),
  details: z.string().trim().max(2000).optional(),

  // Pregnancy / postpartum
  pregnancy_status: z
    .enum(["unknown", "not_pregnant", "possibly", "pregnant", "postpartum"])
    .optional()
    .nullable(),
  weeks_pregnant: z.string().trim().max(20).optional(),
  weeks_postpartum: z.string().trim().max(20).optional(),
  baby_movement_concern: z.boolean().optional(),
  bleeding_or_severe_pain: z.boolean().optional(),
  last_menstrual_period: z.string().trim().max(40).optional(),

  // Gynae
  gynae_symptoms: z.array(z.string().max(60)).max(20).optional(),
  symptom_duration: z.string().trim().max(60).optional(),
  symptom_severity: z.enum(["mild", "moderate", "severe"]).optional(),

  // Family planning
  family_planning_topic: z
    .enum(["start_contraception", "change_method", "side_effects", "post_delivery_advice"])
    .optional(),

  // Admin
  admin_request_type: z
    .enum([
      "book_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "clinic_hours",
      "services",
      "billing",
    ])
    .optional(),

  consent: z.boolean().optional(),
});

const EMERGENCY_KEYWORDS = [
  "chest pain", "trouble breathing", "can't breathe", "cant breathe",
  "severe bleeding", "heavy bleeding", "unconscious", "passed out",
  "stroke", "suicidal", "overdose", "anaphylaxis", "severe pain",
];
const URGENT_KEYWORDS = [
  "bleeding", "spotting", "fever", "pain", "vomit", "infection",
  "pregnan", "swelling", "rash", "burn", "injury",
];
const ADMIN_KEYWORDS = [
  "appointment", "reschedul", "prescription refill", "refill",
  "records", "invoice", "billing", "insurance",
];

function triage(message: string) {
  const m = message.toLowerCase();
  const red_flags: string[] = [];
  for (const kw of EMERGENCY_KEYWORDS) if (m.includes(kw)) red_flags.push(kw);

  let urgency_level: string = "routine";
  let recommended_queue = "nurse_review";
  let escalation_required = false;
  let next_action = "Nurse will review your message and follow up.";
  let patient_message =
    "Thank you for sharing this. A nurse will review your message and reach out with next steps.";

  if (red_flags.length > 0) {
    urgency_level = "emergency";
    recommended_queue = "emergency";
    escalation_required = true;
    next_action = "Advise patient to seek emergency care immediately.";
    patient_message =
      "Your symptoms may require urgent medical attention. Please seek emergency care now or call your local emergency number. Our team has also been alerted.";
  } else if (URGENT_KEYWORDS.some((kw) => m.includes(kw))) {
    urgency_level = "urgent_same_day";
    recommended_queue = "nurse_review";
    next_action = "Offer same-day nurse callback.";
    patient_message =
      "Thank you for reaching out. A nurse will review your message today and contact you with next steps.";
  } else if (ADMIN_KEYWORDS.some((kw) => m.includes(kw))) {
    urgency_level = "admin_only";
    recommended_queue = "front_desk";
    next_action = "Front desk will handle administrative request.";
    patient_message =
      "Thanks — your request has been routed to our front desk team. They will follow up shortly.";
  }

  return {
    urgency_level,
    recommended_queue,
    escalation_required,
    red_flags,
    next_action,
    patient_message,
  };
}

function ageToBand(age: number | null | undefined): string | null {
  if (age == null || !Number.isFinite(age)) return null;
  if (age >= 13 && age <= 29) return "teen_or_20s";
  if (age >= 30 && age <= 49) return "30s_or_40s";
  if (age >= 50 && age <= 69) return "50s_or_60s";
  return "unknown";
}

function parseAgeOrDob(input: string | null | undefined): number | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  // Plain number?
  if (/^\d{1,3}$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 0 && n <= 120 ? n : null;
  }
  // Try date parse (YYYY-MM-DD, MM/DD/YYYY, etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 0 && age <= 120 ? age : null;
  }
  return null;
}

export const Route = createFileRoute("/api/public/intake")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {

       try {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const parsed = IntakeSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "Invalid input", details: parsed.error.flatten() },
            400,
          );
        }

        const d = parsed.data;

        // Compose a structured user_message from the new fields, falling back
        // to the legacy single-message payload.
        const composedParts: string[] = [];
        if (d.reason_category) composedParts.push(`Category: ${d.reason_category}`);
        if (d.reason_for_visit) composedParts.push(`Reason: ${d.reason_for_visit}`);
        if (d.details) composedParts.push(`Details: ${d.details}`);

        if (d.reason_category === "pregnancy") {
          if (d.pregnancy_status && d.pregnancy_status !== "unknown")
            composedParts.push(`Pregnancy status: ${d.pregnancy_status}`);
          if (d.weeks_pregnant) composedParts.push(`Weeks pregnant: ${d.weeks_pregnant}`);
          if (d.weeks_postpartum)
            composedParts.push(`Weeks postpartum: ${d.weeks_postpartum}`);
          if (d.baby_movement_concern) composedParts.push("Baby movement concern: yes");
          if (d.bleeding_or_severe_pain)
            composedParts.push("Bleeding or severe pain: yes");
        }
        if (d.reason_category === "gynae") {
          if (d.gynae_symptoms?.length)
            composedParts.push(`Symptoms: ${d.gynae_symptoms.join(", ")}`);
          if (d.symptom_duration) composedParts.push(`Duration: ${d.symptom_duration}`);
          if (d.symptom_severity) composedParts.push(`Severity: ${d.symptom_severity}`);
        }
        if (d.reason_category === "family_planning" && d.family_planning_topic) {
          composedParts.push(`Family planning: ${d.family_planning_topic}`);
        }
        if (d.reason_category === "admin" && d.admin_request_type) {
          composedParts.push(`Admin request: ${d.admin_request_type}`);
        }
        if (d.last_menstrual_period) {
          composedParts.push(`Last menstrual period: ${d.last_menstrual_period}`);
        }
        if (d.full_name) composedParts.push(`Name: ${d.full_name}`);
        if (d.age_or_dob) composedParts.push(`Age/DOB: ${d.age_or_dob}`);
        if (d.contact_value && d.contact_channel) {
          composedParts.push(`Contact (${d.contact_channel}): ${d.contact_value}`);
        }

        const message =
          composedParts.length > 0
            ? composedParts.join("\n")
            : d.message ?? "";

        if (message.trim().length < 3) {
          return jsonResponse(
            { error: "Please describe the reason for your visit." },
            400,
          );
        }

        // Triage runs over the symptom/details text plus the reason and
        // structured conditional signals.
        const triageHints: string[] = [];
        if (d.gynae_symptoms?.length) triageHints.push(d.gynae_symptoms.join(" "));
        if (d.symptom_severity === "severe") triageHints.push("severe pain");
        if (d.baby_movement_concern) triageHints.push("baby not moving");
        if (d.bleeding_or_severe_pain) triageHints.push("heavy bleeding severe pain");
        if (d.reason_category === "admin") triageHints.push("appointment");

        const triageText =
          [d.reason_for_visit, d.details, d.message, ...triageHints]
            .filter(Boolean)
            .join(" ")
            .trim() || message;

        const t = triage(triageText);

        const session_id = crypto.randomUUID();
        const summarySource = d.reason_for_visit || d.details || d.message || message;
        const human_readable_summary =
          summarySource.length > 140 ? `${summarySource.slice(0, 137)}…` : summarySource;
        const namePrefix = d.full_name ? `${d.full_name} — ` : "";
        const staff_summary = `[${t.urgency_level}] ${namePrefix}${human_readable_summary}`;

        const { error } = await supabase
          .from("agent_case_logs")
          .insert({
            session_id,
            user_message: message,
            age_band: ageToBand(d.age ?? parseAgeOrDob(d.age_or_dob)) ?? d.age_band ?? null,
            contact_channel: d.contact_channel ?? null,
            reason_for_visit: d.reason_for_visit ?? null,
            urgency_level: t.urgency_level,
            recommended_queue: t.recommended_queue,
            escalation_required: t.escalation_required,
            red_flags: t.red_flags,
            next_action: t.next_action,
            staff_summary,
            patient_message: t.patient_message,
            human_readable_summary,
            case_status: "new",
          });

        if (error) {
          console.error("[intake] insert failed", error);
          return jsonResponse(
            { error: "Could not save your message. Please try again." },
            500,
          );
        }

        return jsonResponse({
          id: session_id,
          patient_message: t.patient_message,
          urgency_level: t.urgency_level,
          recommended_queue: t.recommended_queue,
        });
       } catch (err) {
         console.error("[intake] unhandled error", err);
         return jsonResponse(
           { error: "Submission failed. Please try again." },
           500,
         );
       }
      },
    },
  },
});
