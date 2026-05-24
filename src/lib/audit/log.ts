import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";

export type AuditLogInput = {
  actorEmployeeId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

export async function writeAuditLog(input: AuditLogInput) {
  return getDb().auditLog.create({
    data: {
      actorEmployeeId: input.actorEmployeeId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: toJson(input.before),
      after: toJson(input.after),
      metadata: toJson(input.metadata),
    },
  });
}

function toJson(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
