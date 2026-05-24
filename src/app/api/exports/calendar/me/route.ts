import { auditActorId, getCurrentActor } from "@/lib/auth";
import { icsResponse } from "@/lib/calendar/http";
import { buildIcsCalendar } from "@/lib/calendar/ics";
import {
  createCalendarExportLog,
  getEmployeeCalendarEvents,
} from "@/lib/db/calendar-exports";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getCurrentActor();

  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await getEmployeeCalendarEvents(actor.id);

  await createCalendarExportLog({
    requestedByEmployeeId: auditActorId(actor),
    scope: "employee",
    eventCount: events.length,
  });

  return icsResponse({
    filename: "my-published-assignments.ics",
    body: buildIcsCalendar({
      calendarName: `${actor.fullName} Published Assignments`,
      events,
    }),
  });
}
