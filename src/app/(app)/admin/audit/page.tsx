import { Activity } from "lucide-react";
import Link from "next/link";
import { SetupRequired } from "@/components/layout/setup-required";
import { ShortNoticeBadge } from "@/components/ui/short-notice-badge";
import { getAuditLogPageData } from "@/lib/db/audit-log";

export const dynamic = "force-dynamic";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string | string[]; entityType?: string | string[] }>;
}) {
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : "";
  const entityType =
    typeof params.entityType === "string" ? params.entityType : "";
  let data: Awaited<ReturnType<typeof getAuditLogPageData>>;

  try {
    data = await getAuditLogPageData({
      action: action || undefined,
      entityType: entityType || undefined,
    });
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before viewing audit logs"
        message="Set DATABASE_URL, run the Prisma migration, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Audit log
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Recent system activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Review schedule, time off, overtime, OPTO, employee, and configuration
          changes captured by server-side actions.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
          <Activity size={16} aria-hidden="true" />
          {data.logs.length} shown
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]" action="/admin/audit">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Action
            <select
              name="action"
              defaultValue={action}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            >
              <option value="">All actions</option>
              {data.actions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Entity type
            <select
              name="entityType"
              defaultValue={entityType}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            >
              <option value="">All entity types</option>
              {data.entityTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button className="h-10 self-end rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
            Filter
          </button>
          <Link
            href="/admin/audit"
            className="inline-flex h-10 items-center justify-center self-end rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Clear
          </Link>
        </form>
      </section>

      <section className="grid gap-3">
        {data.logs.length ? (
          data.logs.map((log) => (
            <article
              key={log.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-950">
                      {log.action}
                    </span>
                    {hasShortNoticeFlag(log.after) ||
                    hasShortNoticeFlag(log.metadata) ? (
                      <ShortNoticeBadge />
                    ) : null}
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {log.entityType}
                    </span>
                    {log.entityId ? (
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
                        {log.entityId}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {log.actor?.fullName ?? "System"} /{" "}
                    {log.actor?.email ?? "no actor"}
                  </p>
                </div>
                <time className="text-sm text-slate-500">
                  {log.createdAt.toLocaleString()}
                </time>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <SummaryBlock label="Before" value={log.before} />
                <SummaryBlock label="After" value={log.after} />
              </div>
              {log.metadata ? (
                <div className="mt-3">
                  <SummaryBlock label="Metadata" value={log.metadata} />
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No audit events match the selected filters.
          </div>
        )}
      </section>
    </div>
  );
}

function hasShortNoticeFlag(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasShortNoticeFlag);
  }

  return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
    if (key === "shortNotice" && item === true) {
      return true;
    }

    return hasShortNoticeFlag(item);
  });
}

function SummaryBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-normal text-slate-500">
        {label}
      </h2>
      <p className="mt-2 break-words font-mono text-xs text-slate-700">
        {summarizeJson(value)}
      </p>
    </div>
  );
}

function summarizeJson(value: unknown) {
  if (value === null || value === undefined) {
    return "None";
  }

  const summary = JSON.stringify(value);

  return summary.length > 260 ? `${summary.slice(0, 260)}...` : summary;
}
