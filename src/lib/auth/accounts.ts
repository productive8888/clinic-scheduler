import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";

type AuthAccountEmployee = {
  id: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE";
};

export type AuthAccountProvisionResult =
  | {
      status: "provisioned";
      employeeId: string;
      email: string;
      userId: string;
    }
  | {
      status: "skipped";
      reason: "missing_employee" | "inactive_employee";
      employeeId?: string;
      email?: string;
    };

export async function ensureAuthUserForEmployee(employeeId: string) {
  return getDb().$transaction((tx) =>
    ensureAuthUserForEmployeeInTransaction(tx, employeeId),
  );
}

export async function ensureAuthUserForEmployeeByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return {
      status: "skipped",
      reason: "missing_employee",
      email,
    } satisfies AuthAccountProvisionResult;
  }

  return getDb().$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      return {
        status: "skipped",
        reason: "missing_employee",
        email: normalizedEmail,
      } satisfies AuthAccountProvisionResult;
    }

    return ensureAuthUserForEmployeeInTransaction(tx, employee.id, {
      clearVerificationTokens: true,
    });
  });
}

export async function ensureAuthUsersForActiveEmployees() {
  const db = getDb();
  const employees = await db.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    orderBy: { fullName: "asc" },
  });
  const results: AuthAccountProvisionResult[] = [];

  for (const employee of employees) {
    results.push(await ensureAuthUserForEmployee(employee.id));
  }

  return results;
}

export async function ensureAuthUserForEmployeeInTransaction(
  tx: Prisma.TransactionClient,
  employeeId: string,
  options: { clearVerificationTokens?: boolean } = {},
): Promise<AuthAccountProvisionResult> {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
    },
  });

  return employee
    ? ensureAuthUserForEmployeeRecordInTransaction(tx, employee, options)
    : {
        status: "skipped",
        reason: "missing_employee",
        employeeId,
      };
}

async function ensureAuthUserForEmployeeRecordInTransaction(
  tx: Prisma.TransactionClient,
  employee: AuthAccountEmployee,
  options: { clearVerificationTokens?: boolean },
): Promise<AuthAccountProvisionResult> {
  const email = normalizeEmail(employee.email);

  if (employee.status !== "ACTIVE" || !email) {
    return {
      status: "skipped",
      reason: "inactive_employee",
      employeeId: employee.id,
      email: employee.email,
    };
  }

  const existingUser = await tx.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  const user = existingUser
    ? await tx.user.update({
        where: { id: existingUser.id },
        data: {
          name: employee.fullName,
          email,
        },
        select: { id: true },
      })
    : await tx.user.create({
        data: {
          email,
          name: employee.fullName,
          emailVerified: new Date(),
        },
        select: { id: true },
      });

  await tx.employee.updateMany({
    where: {
      authProviderId: user.id,
      id: { not: employee.id },
    },
    data: {
      authProviderId: null,
    },
  });

  await tx.employee.update({
    where: { id: employee.id },
    data: {
      email,
      authProviderId: user.id,
    },
  });

  if (options.clearVerificationTokens) {
    await tx.verificationToken.deleteMany({
      where: {
        identifier: email,
      },
    });
  }

  return {
    status: "provisioned",
    employeeId: employee.id,
    email,
    userId: user.id,
  };
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
}
