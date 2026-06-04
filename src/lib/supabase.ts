// Re-export the persistent, authenticated Supabase client from the integration.
// Sessions are persisted in localStorage so RLS sees the signed-in staff user.
export { supabase } from "@/integrations/supabase/client";

export type Urgency = "emergency" | "urgent_same_day" | "routine" | "admin_only" | string;

export type CaseStatus = "new" | "reviewed" | "in_progress" | "closed" | string;

export interface CaseLog {
  id?: string | number;
  business_id?: string | null;
  session_id: string | null;
  user_message: string | null;
  age_band: string | null;
  contact_channel: string | null;
  reason_for_visit: string | null;
  urgency_level: Urgency | null;
  case_status?: CaseStatus | null;
  recommended_queue: string | null;
  escalation_required: boolean | null;
  red_flags: string[] | string | null;
  next_action: string | null;
  staff_summary: string | null;
  patient_message: string | null;
  human_readable_summary: string | null;
  created_at: string;
  reviewed_at?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
  assigned_to_queue?: string | null;
  assigned_at?: string | null;
  assigned_user_id?: string | null;
  assigned_by_user_id?: string | null;
}
