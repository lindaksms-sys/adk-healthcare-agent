from typing import List, Literal
from pydantic import BaseModel, Field
from google.adk.agents.llm_agent import Agent
import re


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
    "chest pain",
    "shortness of breath",
    "difficulty breathing",
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
]


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
    if "pregnan" in text or "postpartum" in text or "after delivery" in text:
        reason = "pregnancy_or_postpartum"
    elif "contrace" in text or "birth control" in text or "family planning" in text:
        reason = "family_planning"
    elif "period" in text or "bleeding" in text or "pelvic" in text or "discharge" in text:
        reason = "gynae_symptoms"
    elif any(k in text for k in ["reschedule", "cancel", "move my appointment", "billing", "invoice", "payment"]):
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
                "Please contact your clinic now, and if you feel very unwell or have heavy bleeding, seek emergency care."
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
                "If symptoms worsen suddenly, seek urgent medical care."
            ),
        }

    if any(x in text for x in ["reschedule", "cancel", "move my appointment", "change my time", "billing", "invoice", "payment", "clinic hours"]):
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
    if urgency_level == "emergency":
        return {
            "next_action": "immediate_human_escalation",
            "staff_summary": (
                "Red-flag symptoms detected. Route to on-call nurse or clinician immediately and attempt live patient contact."
            ),
        }

    if urgency_level == "urgent_same_day":
        return {
            "next_action": "same_day_callback",
            "staff_summary": (
                "Same-day nurse callback required for symptom review and safety check."
            ),
        }

    if urgency_level == "admin_only":
        return {
            "next_action": "front_desk_resolution",
            "staff_summary": "Administrative request. Resolve via front desk or bookings team.",
        }

    queue_map = {
        "pregnancy_or_postpartum": "book_maternal_visit",
        "family_planning": "book_family_planning_visit",
        "gynae_symptoms": "book_gynae_assessment",
        "admin": "front_desk_resolution",
        "general_womens_health": "book_routine_consult",
    }

    action = queue_map.get(reason_for_visit, "book_routine_consult")

    return {
        "next_action": action,
        "staff_summary": f"Routine intake. Route according to reason_for_visit='{reason_for_visit}'.",
    }


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
        "sunday_hours": "closed"
    }


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
        "Use tools in this order when relevant: extract_intake, route_urgency, next_step_plan. "
        "Use clinic_services and clinic_hours only when the user asks about available services or timings. "
        "Return valid JSON matching the output schema exactly. "
        "Always include a short human_readable_summary that says what staff should do next."
    ),
    tools=[extract_intake, route_urgency, next_step_plan, clinic_services, clinic_hours],
    output_schema=TriageOutput,
)