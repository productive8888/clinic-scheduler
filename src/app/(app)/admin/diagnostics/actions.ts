"use server";

import { redirect } from "next/navigation";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  ensureAuthUserForEmployeeByEmail,
  ensureAuthUsersForActiveEmployees,
} from "@/lib/auth/accounts";
import { writeAuditLog } from "@/lib/audit";

export async function repairAuthAccountAction(formData: FormData) {
  const actor = await requireManager();
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  if (!email) {
    redirect("/admin/diagnostics");
  }

  const result = await ensureAuthUserForEmployeeByEmail(email);

  await writeAuditLog({
    actorEmployeeId: auditActorId(actor),
    action: "auth.employee_account_repair",
    entityType: "Employee",
    entityId: result.employeeId ?? email,
    after: result,
  });

  redirect(`/admin/diagnostics?email=${encodeURIComponent(email)}`);
}

export async function repairAllAuthAccountsAction() {
  const actor = await requireManager();
  const results = await ensureAuthUsersForActiveEmployees();

  await writeAuditLog({
    actorEmployeeId: auditActorId(actor),
    action: "auth.employee_account_repair_all",
    entityType: "Employee",
    entityId: "active-employees",
    after: {
      total: results.length,
      provisioned: results.filter((result) => result.status === "provisioned")
        .length,
      skipped: results.filter((result) => result.status === "skipped").length,
    },
  });

  redirect("/admin/diagnostics");
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
