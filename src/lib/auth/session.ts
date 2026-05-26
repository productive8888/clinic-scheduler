import type { Employee, EmployeeRole } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { isManagerRole } from "./roles";
import {
  isLocalDevAuthAvailable,
  type SessionSource,
} from "./session-source";

export type AuthActor = Pick<Employee, "id" | "email" | "fullName" | "role"> & {
  isDevFallback?: boolean;
  isLocalDev?: boolean;
  sessionSource: SessionSource;
};

export type DevSwitchEmployee = Pick<
  Employee,
  "id" | "email" | "fullName" | "role"
>;

export const DEV_ACTOR_COOKIE = "clinic_dev_employee_id";

const devFallbackActor: AuthActor = {
  id: "local-dev-admin",
  email: "local.dev@example.com",
  fullName: "Local Dev Admin",
  role: "ADMIN",
  isDevFallback: true,
  sessionSource: "dev-fallback",
};

export function authSecretConfigured() {
  return Boolean(process.env.AUTH_SECRET);
}

export function authEmailConfigured() {
  return Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);
}

export function authUrlConfigured() {
  return Boolean(process.env.AUTH_URL || process.env.NEXTAUTH_URL);
}

export function authConfigured() {
  return authSecretConfigured() && authEmailConfigured();
}

export function localDevAuthEnabled() {
  return isLocalDevAuthAvailable({
    nodeEnv: process.env.NODE_ENV,
    disableLocalDevAuth: process.env.DISABLE_LOCAL_DEV_AUTH,
  });
}

export async function getCurrentActor(): Promise<AuthActor | null> {
  const authSession = await resolveAuthJsActor();

  if (authSession.hasSession) {
    return authSession.actor;
  }

  if (localDevAuthEnabled()) {
    return getLocalDevActor();
  }

  return null;
}

export async function getSessionDiagnostics() {
  const authSession = await resolveAuthJsActor();
  const actor = authSession.hasSession
    ? authSession.actor
    : localDevAuthEnabled()
      ? await getLocalDevActor()
      : null;

  return {
    actor,
    source: actor?.sessionSource ?? "none",
    authJsSessionPresent: authSession.hasSession,
    authJsEmployeeResolved: Boolean(authSession.actor),
    authJsEmail: authSession.email,
    authJsUserId: authSession.authUserId,
    authJsEmployeeId: authSession.employeeId,
    localDevAuthEnabled: localDevAuthEnabled(),
    authConfigured: authConfigured(),
    authSecretConfigured: authSecretConfigured(),
    authEmailConfigured: authEmailConfigured(),
    authUrlConfigured: authUrlConfigured(),
  };
}

async function resolveAuthJsActor(): Promise<{
  hasSession: boolean;
  actor: AuthActor | null;
  email: string | null;
  authUserId: string | null;
  employeeId: string | null;
}> {
  if (!authSecretConfigured()) {
    return {
      hasSession: false,
      actor: null,
      email: null,
      authUserId: null,
      employeeId: null,
    };
  }

  const session = await auth();
  const employeeId = session?.user?.employeeId;
  const email = session?.user?.email;
  const authUserId = session?.user?.id ?? null;

  if (!employeeId && !email) {
    return {
      hasSession: false,
      actor: null,
      email: null,
      authUserId,
      employeeId: null,
    };
  }

  const employee = await getDb().employee.findFirst({
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
      email: true,
      fullName: true,
      role: true,
    },
  });

  return {
    hasSession: true,
    actor: employee ? { ...employee, sessionSource: "authjs" } : null,
    email: email ?? null,
    authUserId,
    employeeId: employeeId ?? null,
  };
}

export async function getLocalDevSwitchEmployees(): Promise<DevSwitchEmployee[]> {
  if (!localDevAuthEnabled()) {
    return [];
  }

  try {
    return await getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });
  } catch {
    return [];
  }
}

export async function requireActor() {
  const actor = await getCurrentActor();

  if (!actor) {
    throw new Error("Unauthorized");
  }

  return actor;
}

export async function requireRole(roles: EmployeeRole[]) {
  const actor = await requireActor();

  if (!roles.includes(actor.role)) {
    throw new Error("Forbidden");
  }

  return actor;
}

export async function requireManager() {
  const actor = await requireActor();

  if (!isManagerRole(actor.role)) {
    throw new Error("Forbidden");
  }

  return actor;
}

export function auditActorId(actor: AuthActor | null | undefined) {
  return actor?.isDevFallback ? null : actor?.id ?? null;
}

async function getLocalDevActor(): Promise<AuthActor> {
  try {
    const selectedEmployeeId = (await cookies()).get(DEV_ACTOR_COOKIE)?.value;

    if (selectedEmployeeId) {
      const selectedEmployee = await getDb().employee.findFirst({
        where: {
          id: selectedEmployeeId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
        },
      });

      if (selectedEmployee) {
        return {
          ...selectedEmployee,
          isLocalDev: true,
          sessionSource: "dev-switcher",
        };
      }
    }

    const fallbackEmployee =
      (await getDb().employee.findFirst({
        where: {
          status: "ACTIVE",
          role: "ADMIN",
        },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
        },
      })) ??
      (await getDb().employee.findFirst({
        where: {
          status: "ACTIVE",
        },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
        },
      }));

    return fallbackEmployee
      ? {
          ...fallbackEmployee,
          isDevFallback: true,
          isLocalDev: true,
          sessionSource: "dev-fallback",
        }
      : devFallbackActor;
  } catch {
    return devFallbackActor;
  }
}
