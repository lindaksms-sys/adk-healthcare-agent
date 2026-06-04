from typing import List, Literal
from pydantic import BaseModel, Field
from google.adk.agents.llm_agent import Agent
import re
import os
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


class TriageOutput(BaseModel):
    age_band: str = Field(description="Estimated age band from the user message")
    contact_channel: str = Field(description="Preferred contact channel such as chat, phone, or whatsapp")
    reason_for_visit: str = Field(description="High-level visit reason bucket")
    urgency_level: Literal["emergency", "urgent_same_day", "routine", "admin_only"] = Field(
        description="Urgency classification"
    )
    recommended_queue: str = Field(description="Clinic queue to route the case into")
    escalation_required: bool = Field(description="Whether a human should urgently review this case")
    red_flags: List[str] = Field(default_factory=list, description="Detected red-flag phrases")
    next_action: str = Field(description="Operational next step for staff")
    staff_summary: str = Field(description="Short internal summary for clinic staff")
    patient_message: str = Field(description="Short safe message for the patient")
    human_readable_summary: str = Field(description="One-line action summary for demos and staff review")


RED_FLAG_PATTERNS = [
    "heavy bleeding",
    "severe bleeding",
    "soaked more than one pad",
    "soaking pads",
    "soaking through pads",
    "chest pain",
    "shortness of breath",
    "difficulty breathing",
    "cant breathe",
    "can't breathe",
    "fainted",
    "fainting",
    "passed out",
    "seizure",
    "convulsion",
    "severe headache",
    "worst headache",
    "blurred vision",
    "vision changes",
    "confused",
    "confusion",
    "suicidal",
    "thoughts of self harm",
    "can't feel baby",
    "cannot feel baby",
    "baby not moving",
    "reduced fetal movement",
]


def normalize_urgency_level(value: str) -> str:
    raw = (value or "").strip().lower()

    exact_allowed = {"emergency", "urgent_same_day", "routine", "admin_only"}
    if raw in exact_allowed:
        return raw

    synonym_map = {
        "emergent": "emergency",
        "emergency_case": "emergency",
        "urgent": "urgent_same_day",
        "same_day": "urgent_same_day",
        "same day": "urgent_same_day",
        "urgent same day": "urgent_same_day",
        "admin": "admin_only",
        "administrative": "admin_only",
        "admin request": "admin_only",
    }

    if raw in synonym_map:
        return synonym_map[raw]

    return raw


def extract_intake(user_input: str) -> dict:
    text = user_input.lower()

    age_band = "unknown"
    if re.search(r"\b(1[3-9]|2[0-9])\b", text):
        age_band = "teen_or_20s"
    elif re.search(r"\b(3[0-9]|4[0-9])\b", text):
        age_band = "30s_or_40s"
    elif re.search(r"\b(5[0-9]|6[0-9])\b", text):
        age_band = "50s_or_60s"

    contact_channel = "chat"
    if "call me" in text or "phone" in text or "voice note" in text:
        contact_channel = "phone"
    if "whatsapp" in text:
        contact_channel = "whatsapp"

    reason = "general_womens_health"
    if "pregnan" in text or "postpartum" in text or "after delivery" in text or "after birth" in text:
        reason = "pregnancy_or_postpartum"
    elif "contrace" in text or "birth control" in text or "family planning" in text:
        reason = "family_planning"
    elif "period" in text or "bleeding" in text or "pelvic" in text or "discharge" in text or "spotting" in text:
        reason = "gynae_symptoms"
    elif any(
        k in text
        for k in [
            "reschedule",
            "cancel",
            "move my appointment",
            "change my time",
            "booking",
            "billing",
            "invoice",
            "payment",
            "opening hours",
            "clinic hours",
            "open on saturday",
            "what services",
            "services do you offer",
        ]
    ):
        reason = "admin"

    return {
        "age_band": age_band,
        "contact_channel": contact_channel,
        "reason_for_visit": reason,
        "raw_text": user_input,
    }


def route_urgency(user_input: str) -> dict:
    text = user_input.lower()
    found = [p for p in RED_FLAG_PATTERNS if p in text]

    if found:
        return {
            "urgency_level": "emergency",
            "red_flags": found,
            "recommended_queue": "nurse_review",
            "escalation_required": True,
            "patient_message": (
                "Your symptoms may need urgent medical review. "
                "Please contact your clinic now, and if you feel very unwell, have heavy bleeding, chest pain, or trouble breathing, seek emergency care."
            ),
        }

    if any(x in text for x in ["urgent", "asap", "today", "getting worse", "worse today", "severe pain", "very painful"]):
        return {
            "urgency_level": "urgent_same_day",
            "red_flags": [],
            "recommended_queue": "nurse_review",
            "escalation_required": True,
            "patient_message": (
                "A nurse or clinician should review this today. "
                "If your symptoms worsen suddenly, seek urgent medical care."
            ),
        }

    if any(
        x in text
        for x in [
            "reschedule",
            "cancel",
            "move my appointment",
            "change my time",
            "booking",
            "billing",
            "invoice",
            "payment",
            "clinic hours",
            "opening hours",
            "open on saturday",
        ]
    ):
        return {
            "urgency_level": "admin_only",
            "red_flags": [],
            "recommended_queue": "front_desk",
            "escalation_required": False,
            "patient_message": "This looks like an administrative request. The front-desk team will follow up.",
        }

    return {
        "urgency_level": "routine",
        "red_flags": [],
        "recommended_queue": "womens_health_queue",
        "escalation_required": False,
        "patient_message": "Your message has been captured for routine follow-up by the clinic team.",
    }


