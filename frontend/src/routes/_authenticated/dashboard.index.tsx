import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Activity, RefreshCw, LogOut, X, Users } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase, type CaseLog } from "@/lib/supabase";
import { SAMPLE_CASES } from "@/lib/sample-cases";
import { normalizeUrgency, type UrgencyKey } from "@/lib/urgency";
import { StatsCards } from "@/components/StatsCards";
import { OpsMetrics } from "@/components/OpsMetrics";
import { CaseListItem } from "@/components/CaseListItem";
import { KPI_LABEL, matchesKpi, type KpiFilterKey } from "@/lib/kpi-filters";
import { useCurrentMembership, type StaffMember } from "@/lib/clinic";
import { useClinicStaff } from "@/lib/case-assignment";

type FilterKey = "all" | UrgencyKey;
type ScopeKey = "mine" | "unassigned" | "assigned" | "all";

type DashboardSearch = {
  q?: string;
  filter?: FilterKey;
  kpi?: KpiFilterKey;
  scope?: ScopeKey;
};

const ALLOWED_FILTERS: FilterKey[] = ["all", "emergency", "urgent", "routine", "admin"];
const ALLOWED_KPIS: KpiFilterKey[] = Object.keys(KPI_LABEL) as KpiFilterKey[];
const ALLOWED_SCOPES: ScopeKey[] = ["mine", "unassigned", "assigned", "all"];

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Clinic Intake Copilot" },
      { name: "description", content: "AI-triaged incoming patient cases for clinic staff review." },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): DashboardSearch => {
    const out: DashboardSearch = {};
    if (typeof raw.q === "string" && raw.q) out.q = raw.q;
    if (typeof raw.filter === "string" && (ALLOWED_FILTERS as string[]).includes(raw.filter)) {
      out.filter = raw.filter as FilterKey;
    }
    if (typeof raw.kpi === "string" && (ALLOWED_KPIS as string[]).includes(raw.kpi)) {
      out.kpi = raw.kpi as KpiFilterKey;
    }
    if (typeof raw.scope === "string" && (ALLOWED_SCOPES as string[]).includes(raw.scope)) {
      out.scope = raw.scope as ScopeKey;
    }
    return out;
  },
  component: Dashboard,
});

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "emergency", label: "Emergency" },
  { key: "urgent", label: "Urgent" },
  { key: "routine", label: "Routine" },
  { key: "admin", label: "Admin" },
];

