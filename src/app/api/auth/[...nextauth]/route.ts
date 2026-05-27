import { handlers } from "@/auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const isEmailCallback = url.pathname.endsWith("/api/auth/callback/nodemailer");

  if (isEmailCallback) {
    console.info("[auth] Email callback received", {
      email: redactEmail(url.searchParams.get("email")),
      hasToken: Boolean(url.searchParams.get("token")),
      hasCallbackUrl: Boolean(url.searchParams.get("callbackUrl")),
      tokenLength: url.searchParams.get("token")?.length ?? 0,
    });
  }

  const response = await handlers.GET(request);
  const location = response.headers.get("location");

  if (isEmailCallback && location?.includes("error=Configuration")) {
    console.error("[auth] Email callback returned Configuration", {
      email: redactEmail(url.searchParams.get("email")),
      hasToken: Boolean(url.searchParams.get("token")),
      hasCallbackUrl: Boolean(url.searchParams.get("callbackUrl")),
      tokenLength: url.searchParams.get("token")?.length ?? 0,
      redirectLocation: scrubLocation(location),
    });
  }

  return response;
}

export const POST = handlers.POST;

function redactEmail(email: string | null) {
  if (!email) {
    return "missing";
  }

  const decodedEmail = decodeURIComponent(email);
  const [name, domain] = decodedEmail.split("@");

  if (!domain) {
    return "invalid";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

function scrubLocation(location: string) {
  const url = new URL(location, "https://clinic.local");

  url.searchParams.delete("token");
  url.searchParams.delete("email");

  return `${url.pathname}${url.search}`;
}