def next_step_plan(reason_for_visit: str, urgency_level: str) -> dict:
    urgency_level = normalize_urgency_level(urgency_level)

    if urgency_level == "emergency":
        return {
            "next_action": "immediate_human_escalation",
            "staff_summary": "Red-flag case. Escalate now and contact patient urgently.",
        }

    if urgency_level == "urgent_same_day":
        return {
            "next_action": "same_day_callback",
            "staff_summary": "Same-day nurse review needed. Call patient today.",
        }

    if urgency_level == "admin_only":
        return {
            "next_action": "front_desk_resolution",
            "staff_summary": "Admin request. Front desk to resolve.",
        }

    action_map = {
        "pregnancy_or_postpartum": "book_maternal_visit",
        "family_planning": "book_family_planning_visit",
        "gynae_symptoms": "book_gynae_assessment",
        "admin": "front_desk_resolution",
        "general_womens_health": "book_routine_consult",
    }

    summary_map = {
        "pregnancy_or_postpartum": "Routine maternal follow-up. Book review.",
        "family_planning": "Family planning request. Book consult.",
        "gynae_symptoms": "Gynae symptoms reported. Book assessment.",
        "admin": "Admin request. Front desk to resolve.",
        "general_womens_health": "Routine women’s health visit. Book consult.",
    }

    return {
        "next_action": action_map.get(reason_for_visit, "book_routine_consult"),
        "staff_summary": summary_map.get(reason_for_visit, "Routine case. Book based on visit reason."),
    }


def build_triage_output(intake: dict, urgency: dict, plan: dict) -> dict:
    normalized_urgency = normalize_urgency_level(urgency["urgency_level"])

    payload = {
        "age_band": intake["age_band"],
        "contact_channel": intake["contact_channel"],
        "reason_for_visit": intake["reason_for_visit"],
        "urgency_level": normalized_urgency,
        "recommended_queue": urgency["recommended_queue"],
        "escalation_required": urgency["escalation_required"],
        "red_flags": urgency["red_flags"],
        "next_action": plan["next_action"],
        "staff_summary": plan["staff_summary"],
        "patient_message": urgency["patient_message"],
        "human_readable_summary": f"{normalized_urgency} -> {plan['next_action']} -> {plan['staff_summary']}",
    }
    validated = TriageOutput(**payload)
    return validated.model_dump()


def triage_case(user_input: str) -> dict:
    intake = extract_intake(user_input)
    urgency = route_urgency(user_input)
    urgency["urgency_level"] = normalize_urgency_level(urgency["urgency_level"])
    plan = next_step_plan(intake["reason_for_visit"], urgency["urgency_level"])
    return build_triage_output(intake, urgency, plan)


def clinic_services() -> dict:
    return {
        "services": [
            "routine_wellness_visit",
            "family_planning",
            "gynae_assessment",
            "maternal_followup",
            "postpartum_review",
        ]
    }


def clinic_hours() -> dict:
    return {
        "weekday_hours": "08:00-17:00",
        "saturday_hours": "09:00-13:00",
        "sunday_hours": "closed",
    }


def save_case_log(
    session_id: str,
    user_message: str,
    age_band: str,
    contact_channel: str,
    reason_for_visit: str,
    urgency_level: str,
    recommended_queue: str,
    escalation_required: bool,
    red_flags: List[str],
    next_action: str,
    staff_summary: str,
    patient_message: str,
    human_readable_summary: str,
) -> dict:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return {"saved": False, "error": "Missing Supabase env vars"}

    normalized_urgency = normalize_urgency_level(urgency_level)

    validated = TriageOutput(
        age_band=age_band,
        contact_channel=contact_channel,
        reason_for_visit=reason_for_visit,
        urgency_level=normalized_urgency,
        recommended_queue=recommended_queue,
        escalation_required=escalation_required,
        red_flags=red_flags,
        next_action=next_action,
        staff_summary=staff_summary,
        patient_message=patient_message,
        human_readable_summary=human_readable_summary,
    ).model_dump()

    payload = {
        "session_id": session_id,
        "user_message": user_message,
        **validated,
    }

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
    }

    url = f"{SUPABASE_URL}/rest/v1/agent_case_logs"

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=20)

        if response.ok:
            try:
                return {"saved": True, "data": response.json()}
            except Exception:
                return {"saved": True, "data": response.text}

        return {
            "saved": False,
            "status_code": response.status_code,
            "error": response.text,
        }

    except Exception as e:
        return {"saved": False, "error": str(e)}


root_agent = Agent(
    model="gemini-2.5-flash",
    name="womens_clinic_ops_agent",
    description=(
        "Healthcare operations agent for a women's clinic. "
        "Handles intake, urgency routing, service guidance, and follow-up coordination."
    ),
    instruction=(
        "You are a healthcare operations assistant for a women's clinic. "
        "You help with intake, urgency routing, and clinic workflow. "
        "You do not diagnose, prescribe, or provide definitive clinical advice. "
        "For serious symptoms, prioritize human escalation and safe language. "
        "If a message contains both an administrative request and a symptom concern, prioritize the higher-risk clinical issue first. "
        "For intake, triage, or admin-routing cases, use triage_case to generate the final result. "
        "For intake, triage, or admin-routing cases, after creating the final structured result, call save_case_log with exactly the same final fields. "
        "Use clinic_services only when the user asks about available services. "
        "Use clinic_hours only when the user asks about clinic timings. "
        "For simple clinic services or clinic hours questions, answer helpfully and do not call save_case_log. "
        "urgency_level must be exactly one of: emergency, urgent_same_day, routine, admin_only. "
        "Do not use synonyms like emergent or admin. "
        "Return only valid JSON matching the final result."
    ),
    tools=[
        extract_intake,
        route_urgency,
        next_step_plan,
        build_triage_output,
        triage_case,
        clinic_services,
        clinic_hours,
        save_case_log,
    ],
)