async function fetchCases(): Promise<CaseLog[]> {
  const { data, error } = await supabase
    .from("agent_case_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as CaseLog[];
}

function Dashboard() {
  const navigate = useNavigate({ from: "/dashboard" });
  const search = Route.useSearch();
  const filter: FilterKey = search.filter ?? "all";
  const kpiFilter: KpiFilterKey | null = search.kpi ?? null;
  const query = search.q ?? "";

  const me = useCurrentMembership();
  const isAdmin = me.data?.role === "clinic_admin";
  const myUserId = me.data?.user_id ?? null;
  const defaultScope: ScopeKey = isAdmin ? "all" : "mine";
  const scope: ScopeKey = search.scope ?? defaultScope;

  const staff = useClinicStaff();
  const staffById = useMemo(() => {
    const m = new Map<string, StaffMember>();
    for (const s of staff.data ?? []) m.set(s.user_id, s);
    return m;
  }, [staff.data]);

  const [queryDraft, setQueryDraft] = useState(query);
  const queryClient = useQueryClient();

  const updateSearch = (patch: Partial<DashboardSearch>) => {
    navigate({
      search: (prev: DashboardSearch) => {
        const next: DashboardSearch = { ...prev, ...patch };
        if (!next.q) delete next.q;
        if (!next.filter || next.filter === "all") delete next.filter;
        if (!next.kpi) delete next.kpi;
        if (!next.scope || next.scope === defaultScope) delete next.scope;
        return next;
      },
      replace: true,
    });
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["agent_case_logs"],
    queryFn: fetchCases,
    refetchOnWindowFocus: false,
  });


  const liveCases = data ?? [];
  const usingSample = !isLoading && !isError && liveCases.length === 0;
  const allCases = liveCases.length > 0 ? liveCases : SAMPLE_CASES;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCases.filter((c) => {
      if (scope === "mine" && c.assigned_user_id !== myUserId) return false;
      if (scope === "unassigned" && c.assigned_user_id) return false;
      if (scope === "assigned" && !c.assigned_user_id) return false;
      if (kpiFilter && !matchesKpi(c, kpiFilter)) return false;
      if (filter !== "all" && normalizeUrgency(c.urgency_level) !== filter) return false;
      if (!q) return true;
      return [c.user_message, c.staff_summary, c.reason_for_visit]
        .some((f) => (f ?? "").toLowerCase().includes(q));
    });
  }, [allCases, filter, kpiFilter, query, scope, myUserId]);

  const SCOPES: { key: ScopeKey; label: string; show: boolean }[] = [
    { key: "mine", label: "My cases", show: true },
    { key: "unassigned", label: "Unassigned", show: true },
    { key: "assigned", label: "Assigned", show: isAdmin },
    { key: "all", label: "All", show: isAdmin },
  ];

  const handleSelect = (c: CaseLog) => {
    if (c.id == null) return;
    navigate({ to: "/dashboard/cases/$id", params: { id: String(c.id) } });
  };

  const handleKpiSelect = (key: KpiFilterKey) => {
    const next = kpiFilter === key ? undefined : key;
    updateSearch({ kpi: next, filter: undefined });
  };

  const handleStatsSelect = (key: KpiFilterKey | "total") => {
    if (key === "total") {
      updateSearch({ kpi: undefined, filter: undefined });
      return;
    }
    handleKpiSelect(key);
  };

  const handleTabSelect = (key: FilterKey) => {
    updateSearch({ filter: key, kpi: undefined });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" />
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-6 py-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Clinic Intake Copilot</h1>
                <p className="text-xs text-muted-foreground">AI-triaged incoming cases</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {usingSample && (
                <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  Showing sample data
                </span>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={queryDraft}
                  onChange={(e) => {
                    setQueryDraft(e.target.value);
                    updateSearch({ q: e.target.value });
                  }}
                  placeholder="Search messages, reasons…"
                  className="h-9 w-64 pl-8 bg-card"
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/dashboard/staff" })}>
                <Users className="h-4 w-4" /> Staff
              </Button>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" variant="ghost" onClick={handleSignOut} title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex gap-1 border-b border-border/60">
            {SCOPES.filter((s) => s.show).map((s) => {
              const active = scope === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => updateSearch({ scope: s.key })}
                  className={`relative px-3 py-2 text-sm transition-colors
                    ${active ? "font-semibold text-foreground" : "font-medium text-muted-foreground/80 hover:text-foreground"}`}
                >
                  {s.label}
                  {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-foreground" />}
                </button>
              );
            })}
          </div>



          <div className="mt-5 space-y-2.5">
            <OpsMetrics cases={allCases} activeKpi={kpiFilter} onSelect={handleKpiSelect} />
            <StatsCards cases={allCases} activeKpi={kpiFilter} onSelect={handleStatsSelect} />
          </div>

          <div className="mt-2 flex gap-1 border-b border-border/60">
            {FILTERS.map((f) => {
              const active = !kpiFilter && filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => handleTabSelect(f.key)}
                  className={`relative px-3 py-2 text-sm transition-colors
                    ${active ? "font-semibold text-foreground" : "font-medium text-muted-foreground/80 hover:text-foreground"}`}
                >
                  {f.label}
                  {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-foreground" />}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-6">
        {isError && (
          <div className="mb-4 rounded-lg border border-emergency/20 bg-emergency-soft px-4 py-3 text-sm text-emergency">
            Couldn't reach Supabase. Showing sample data so you can preview the UI.
          </div>
        )}

        <section aria-label="Case list" className="space-y-2">
          {kpiFilter && (
            <div className="flex items-center justify-between rounded-md border border-border/70 bg-foreground/[0.03] px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                Filtered by: <span className="font-medium text-foreground">{KPI_LABEL[kpiFilter]}</span>
                <span className="ml-1.5 tabular-nums text-muted-foreground/80">({filtered.length})</span>
              </span>
              <button
                type="button"
                onClick={() => updateSearch({ kpi: undefined })}
                className="inline-flex cursor-pointer items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            </div>
          )}
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
            ))
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">No cases found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try changing the filter or clearing your search.
              </p>
            </div>
          ) : (
            filtered.map((c, idx) => (
              <CaseListItem
                key={(c.id ?? c.session_id ?? idx) as React.Key}
                caseLog={c}
                selected={false}
                onSelect={() => handleSelect(c)}
                staffById={staffById}
              />
            ))
          )}
        </section>
      </main>
    </div>
  );
}