import { auditActorId, getCurrentActor, isManagerRole } from "@/lib/auth";
import { buildIcsCalendar } from "@/lib/calendar/ics";
import { icsResponse } from "@/lib/calendar/http";
import {
  createCalendarExportLog,
  getClinicCalendarEvents,
} from "@/lib/db/calendar-exports";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCurrentActor();

  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isManagerRole(actor.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await getClinicCalendarEvents();

  await createCalendarExportLog({
    requestedByEmployeeId: auditActorId(actor),
    scope: "clinic",
    eventCount: events.length,
  });

  return icsResponse({
    filename: "clinic-published-schedule.ics",
    body: buildIcsCalendar({
      calendarName: "Clinic Published Schedule",
      events,
    }),
  });
}
