import { getDb } from "@/lib/db";
import { parseIsoDate, todayIsoDate } from "@/lib/utils/date";

export function getEmployeePortalData(employeeId: string) {
  const today = parseIsoDate(todayIsoDate());

  return Promise.all([
    getDb().employee.findUnique({
      where: { id: employeeId },
      include: {
        skills: {
          include: { skill: true },
          orderBy: { skill: { name: "asc" } },
        },
        availability: {
          where: { active: true },
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        },
      },
    }),
    getDb().assignment.findMany({
      where: {
        employeeId,
        status: "ACTIVE",
        taskSlot: {
          scheduleDay: {
            date: { gte: today },
            status: { in: ["GENERATED", "PUBLISHED"] },
          },
        },
      },
      include: {
        taskSlot: {
          include: {
            scheduleDay: true,
            taskType: true,
          },
        },
      },
      orderBy: [
        { taskSlot: { scheduleDay: { date: "asc" } } },
        { taskSlot: { taskType: { sortOrder: "asc" } } },
        { assignedAt: "asc" },
      ],
      take: 30,
    }),
    getDb().pTORequest.findMany({
      where: { employeeId },
      orderBy: [{ createdAt: "desc" }, { startDate: "desc" }],
      include: {
        employee: true,
        reviewedBy: true,
      },
      take: 20,
    }),
    getDb().nPTORequest.findMany({
      where: { employeeId },
      orderBy: [{ createdAt: "desc" }, { startDate: "desc" }],
      include: {
        employee: true,
        reviewedBy: true,
      },
      take: 20,
    }),
    getDb().overtimeRequest.findMany({
      where: { employeeId },
      orderBy: [{ createdAt: "desc" }, { workDate: "desc" }],
      include: {
        employee: true,
        reviewedBy: true,
      },
      take: 30,
    }),
  ]).then(([employee, assignments, ptoRequests, nptoRequests, overtimeRequests]) => ({
    employee,
    assignments,
    ptoRequests,
    nptoRequests,
    overtimeRequests,
  }));
}
