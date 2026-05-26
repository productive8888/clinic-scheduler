import { NextResponse, type NextRequest } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { authSecretConfigured, localDevAuthEnabled } from "@/lib/auth";
import { isManagerRole } from "@/lib/auth/roles";

const protectedPrefixes = ["/admin", "/employee", "/schedule"];
const managerPrefixes = ["/admin", "/schedule"];
const authPagePrefixes = ["/login", "/sign-in", "/sign-up"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isProtected = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );
  const isAuthPage = authPagePrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected && !isAuthPage) {
    return NextResponse.next();
  }

  const session = authSecretConfigured() ? await auth() : null;
  const actor = await employeeFromSession(session);
  const hasAuthJsSession = Boolean(
    session?.user?.employeeId || session?.user?.email,
  );

  if (isAuthPage && actor) {
    return NextResponse.redirect(
      new URL(isManagerRole(actor.role) ? "/schedule" : "/employee", request.url),
    );
  }

  if (!isProtected) {
    return NextResponse.next();
  }

  if (!actor && !hasAuthJsSession && localDevAuthEnabled()) {
    return NextResponse.next();
  }

  if (!actor) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "callbackUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );

    return NextResponse.redirect(loginUrl);
  }

  const requiresManager = managerPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (requiresManager && !isManagerRole(actor.role)) {
    return NextResponse.redirect(new URL("/employee?unauthorized=admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|map|txt|xml|webmanifest)$).*)",
  ],
};

async function employeeFromSession(session: Session | null) {
  const employeeId = session?.user?.employeeId;
  const email = session?.user?.email;

  if (!employeeId && !email) {
    return null;
  }

  return getDb().employee.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        ...(employeeId ? [{ id: employeeId }] : []),
        ...(email
          ? [
              {
                email: {
                  equals: email,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      role: true,
    },
  });
}
