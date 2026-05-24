import type { EmployeeRole } from "@prisma/client";

export const managerRoles: EmployeeRole[] = ["MANAGER", "ADMIN"];

export function isManagerRole(role: EmployeeRole) {
  return managerRoles.includes(role);
}

export function canManageEmployees(role: EmployeeRole) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canOverrideSchedules(role: EmployeeRole) {
  return role === "ADMIN" || role === "MANAGER";
}
