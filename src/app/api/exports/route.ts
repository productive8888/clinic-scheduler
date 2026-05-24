import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "available",
    exports: {
      clinicCalendar: "/api/exports/calendar/clinic",
      employeeCalendar: "/api/exports/calendar/me",
    },
    message: "ICS calendar exports are available for published schedules.",
  });
}
