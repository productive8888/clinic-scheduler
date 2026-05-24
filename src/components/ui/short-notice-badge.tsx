import { AlertTriangle } from "lucide-react";

export function ShortNoticeBadge({ label = "Short notice" }: { label?: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
      <AlertTriangle size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
