import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      status: "not_configured",
      message:
        "Webhook handling is scaffolded. Add provider signature verification before enabling production webhooks.",
    },
    { status: 202 },
  );
}
