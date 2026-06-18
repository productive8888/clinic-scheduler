import { AlertTriangle, Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import type { ManualEditPreview } from "@/lib/schedule/manual-edit-types";

export function ManualEditValidationRail({
  preview,
}: {
  preview: ManualEditPreview | null;
}) {
  if (!preview) {
    return (
      <footer className="border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-500">
        Stage changes, then validate to see weekly BG, work-pattern, coverage, and
        hours impact.
      </footer>
    );
  }

  return (
    <footer className="border-t border-slate-200 bg-white px-5 py-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Metric
          icon={CheckCircle2}
          label="Safe"
          value={preview.safeChangeCount}
          tone="emerald"
        />
        <Metric
          icon={AlertTriangle}
          label="Warnings"
          value={preview.warningCount}
          tone="amber"
        />
        <Metric
          icon={ShieldAlert}
          label="Override"
          value={preview.overrideRequiredCount}
          tone="rose"
        />
        <Metric
          icon={Ban}
          label="Blockers"
          value={preview.blockerCount}
          tone="slate"
        />
        {preview.resolvedHardIssueCount > 0 ? (
          <span className="text-xs font-semibold text-emerald-700">
            Resolved {preview.resolvedHardIssueCount} existing hard issue
            {preview.resolvedHardIssueCount === 1 ? "" : "s"}
          </span>
        ) : null}
        <div className="ml-auto max-w-3xl truncate text-xs text-slate-600">
          {preview.diagnostics[0]?.message ?? "No new diagnostics."}
        </div>
      </div>
    </footer>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  const tones = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    slate: "text-slate-700",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${tones[tone]}`}>
      <Icon size={15} aria-hidden="true" />
      {label} {value}
    </span>
  );
}
