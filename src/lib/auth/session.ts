import { auth } from "@clerk/nextjs/server";
import type { Employee, EmployeeRole } from "@prisma/client";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { isManagerRole } from "./roles";

export type AuthActor = Pick<Employee, "id" | "email" | "fullName" | "role"> & {
  isDevFallback?: boolean;
  isLocalDev?: boolean;
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
};

export function clerkConfigured() {
  return Boolean(
    process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}

export function localDevAuthEnabled() {
  return process.env.NODE_ENV === "development" && !clerkConfigured();
}

export async function getCurrentActor(): Promise<AuthActor | null> {
  if (localDevAuthEnabled()) {
    return getLocalDevActor();
  }

  if (!clerkConfigured()) {
    return null;
  }

  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return null;
  }

  const employee = await getDb().employee.findUnique({
    where: { authProviderId: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
    },
  });

  return employee;
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
        return { ...selectedEmployee, isLocalDev: true };
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
      ? { ...fallbackEmployee, isLocalDev: true }
      : devFallbackActor;
  } catch {
    return devFallbackActor;
  }
}
