import { getDb } from "@/lib/db";

export function getEmployeeAdminData() {
  return Promise.all([
    getDb().employee.findMany({
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      include: {
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
