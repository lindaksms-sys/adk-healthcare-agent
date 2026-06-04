import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const DEFAULT_BUSINESS_ID = "00000000-0000-0000-0000-000000000001";

type ClinicMembershipRow = Database["public"]["Tables"]["clinic_memberships"]["Row"];
type CaseAssignmentRow = Pick<
  Database["public"]["Tables"]["agent_case_logs"]["Row"],
  "assigned_user_id" | "case_status"
>;

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("clinic_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("business_id", DEFAULT_BUSINESS_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== "clinic_admin") {
    throw new Error("Forbidden: clinic admin only");
  }
}

export const listClinicStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Caller must at least be a member
    const { data: me, error: meErr } = await supabase
      .from("clinic_memberships")
      .select("business_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (meErr) throw new Error(meErr.message);
    if (!me) throw new Error("Not a clinic member");

    const businessId = me.business_id as string;

    const { data: memberships, error } = await supabase
      .from("clinic_memberships")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Open case counts per assignee
    const { data: openCases, error: ocErr } = await supabase
      .from("agent_case_logs")
      .select("assigned_user_id, case_status")
      .eq("business_id", businessId)
      .not("assigned_user_id", "is", null);
    if (ocErr) throw new Error(ocErr.message);

    const openCount = new Map<string, number>();
    for (const c of (openCases ?? []) as CaseAssignmentRow[]) {
      const s = (c.case_status ?? "new").toLowerCase();
      if (s === "closed") continue;
      const k = c.assigned_user_id as string;
      openCount.set(k, (openCount.get(k) ?? 0) + 1);
    }

    const membershipRows = (memberships ?? []) as ClinicMembershipRow[];
    const userIds = membershipRows.map((m) => m.user_id);
    const emailById = new Map<string, { email: string | null; last_sign_in_at: string | null }>();

    // Fetch emails via admin, but never let an auth-admin lookup break the staff UI.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let page = 1;
      while (true) {
        const { data, error: lerr } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (lerr) throw new Error(lerr.message);
        for (const u of data.users) {
          if (userIds.includes(u.id)) {
            emailById.set(u.id, {
              email: u.email ?? null,
              last_sign_in_at: u.last_sign_in_at ?? null,
            });
          }
        }
        if (data.users.length < 200) break;
        page += 1;
        if (page > 20) break;
      }
    } catch (error) {
      console.warn("Staff email lookup failed; rendering memberships without auth emails.", error);
    }

    return membershipRows.map((m) => ({
      ...m,
      email: emailById.get(m.user_id)?.email ?? null,
      last_sign_in_at: emailById.get(m.user_id)?.last_sign_in_at ?? null,
      assigned_open_count: openCount.get(m.user_id) ?? 0,
    }));
  });

const InviteSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["clinic_admin", "staff"]),
  full_name: z.string().trim().min(1).max(120).optional(),
  job_title: z.string().trim().min(1).max(120).optional(),
});

export const inviteStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InviteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find or invite the user
    let targetUserId: string | null = null;

    // Resolve the site URL for the invite redirect. Production must always
    // route to the live domain; localhost is only used in local dev.
    const siteUrl =
      process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "https://copilot.creativehauz.space";
    const redirectTo = `${siteUrl.replace(/\/$/, "")}/accept-invite`;

    // Try invite first
    const { data: invited, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      {
        data: { full_name: data.full_name ?? null, needs_password: true },
        redirectTo,
      },
    );

    if (invErr) {
      // Already registered? Look them up
      const msg = invErr.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        let page = 1;
        while (!targetUserId && page <= 20) {
          const { data: list, error: lerr } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: 200,
          });
          if (lerr) throw new Error(lerr.message);
          const found = list.users.find(
            (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
          );
          if (found) targetUserId = found.id;
          if (list.users.length < 200) break;
          page += 1;
        }
        if (!targetUserId) throw new Error("User exists but could not be located");
      } else {
        throw new Error(invErr.message);
      }
    } else {
      targetUserId = invited.user?.id ?? null;
    }

    if (!targetUserId) throw new Error("Could not resolve user id");

    const { error: upErr } = await supabaseAdmin.from("clinic_memberships").upsert(
      {
        business_id: DEFAULT_BUSINESS_ID,
        user_id: targetUserId,
        role: data.role,
        full_name: data.full_name ?? null,
        job_title: data.job_title ?? null,
      },
      { onConflict: "business_id,user_id" },
    );
    if (upErr) throw new Error(upErr.message);

    return { ok: true, user_id: targetUserId };
  });

const UpdateSchema = z.object({
  membership_id: z.string().uuid(),
  role: z.enum(["clinic_admin", "staff"]).optional(),
  full_name: z.string().trim().max(120).nullable().optional(),
  job_title: z.string().trim().max(120).nullable().optional(),
});

export const updateStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const patch: {
      role?: "clinic_admin" | "staff";
      full_name?: string | null;
      job_title?: string | null;
    } = {};
    if (data.role !== undefined) patch.role = data.role;
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.job_title !== undefined) patch.job_title = data.job_title;
    const { error } = await supabase
      .from("clinic_memberships")
      .update(patch)
      .eq("id", data.membership_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RemoveSchema = z.object({ membership_id: z.string().uuid() });

export const removeStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RemoveSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("clinic_memberships")
      .delete()
      .eq("id", data.membership_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
