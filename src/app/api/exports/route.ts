import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "not_implemented",
    message:
      "Google Calendar, Google Sheets, and printable exports are reserved for the export phase.",
  });
}
