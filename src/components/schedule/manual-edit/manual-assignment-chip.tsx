import { Lock, Unlock } from "lucide-react";

type ManualAssignmentChipProps = {
  timeLabel: string;
  roleName: string;
  background: boolean;
  locked: boolean;
  selected: boolean;
  changed: boolean;
  onClick: () => void;
};

export function ManualAssignmentChip({
  timeLabel,
  roleName,
  background,
  locked,
  selected,
  changed,
  onClick,
}: ManualAssignmentChipProps) {
  const LockIcon = locked ? Lock : Unlock;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full border-l-2 px-2 py-1.5 text-left transition",
        background ? "border-sky-400 bg-sky-50/70" : "border-emerald-500 bg-white",
        selected ? "ring-2 ring-emerald-600 ring-offset-1" : "hover:bg-slate-50",
        changed ? "shadow-[inset_0_0_0_1px_#f59e0b]" : "",
      ].join(" ")}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold text-slate-700">
          {timeLabel}
        </span>
        <LockIcon
          size={12}
          className={locked ? "text-slate-700" : "text-slate-400"}
          aria-label={locked ? "Locked" : "Unlocked"}
        />
      </span>
      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-950">
        {roleName}
      </span>
    </button>
  );
}
