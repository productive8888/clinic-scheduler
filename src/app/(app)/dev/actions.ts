"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { DEV_ACTOR_COOKIE, localDevAuthEnabled } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function switchLocalDevUserAction(formData: FormData) {
  if (!localDevAuthEnabled()) {
    throw new Error("Local development user switching is disabled.");
  }

  const employeeId = String(formData.get("employeeId") || "");

  if (!employeeId) {
    throw new Error("Employee is required.");
  }

  const employee = await getDb().employee.findFirst({
    where: {
      id: employeeId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!employee) {
    throw new Error("Selected employee is not available.");
  }

  (await cookies()).set(DEV_ACTOR_COOKIE, employee.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/");
}
