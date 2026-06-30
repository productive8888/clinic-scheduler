"use client";

import { Download } from "lucide-react";
import { useState } from "react";

export function ScheduleIcsExport({
  startDate,
  endDate,
  rangeLabel,
}: {
  startDate: string;
  endDate: string;
  rangeLabel: "week" | "month";
}) {
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function download(status: "published" | "draft-and-published") {
    setPendingStatus(status);
    setMessage(null);

    try {
      const query = new URLSearchParams({
        startDate,
        endDate,
        range: rangeLabel,
        status,
      });
      const response = await fetch(
        `/api/exports/calendar/clinic?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(
          (await response.text()) || "Calendar export could not be created.",
        );
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        fallbackFilename(rangeLabel, startDate);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage("Calendar export downloaded.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Calendar export could not be created.",
      );
    } finally {
      setPendingStatus(null);
    }
  }

  const rangeTitle = rangeLabel === "week" ? "week" : "month";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => download("published")}
        disabled={pendingStatus !== null}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-wait disabled:bg-emerald-50"
      >
        <Download size={16} aria-hidden="true" />
        {pendingStatus === "published"
          ? "Exporting…"
          : `Export this ${rangeTitle} .ics`}
      </button>
      <button
        type="button"
        onClick={() => download("draft-and-published")}
        disabled={pendingStatus !== null}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:bg-slate-100"
      >
        <Download size={16} aria-hidden="true" />
        {pendingStatus === "draft-and-published"
          ? "Exporting drafts…"
          : "Include drafts + published"}
      </button>
      {message ? (
        <span aria-live="polite" className="text-sm text-slate-600">
          {message}
        </span>
      ) : null}
    </div>
  );
}

function fallbackFilename(rangeLabel: "week" | "month", startDate: string) {
  return rangeLabel === "week"
    ? `clinic-schedule-week-${startDate}.ics`
    : `clinic-schedule-month-${startDate.slice(0, 7)}.ics`;
}
