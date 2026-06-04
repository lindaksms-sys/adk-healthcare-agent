import { normalizeUrgency } from "@/lib/urgency";
import type { CaseLog } from "@/lib/supabase";
import type { KpiFilterKey } from "@/lib/kpi-filters";

interface Props {
  cases: CaseLog[];
  activeKpi: KpiFilterKey | null;
  onSelect: (key: KpiFilterKey | "total") => void;
}

export function StatsCards({ cases, activeKpi, onSelect }: Props) {
  const counts = cases.reduce(
    (acc, c) => {
      const k = normalizeUrgency(c.urgency_level);
      acc[k] += 1;
      return acc;
    },
    { emergency: 0, urgent: 0, routine: 0, admin: 0 } as Record<string, number>,
  );

  const items: Array<{
    label: string;
    value: number;
    accent?: string;
    dot: string;
    key: KpiFilterKey | "total";
  }> = [
    { label: "Total cases", value: cases.length, dot: "bg-foreground/30", key: "total" },
    {
      label: "Emergency",
      value: counts.emergency,
      accent: counts.emergency > 0 ? "text-emergency" : undefined,
      dot: "bg-emergency",
      key: "emergency",
    },
    { label: "Routine", value: counts.routine, dot: "bg-foreground/20", key: "routine" },
    { label: "Admin", value: counts.admin, dot: "bg-foreground/20", key: "admin" },
  ];

  return (
    <section aria-label="Case mix">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Case mix
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((it) => {
          const active = it.key !== "total" && activeKpi === it.key;
          const stateClasses = active
            ? "border-foreground/40 bg-foreground/[0.04] ring-1 ring-foreground/10"
            : "border-border/70 bg-card hover:border-foreground/20 hover:bg-foreground/[0.02]";
          return (
            <button
              key={it.label}
              type="button"
              onClick={() => onSelect(it.key)}
              aria-pressed={active}
              className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${stateClasses}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${it.dot}`} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {it.label}
                </span>
              </div>
              <div
                className={`mt-0.5 text-lg font-semibold tabular-nums ${it.accent ?? "text-foreground"}`}
              >
                {it.value}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
