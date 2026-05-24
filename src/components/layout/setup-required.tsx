import { DatabaseZap } from "lucide-react";

export function SetupRequired({
  title,
  message,
  detail,
}: {
  title: string;
  message: string;
  detail?: string;
}) {
  return (
    <section className="rounded-md border border-amber-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-800">
          <DatabaseZap size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium uppercase tracking-normal text-amber-800">
            Setup required
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{message}</p>
          {detail ? (
            <pre className="mt-4 max-w-3xl overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {detail}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
}
