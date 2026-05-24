import { getDb } from "@/lib/db";

export type AuditLogFilters = {
  action?: string;
  entityType?: string;
};

export async function getAuditLogPageData(filters: AuditLogFilters) {
  const where = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
  };

  const [logs, filterSource] = await Promise.all([
    getDb().auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    }),
    getDb().auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        action: true,
        entityType: true,
      },
    }),
  ]);

  return {
    logs,
    actions: uniqueSorted(filterSource.map((log) => log.action)),
    entityTypes: uniqueSorted(filterSource.map((log) => log.entityType)),
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
