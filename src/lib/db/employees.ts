import { getDb } from "@/lib/db";

export function getEmployeeAdminData() {
  return Promise.all([
    getDb().employee.findMany({
      where: { status: { not: "DELETED" } },
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      include: {
        workPattern: true,
        skills: {
          include: {
            skill: true,
          },
        },
        availability: {
          where: { active: true },
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        },
      },
    }),
    getDb().skill.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    getDb().workPattern.findMany({
      where: { active: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
  ]);
}

export function getAssignableEmployees() {
  return getDb().employee.findMany({
    where: { status: "ACTIVE" },
    orderBy: { fullName: "asc" },
    include: {
      skills: { include: { skill: true } },
    },
  });
}
