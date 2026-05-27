import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import {
  consumeClinicMagicLink,
  safeCallbackUrl,
  sessionCookieName,
} from "@/lib/auth/magic-link";
import { isManagerRole } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");
  const callbackUrl = safeCallbackUrl(url.searchParams.get("callbackUrl"));

  console.info("[auth] Clinic magic callback received", {
    email: redactEmail(email),
    hasToken: Boolean(token),
    tokenLength: token?.length ?? 0,
  });

  const result = await consumeClinicMagicLink({ email, token });

  if (!result.ok) {
    console.warn("[auth] Clinic magic callback denied", {
      email: redactEmail(email),
      reason: result.reason,
      hasToken: Boolean(token),
      tokenLength: token?.length ?? 0,
    });

    return redirect("/login?error=Verification");
  }

  const destination =
    callbackUrl === "/"
      ? isManagerRole(result.employee.role)
        ? "/schedule"
        : "/employee"
      : callbackUrl;
  const response = NextResponse.redirect(new URL(destination, request.url));

  response.cookies.set(sessionCookieName(request.url), result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    expires: result.expires,
  });

  return response;
}

function redactEmail(email: string | null) {
  if (!email) {
    return "missing";
  }

  const [name, domain] = email.split("@");

  if (!domain) {
    return "invalid";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}
