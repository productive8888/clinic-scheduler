import { auth } from "@clerk/nextjs/server";
import type { Employee, EmployeeRole } from "@prisma/client";
import { getDb } from "@/lib/db";
import { isManagerRole } from "./roles";

export type AuthActor = Pick<Employee, "id" | "email" | "fullName" | "role"> & {
  isDevFallback?: boolean;
};

const devFallbackActor: AuthActor = {
  id: "local-dev-admin",
  email: "local.dev@example.com",
  fullName: "Local Dev Admin",
  role: "ADMIN",
  isDevFallback: true,
};

function clerkConfigured() {
  return Boolean(
    process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}

export async function getCurrentActor(): Promise<AuthActor | null> {
  if (!clerkConfigured()) {
    return devFallbackActor;
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
