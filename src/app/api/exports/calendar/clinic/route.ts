import { auditActorId, getCurrentActor, isManagerRole } from "@/lib/auth";
import { buildIcsCalendar } from "@/lib/calendar/ics";
import { icsResponse } from "@/lib/calendar/http";
import {
  createCalendarExportLog,
  getClinicCalendarEvents,
} from "@/lib/db/calendar-exports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCurrentActor();

  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isManagerRole(actor.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const status = url.searchParams.get("status") ?? "published";
  const rangeLabel = url.searchParams.get("range") ?? "schedule";

  if (
    (startDate && !isIsoDate(startDate)) ||
    (endDate && !isIsoDate(endDate)) ||
    (startDate && endDate && endDate < startDate)
  ) {
    return Response.json({ error: "Invalid calendar export date range." }, { status: 400 });
  }

  if (status !== "published" && status !== "draft-and-published") {
    return Response.json({ error: "Invalid calendar export status." }, { status: 400 });
  }

  const includeDraft = status === "draft-and-published";
  const events = await getClinicCalendarEvents({
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    includeDraft,
  });

  if (events.length === 0) {
    return new Response(
      includeDraft
        ? "No draft or published assignments were found in the selected range."
        : "No published assignments were found in the selected range.",
      {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  await createCalendarExportLog({
    requestedByEmployeeId: auditActorId(actor),
    scope: "clinic",
    eventCount: events.length,
    startDate,
    endDate,
    includeDraft,
  });

  return icsResponse({
    filename: calendarFilename({
      rangeLabel,
      startDate,
    }),
    body: buildIcsCalendar({
      calendarName: includeDraft
        ? "Clinic Draft and Published Schedule"
        : "Clinic Published Schedule",
      events,
    }),
  });
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function calendarFilename(input: {
  rangeLabel: string;
  startDate: string | null;
}) {
  const rangeLabel = input.rangeLabel.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  if (rangeLabel === "week" && input.startDate) {
    return `clinic-schedule-week-${input.startDate}.ics`;
  }

  if (rangeLabel === "month" && input.startDate) {
    return `clinic-schedule-month-${input.startDate.slice(0, 7)}.ics`;
  }

  const datePart = input.startDate ?? "all-dates";

  return `clinic-schedule-${rangeLabel}-${datePart}.ics`;
}
