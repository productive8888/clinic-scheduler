import {
  AssignmentSource,
  AssignmentStatus,
  Prisma,
  TaskSlotStatus,
  type EmployeeScheduleTarget,
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { findEastonTargetForEmployee } from "@/lib/easton-import/employee-targets";
import { buildJulyWeekSkeletons } from "@/lib/schedule/july-week-planner";
import {
  getEffectiveRequiredBackgroundAssignments,
  getEffectiveWeeklyTargetHours,
  getEffectiveWorkPattern,
} from "@/lib/schedule/easton-work-pattern-resolution";
import { withEastonDerivedAvailability } from "@/lib/schedule/easton-derived-availability";
import { ACTIVE_EASTON_TARGET_PATTERN_CODE } from "@/lib/schedule/easton-model";
import {
  evaluateWeeklyHardRequirements,
  type WeeklyHardRequirementAssignment,
  type WeeklyHardRequirementTarget,
} from "@/lib/schedule/hard-requirements";
import {
  applyManualEditBatchToState,
  type ManualEditBaseState,
  type ManualEditDraftAssignment,
  type ManualEditDraftSlot,
} from "@/lib/schedule/manual-edit-state";
import type {
  ManualEditBatch,
  ManualEditCandidate,
  ManualEditDiagnostic,
  ManualEditPreview,
  ManualEditSeverity,
} from "@/lib/schedule/manual-edit-types";
import { validateManualAssignment } from "@/lib/schedule/manual-validation";
import { clinicWeekRange } from "@/lib/schedule/range";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "@/lib/scheduler/types";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

type ManualScheduleDay = Prisma.ScheduleDayGetPayload<{
  include: {
    shiftBlocks: true;
    taskSlots: {
      include: {
        taskType: { include: { skillRequirements: true } };
        shiftBlock: true;
        backgroundTaskInstance: {
          include: {
            definition: {
              include: {
                requiredSkills: true;
                eligibleEmployees: true;
              };
            };
          };
        };
        assignments: {
          include: {
            employee: { select: { id: true; fullName: true } };
          };
        };
      };
    };
  };
}>;

type ManualEmployee = Prisma.EmployeeGetPayload<{
  include: {
    skills: true;
    workPattern: true;
    availability: true;
    ptoRequests: true;
    nptoRequests: true;
  };
}>;

type ManualTaskType = Prisma.TaskTypeGetPayload<{
  include: { skillRequirements: true };
}>;

type ManualShiftBlock = ManualScheduleDay["shiftBlocks"][number] & {
  date: string;
};

type ManualEditContext = {
  range: ReturnType<typeof clinicWeekRange>;
  scheduleDays: ManualScheduleDay[];
  employees: ManualEmployee[];
  taskTypes: ManualTaskType[];
  scheduleTargets: EmployeeScheduleTarget[];
  baseState: ManualEditBaseState;
  employeeById: Map<string, ManualEmployee>;
  taskTypeById: Map<string, ManualTaskType>;
  shiftBlockById: Map<string, ManualShiftBlock>;
  schedulerEmployeeById: Map<string, SchedulerEmployee>;
  schedulerTaskTypeById: Map<string, SchedulerTaskType>;
  targetHoursByEmployeeId: Map<string, number>;
  hardTargets: WeeklyHardRequirementTarget[];
};

export async function getManualEditWorkspaceData(anchorDate: string) {
  const context = await loadManualEditContext(anchorDate);
  const baseline = previewManualEditBatchWithContext(context, emptyBatch(context));

  return {
    range: context.range,
    revisions: context.scheduleDays.map((day) => ({
      scheduleDayId: day.id,
      updatedAt: day.updatedAt.toISOString(),
    })),
    employees: context.employees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      scheduleEligible: employee.scheduleEligible,
      targetHours: context.targetHoursByEmployeeId.get(employee.id) ?? 0,
      baselineHours:
        baseline.affectedEmployeeHours.find(
          (item) => item.employeeId === employee.id,
        )?.beforeHours ?? 0,
    })),
    days: context.scheduleDays.map((day) => ({
      id: day.id,
      date: toIsoDate(day.date),
      status: day.status,
      updatedAt: day.updatedAt.toISOString(),
      shiftBlocks: day.shiftBlocks.map((block) => ({
        id: block.id,
        name: block.name,
        startMinute: block.startMinute,
        endMinute: block.endMinute,
        paidHours: Number(block.paidHours),
        shiftCategory: block.shiftCategory,
      })),
    })),
    taskTypes: context.taskTypes.map((taskType) => ({
      id: taskType.id,
      code: taskType.code,
      name: taskType.name,
      isBackground: taskType.isBackground,
      optional: taskType.optional,
    })),
    slots: context.baseState.slots.map((slot) => {
      const taskType = context.taskTypeById.get(slot.taskTypeId)!;
      const shiftBlock = context.shiftBlockById.get(slot.shiftBlockId)!;

      return {
        ...slot,
        taskTypeCode: taskType.code,
        taskTypeName: taskType.name,
        isBackground: Boolean(taskType.isBackground),
        shiftName: shiftBlock.name,
        startMinute: shiftBlock.startMinute,
        endMinute: shiftBlock.endMinute,
        paidHours: Number(shiftBlock.paidHours),
      };
    }),
    assignments: context.baseState.assignments.map((assignment) => ({
      ...assignment,
      employeeName:
        context.employeeById.get(assignment.employeeId)?.fullName ?? "Unknown",
    })),
    baselineDiagnostics: baseline.diagnostics,
  };
}

export async function previewManualEditBatch(batch: ManualEditBatch) {
  const context = await loadManualEditContext(batch.weekStart);
  return previewManualEditBatchWithContext(context, batch);
}

export async function getManualEditCandidates(input: {
  batch: ManualEditBatch;
  assignmentId?: string | null;
  slotId?: string | null;
}) {
  const context = await loadManualEditContext(input.batch.weekStart);
  const candidates: ManualEditCandidate[] = [];

  for (const employee of context.employees) {
    const batch = candidateBatch(input, employee.id);
    const preview = previewManualEditBatchWithContext(context, batch);
    const hours = preview.affectedEmployeeHours.find(
      (item) => item.employeeId === employee.id,
    );
    const diagnostics = preview.diagnostics.filter(
      (diagnostic) =>
        diagnostic.employeeId === employee.id ||
        diagnostic.assignmentId === input.assignmentId ||
        diagnostic.slotId === input.slotId,
    );

    candidates.push({
      employeeId: employee.id,
      employeeName: employee.fullName,
      projectedHours: hours?.afterHours ?? hoursForEmployee(
        context.baseState.assignments,
        context.baseState.slots,
        context.shiftBlockById,
        employee.id,
      ),
      targetHours: context.targetHoursByEmployeeId.get(employee.id) ?? 0,
      severity: severityFromDiagnostics(diagnostics),
      warningCodes: [...new Set(diagnostics.map((item) => item.code))],
      warningMessages: diagnostics.map((item) => item.message),
    });
  }

  return candidates.sort(
    (left, right) =>
      severityRank(left.severity) - severityRank(right.severity) ||
      Math.abs(left.projectedHours - left.targetHours) -
        Math.abs(right.projectedHours - right.targetHours) ||
      left.employeeName.localeCompare(right.employeeName),
  );
}

export async function saveManualEditBatch(input: {
  batch: ManualEditBatch;
  actorEmployeeId?: string | null;
}) {
  const context = await loadManualEditContext(input.batch.weekStart);
  const preview = previewManualEditBatchWithContext(context, input.batch);

  if (preview.blockerCount > 0) {
    throw new Error(
      preview.diagnostics
        .filter((item) => item.severity === "BLOCKER")
        .map((item) => item.message)
        .slice(0, 4)
        .join(" "),
    );
  }

  if (preview.overrideRequiredCount > 0 && !input.batch.overrideReason?.trim()) {
    throw new Error("A manager reason is required for override-required edits.");
  }

  const db = getDb();

  return db.$transaction(async (tx) => {
    await assertManualEditRevisions(tx, input.batch);

    const touchedSlotIds = new Set<string>();
    const touchedDayIds = new Set<string>();
    const operationAudit: Array<{
      action: string;
      entityId: string;
      before: unknown;
      after: unknown;
    }> = [];

    for (const change of input.batch.assignmentChanges) {
      const current = await tx.assignment.findUniqueOrThrow({
        where: { id: change.assignmentId },
        include: {
          taskSlot: { select: { scheduleDayId: true } },
        },
      });

      if (current.status !== "ACTIVE") {
        throw new Error("An assignment changed while the workspace was open.");
      }

      touchedSlotIds.add(current.taskSlotId);
      touchedDayIds.add(current.taskSlot.scheduleDayId);

      if (!change.employeeId) {
        await tx.assignment.update({
          where: { id: current.id },
          data: {
            status: AssignmentStatus.REMOVED,
            removedAt: new Date(),
            notes: change.note?.trim() || current.notes,
          },
        });
        operationAudit.push({
          action: "assignment.manual_remove",
          entityId: current.id,
          before: current,
          after: null,
        });
        continue;
      }

      if (change.employeeId === current.employeeId) {
        const updated = await tx.assignment.update({
          where: { id: current.id },
          data: {
            source: AssignmentSource.MANUAL_OVERRIDE,
            locked: change.locked,
            assignedByEmployeeId: input.actorEmployeeId ?? null,
            notes: change.note?.trim() || current.notes,
          },
        });
        operationAudit.push({
          action: "assignment.manual_update",
          entityId: current.id,
          before: current,
          after: updated,
        });
        continue;
      }

      await tx.assignment.update({
        where: { id: current.id },
        data: { status: AssignmentStatus.REMOVED, removedAt: new Date() },
      });
      const replacement = await tx.assignment.create({
        data: {
          taskSlotId: current.taskSlotId,
          employeeId: change.employeeId,
          source: AssignmentSource.MANUAL_OVERRIDE,
          status: AssignmentStatus.ACTIVE,
          locked: change.locked,
          assignedByEmployeeId: input.actorEmployeeId ?? null,
          notes: change.note?.trim() || undefined,
        },
      });
      operationAudit.push({
        action: "assignment.manual_change_employee",
        entityId: replacement.id,
        before: current,
        after: replacement,
      });
    }

    for (const addition of input.batch.addedAssignments) {
      const slot = await tx.taskSlot.findUniqueOrThrow({
        where: { id: addition.slotId },
        select: { id: true, scheduleDayId: true },
      });
      const assignment = await tx.assignment.create({
        data: {
          taskSlotId: slot.id,
          employeeId: addition.employeeId,
          source: AssignmentSource.MANUAL_OVERRIDE,
          status: AssignmentStatus.ACTIVE,
          locked: addition.locked,
          assignedByEmployeeId: input.actorEmployeeId ?? null,
          notes: addition.note?.trim() || undefined,
        },
      });

      touchedSlotIds.add(slot.id);
      touchedDayIds.add(slot.scheduleDayId);
      operationAudit.push({
        action: "assignment.manual_add",
        entityId: assignment.id,
        before: null,
        after: assignment,
      });
    }

    for (const addition of input.batch.addedSlots) {
      const shiftBlock = await tx.shiftBlock.findUniqueOrThrow({
        where: { id: addition.shiftBlockId },
        include: { scheduleDay: true },
      });

      if (toIsoDate(shiftBlock.scheduleDay.date) !== addition.date) {
        throw new Error("Manual slot date does not match its shift.");
      }

      const existing = await tx.taskSlot.aggregate({
        where: {
          scheduleDayId: shiftBlock.scheduleDayId,
          shiftBlockId: shiftBlock.id,
          taskTypeId: addition.taskTypeId,
        },
        _max: { slotIndex: true },
      });
      const slot = await tx.taskSlot.create({
        data: {
          scheduleDayId: shiftBlock.scheduleDayId,
          shiftBlockId: shiftBlock.id,
          taskTypeId: addition.taskTypeId,
          slotIndex: (existing._max.slotIndex ?? 0) + 1,
          startMinute: shiftBlock.startMinute,
          endMinute: shiftBlock.endMinute,
          minStaff: 1,
          requiredStaff: 1,
          requirementLevel: "OPTIONAL",
          source: "MANUAL",
          status: addition.employeeId ? TaskSlotStatus.FILLED : TaskSlotStatus.OPEN,
          notes: addition.note?.trim() || undefined,
        },
      });
      let assignment = null;

      if (addition.employeeId) {
        assignment = await tx.assignment.create({
          data: {
            taskSlotId: slot.id,
            employeeId: addition.employeeId,
            source: AssignmentSource.MANUAL_OVERRIDE,
            status: AssignmentStatus.ACTIVE,
            locked: addition.locked,
            assignedByEmployeeId: input.actorEmployeeId ?? null,
            notes: addition.note?.trim() || undefined,
          },
        });
      }

      touchedSlotIds.add(slot.id);
      touchedDayIds.add(shiftBlock.scheduleDayId);
      operationAudit.push({
        action: "task_slot.manual_add",
        entityId: slot.id,
        before: null,
        after: { slot, assignment },
      });
    }

    for (const slotId of touchedSlotIds) {
      const slot = await tx.taskSlot.findUniqueOrThrow({
        where: { id: slotId },
        include: {
          assignments: {
            where: { status: AssignmentStatus.ACTIVE },
            select: { id: true },
          },
        },
      });
      const filled = slot.assignments.length >= slot.requiredStaff;

      await tx.taskSlot.update({
        where: { id: slot.id },
        data: {
          status: filled
            ? TaskSlotStatus.FILLED
            : slot.requirementLevel === "REQUIRED"
              ? TaskSlotStatus.SHORTAGE
              : TaskSlotStatus.OPEN,
          notes:
            !filled && slot.requirementLevel === "REQUIRED"
              ? "Required coverage is unfilled after a manual edit."
              : slot.notes,
        },
      });
    }

    const touchedDays = await tx.scheduleDay.findMany({
      where: { id: { in: [...touchedDayIds] } },
      select: { id: true, status: true },
    });
    const changedAt = new Date();

    for (const day of touchedDays) {
      await tx.scheduleDay.update({
        where: { id: day.id },
        data: {
          status: day.status === "PUBLISHED" ? "PUBLISHED" : "GENERATED",
          updatedAt: changedAt,
        },
      });
    }

    for (const audit of operationAudit) {
      await writeAuditLog(
        {
          actorEmployeeId: input.actorEmployeeId,
          action: audit.action,
          entityType: audit.action.startsWith("task_slot")
            ? "TaskSlot"
            : "Assignment",
          entityId: audit.entityId,
          before: audit.before,
          after: audit.after,
          metadata: {
            overrideReason: input.batch.overrideReason?.trim() || null,
            previewDiagnostics: preview.diagnostics,
          },
        },
        tx,
      );
    }

    await writeAuditLog(
      {
        actorEmployeeId: input.actorEmployeeId,
        action: "schedule.manual_edit_batch",
        entityType: "ScheduleRange",
        entityId: `${context.range.startDate}:${context.range.endDate}`,
        after: {
          assignmentChanges: input.batch.assignmentChanges.length,
          addedAssignments: input.batch.addedAssignments.length,
          addedSlots: input.batch.addedSlots.length,
          touchedScheduleDayIds: [...touchedDayIds],
        },
        metadata: {
          overrideReason: input.batch.overrideReason?.trim() || null,
          diagnostics: preview.diagnostics,
        },
      },
      tx,
    );

    return {
      saved: true,
      touchedScheduleDayIds: [...touchedDayIds],
      preview,
    };
  });
}

function previewManualEditBatchWithContext(
  context: ManualEditContext,
  batch: ManualEditBatch,
): ManualEditPreview {
  const diagnostics: ManualEditDiagnostic[] = [];
  const draft = applyManualEditBatchToState(context.baseState, batch);
  validateBatchReferences(context, batch, diagnostics);
  const editedAssignmentIds = new Set([
    ...batch.assignmentChanges.map((change) => change.assignmentId),
    ...batch.addedAssignments.map((addition) => addition.clientId),
    ...batch.addedSlots
      .filter((addition) => addition.employeeId)
      .map((addition) => `${addition.clientId}:assignment`),
  ]);
  const existingAssignments = draft.assignments.map((assignment) =>
    toExistingAssignment(context, draft.slots, assignment),
  );

  for (const assignment of draft.assignments) {
    if (!editedAssignmentIds.has(assignment.id)) {
      continue;
    }

    const employee = context.schedulerEmployeeById.get(assignment.employeeId);
    const slot = draft.slots.find((item) => item.id === assignment.slotId);
    const taskType = slot
      ? context.schedulerTaskTypeById.get(slot.taskTypeId)
      : null;

    if (!employee || !slot || !taskType) {
      diagnostics.push({
        severity: "BLOCKER",
        code: "MISSING_EDIT_REFERENCE",
        message: "A staged assignment references data that no longer exists.",
        assignmentId: assignment.id,
      });
      continue;
    }

    if (!context.employeeById.get(employee.id)?.scheduleEligible) {
      diagnostics.push({
        severity: "OVERRIDE_REQUIRED",
        code: "NOT_SCHEDULE_ELIGIBLE",
        message: `${employee.fullName} is excluded from ordinary schedule generation.`,
        employeeId: employee.id,
        assignmentId: assignment.id,
        slotId: slot.id,
        date: slot.date,
      });
    }

    const warnings = validateManualAssignment({
      employee,
      taskType,
      slot: toSchedulerSlot(context, slot),
      assignments: existingAssignments.filter(
        (existing) => existing.slotId !== assignment.slotId ||
          existing.employeeId !== assignment.employeeId,
      ),
      expectedWeeklyHours:
        context.targetHoursByEmployeeId.get(employee.id) ?? null,
    });

    for (const warning of warnings) {
      diagnostics.push({
        severity: warningSeverity(warning.code),
        code: warning.code,
        message: warning.message,
        employeeId: employee.id,
        assignmentId: assignment.id,
        slotId: slot.id,
        date: slot.date,
      });
    }

    const pending = pendingTimeOffForSlot(context, employee.id, slot);
    if (pending.length > 0) {
      diagnostics.push({
        severity: "WARNING",
        code: "PENDING_TIME_OFF",
        message: `${employee.fullName} has pending ${pending.join(" and ")} overlapping this shift.`,
        employeeId: employee.id,
        assignmentId: assignment.id,
        slotId: slot.id,
        date: slot.date,
      });
    }
  }

  const baselineCoverage = coverageIssueKeys(
    context.baseState.slots,
    context.baseState.assignments,
  );
  for (const issue of coverageIssues(draft.slots, draft.assignments)) {
    if (!baselineCoverage.has(issue.key)) {
      diagnostics.push(issue.diagnostic);
    }
  }

  const baselineHard = evaluateHardRequirements(
    context,
    context.baseState.slots,
    context.baseState.assignments,
  );
  const draftHard = evaluateHardRequirements(
    context,
    draft.slots,
    draft.assignments,
  );
  const baselineHardKeys = new Set(baselineHard.issues.map(hardIssueKey));
  const draftHardKeys = new Set(draftHard.issues.map(hardIssueKey));

  for (const issue of draftHard.issues) {
    if (baselineHardKeys.has(hardIssueKey(issue))) {
      continue;
    }

    diagnostics.push({
      severity: "OVERRIDE_REQUIRED",
      code: issue.code,
      message: issue.message,
      employeeId: issue.employeeId,
    });
  }

  for (const change of batch.assignmentChanges) {
    const original = context.baseState.assignments.find(
      (assignment) => assignment.id === change.assignmentId,
    );
    const slot = original
      ? context.baseState.slots.find((item) => item.id === original.slotId)
      : null;

    if (original?.locked && (
      !change.employeeId ||
      change.employeeId !== original.employeeId ||
      !change.locked
    )) {
      diagnostics.push({
        severity: "OVERRIDE_REQUIRED",
        code: "LOCKED_ASSIGNMENT_CHANGE",
        message: "This changes or unlocks a manager-confirmed assignment.",
        assignmentId: original.id,
        slotId: original.slotId,
        date: slot?.date,
      });
    }
  }

  const touchedDates = touchedDatesForBatch(context, batch);
  for (const day of context.scheduleDays) {
    const date = toIsoDate(day.date);
    if (day.status === "PUBLISHED" && touchedDates.has(date)) {
      diagnostics.push({
        severity: "OVERRIDE_REQUIRED",
        code: "PUBLISHED_SCHEDULE_CHANGE",
        message: `${date} is published. Saving will change the live schedule and retain published status.`,
        date,
      });
    }
  }

  const dedupedDiagnostics = dedupeDiagnostics(diagnostics);
  const affectedEmployeeHours = context.employees.map((employee) => ({
    employeeId: employee.id,
    employeeName: employee.fullName,
    beforeHours: hoursForEmployee(
      context.baseState.assignments,
      context.baseState.slots,
      context.shiftBlockById,
      employee.id,
    ),
    afterHours: hoursForEmployee(
      draft.assignments,
      draft.slots,
      context.shiftBlockById,
      employee.id,
    ),
    targetHours: context.targetHoursByEmployeeId.get(employee.id) ?? 0,
  }));
  const counts = diagnosticCounts(dedupedDiagnostics);
  const totalChanges =
    batch.assignmentChanges.length +
    batch.addedAssignments.length +
    batch.addedSlots.length;

  return {
    severity: severityFromDiagnostics(dedupedDiagnostics),
    diagnostics: dedupedDiagnostics,
    safeChangeCount: Math.max(
      0,
      totalChanges - counts.warningCount - counts.overrideRequiredCount - counts.blockerCount,
    ),
    ...counts,
    affectedEmployeeHours,
    resolvedHardIssueCount: [...baselineHardKeys].filter(
      (key) => !draftHardKeys.has(key),
    ).length,
  };
}

async function loadManualEditContext(
  anchorDate: string,
): Promise<ManualEditContext> {
  const range = clinicWeekRange(anchorDate);
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  const [scheduleDays, employees, taskTypes, scheduleTargets] = await Promise.all([
    getDb().scheduleDay.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
      include: {
        shiftBlocks: {
          where: { active: true, source: { notIn: ["MIGRATION", "FALLBACK"] } },
          orderBy: [{ startMinute: "asc" }, { id: "asc" }],
        },
        taskSlots: {
          where: { status: { not: "CANCELLED" } },
          orderBy: [
            { shiftBlock: { startMinute: "asc" } },
            { taskType: { sortOrder: "asc" } },
            { slotIndex: "asc" },
          ],
          include: {
            taskType: { include: { skillRequirements: true } },
            shiftBlock: true,
            backgroundTaskInstance: {
              include: {
                definition: {
                  include: {
                    requiredSkills: true,
                    eligibleEmployees: true,
                  },
                },
              },
            },
            assignments: {
              where: { status: "ACTIVE" },
              include: { employee: { select: { id: true, fullName: true } } },
              orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
            },
          },
        },
      },
    }),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      include: {
        skills: true,
        workPattern: true,
        availability: { where: { active: true } },
        ptoRequests: {
          where: { startDate: { lte: end }, endDate: { gte: start } },
        },
        nptoRequests: {
          where: { startDate: { lte: end }, endDate: { gte: start } },
        },
      },
    }),
    getDb().taskType.findMany({
      where: { active: true },
      include: { skillRequirements: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getDb().employeeScheduleTarget.findMany({
      where: {
        scheduleEligibility: "ACTIVE_SCHEDULED",
        pattern: { code: ACTIVE_EASTON_TARGET_PATTERN_CODE, active: true },
      },
      orderBy: [{ employeeName: "asc" }, { id: "asc" }],
    }),
  ]);
  const shiftBlocks = scheduleDays.flatMap((day) =>
    day.shiftBlocks.map((block) => ({ ...block, date: toIsoDate(day.date) })),
  );
  const baseState: ManualEditBaseState = {
    shiftBlocks: shiftBlocks.map((block) => ({
      id: block.id,
      scheduleDayId: block.scheduleDayId,
      date: block.date,
    })),
    slots: scheduleDays.flatMap((day) =>
      day.taskSlots.map((slot) => ({
        id: slot.id,
        persistedSlotId: slot.id,
        scheduleDayId: day.id,
        date: toIsoDate(day.date),
        shiftBlockId: slot.shiftBlockId,
        taskTypeId: slot.taskTypeId,
        slotIndex: slot.slotIndex,
        requirementLevel: slot.requirementLevel,
        requiredStaff: slot.requiredStaff,
        source: slot.source,
      })),
    ),
    assignments: scheduleDays.flatMap((day) =>
      day.taskSlots.flatMap((slot) =>
        slot.assignments.map((assignment) => ({
          id: assignment.id,
          persistedAssignmentId: assignment.id,
          slotId: slot.id,
          employeeId: assignment.employeeId,
          locked: assignment.locked,
          source: assignment.source,
          note: assignment.notes,
        })),
      ),
    ),
  };
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const taskTypeById = new Map(taskTypes.map((taskType) => [taskType.id, taskType]));
  const shiftBlockById = new Map(shiftBlocks.map((block) => [block.id, block]));
  const targetHoursByEmployeeId = new Map<string, number>();
  const baseSchedulerEmployees = employees.map((employee) => {
    const scheduleTarget = findEastonTargetForEmployee(employee, scheduleTargets);
    const workPattern = getEffectiveWorkPattern({
      employeeWorkPattern: employee.workPattern,
      scheduleTarget,
      expectedWeeklyHours: employee.expectedWeeklyHours,
    });
    const targetHours = getEffectiveWeeklyTargetHours({
      workPattern,
      scheduleTarget,
      expectedWeeklyHours: employee.expectedWeeklyHours,
    });
    targetHoursByEmployeeId.set(employee.id, targetHours);

    return withEastonDerivedAvailability({
      id: employee.id,
      fullName: employee.fullName,
      active: true,
      weeklyAssignmentLimit: employee.weeklyAssignmentLimit,
      skillIds: employee.skills.map((skill) => skill.skillId),
      availability: employee.availability.map((window) => ({
        weekday: window.weekday,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        effectiveStartDate: toIsoDate(window.effectiveStartDate),
        effectiveEndDate: window.effectiveEndDate
          ? toIsoDate(window.effectiveEndDate)
          : null,
        active: window.active,
      })),
      unavailable: [
        ...employee.ptoRequests.filter((request) =>
          request.status === "APPROVED" || request.status === "OVERRIDDEN",
        ),
        ...employee.nptoRequests.filter((request) =>
          request.status === "APPROVED" || request.status === "OVERRIDDEN",
        ),
      ].map((request) => ({
        startDate: toIsoDate(request.startDate),
        endDate: toIsoDate(request.endDate),
        startMinute: request.startMinute,
        endMinute: request.endMinute,
        active: true,
      })),
      workPattern,
      requiredBackgroundAssignments: getEffectiveRequiredBackgroundAssignments({
        employeeRequiredBackgroundAssignments:
          employee.requiredWeeklyBackgroundShifts,
        scheduleTarget,
      }),
      targetWeeklyHours: targetHours,
    } satisfies SchedulerEmployee);
  });
  const skeletons = buildJulyWeekSkeletons({
    employees: baseSchedulerEmployees,
    shiftBlocks: shiftBlocks.map((block) => ({
      id: block.id,
      date: block.date,
      shiftCategory: block.shiftCategory,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
      paidHours: Number(block.paidHours),
    })),
  });
  const schedulerEmployees = baseSchedulerEmployees.map((employee) => ({
    ...employee,
    julyWeekSkeleton: skeletons.get(employee.id) ?? null,
  }));
  const schedulerEmployeeById = new Map(
    schedulerEmployees.map((employee) => [employee.id, employee]),
  );
  const schedulerTaskTypeById = new Map(
    taskTypes.map((taskType) => [
      taskType.id,
      {
        id: taskType.id,
        code: taskType.code,
        name: taskType.name,
        requiredSkillIds: taskType.skillRequirements.map(
          (requirement) => requirement.skillId,
        ),
        difficultyWeight: taskType.difficultyWeight,
        sortOrder: taskType.sortOrder,
        isPatientFacing: taskType.isPatientFacing,
        isClinical: taskType.isClinical,
        isBackground: taskType.isBackground,
        isSkilled: taskType.isSkilled,
        isEndoscopy: taskType.isEndoscopy,
        isFloat: taskType.isFloat,
      } satisfies SchedulerTaskType,
    ]),
  );

  return {
    range,
    scheduleDays,
    employees,
    taskTypes,
    scheduleTargets,
    baseState,
    employeeById,
    taskTypeById,
    shiftBlockById,
    schedulerEmployeeById,
    schedulerTaskTypeById,
    targetHoursByEmployeeId,
    hardTargets: buildHardTargets(employees, scheduleTargets),
  };
}

function buildHardTargets(
  employees: ManualEmployee[],
  scheduleTargets: EmployeeScheduleTarget[],
): WeeklyHardRequirementTarget[] {
  return employees
    .filter((employee) => employee.scheduleEligible)
    .map((employee) => {
      const importedTarget = findEastonTargetForEmployee(employee, scheduleTargets);
      const workPattern = getEffectiveWorkPattern({
        employeeWorkPattern: employee.workPattern,
        scheduleTarget: importedTarget,
        expectedWeeklyHours: employee.expectedWeeklyHours,
      });

      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        activeTargetSheetName: importedTarget?.activeTargetSheetName ?? null,
        scheduleEligibility:
          importedTarget?.scheduleEligibility ?? "ACTIVE_SCHEDULED",
        scheduleEligibilityReason:
          importedTarget?.scheduleEligibilityReason ?? null,
        workPatternCode:
          workPattern?.code ?? importedTarget?.workPatternCode ?? null,
        workPatternKind: workPattern?.kind ?? null,
        requiredSaturdayShiftCategory:
          workPattern?.requiredSaturdayShiftCategory ?? null,
        saturdayPaidHours: workPattern?.saturdayPaidHours ?? null,
        requiresWorkPattern: Boolean(workPattern || importedTarget),
        requiredBackgroundAssignments: getEffectiveRequiredBackgroundAssignments({
          employeeRequiredBackgroundAssignments:
            employee.requiredWeeklyBackgroundShifts,
          scheduleTarget: importedTarget,
        }),
        extraHourWeekdays: jsonNumberArray(
          workPattern?.extraHourWeekdays ?? importedTarget?.extraHourWeekdays,
        ),
        expectedWeeklyHours: getEffectiveWeeklyTargetHours({
          workPattern,
          scheduleTarget: importedTarget,
          expectedWeeklyHours: employee.expectedWeeklyHours,
        }),
        targetTaskCounts: jsonNumberRecord(importedTarget?.targetTaskCounts),
      };
    });
}

function evaluateHardRequirements(
  context: ManualEditContext,
  slots: ManualEditDraftSlot[],
  assignments: ManualEditDraftAssignment[],
) {
  const hardAssignments: WeeklyHardRequirementAssignment[] = assignments.flatMap(
    (assignment) => {
      const slot = slots.find((item) => item.id === assignment.slotId);
      const block = slot ? context.shiftBlockById.get(slot.shiftBlockId) : null;
      const taskType = slot ? context.taskTypeById.get(slot.taskTypeId) : null;

      if (!slot || !block || !taskType) {
        return [];
      }

      return [{
        employeeId: assignment.employeeId,
        date: slot.date,
        shiftBlockId: slot.shiftBlockId,
        shiftCategory: block.shiftCategory,
        startMinute: block.startMinute,
        endMinute: block.endMinute,
        paidHours: Number(block.paidHours),
        taskTypeCode: taskType.code,
        isBackground: taskType.isBackground,
      }];
    },
  );

  return evaluateWeeklyHardRequirements({
    targets: context.hardTargets,
    assignments: hardAssignments,
  });
}

function toSchedulerSlot(
  context: ManualEditContext,
  slot: ManualEditDraftSlot,
): SchedulerTaskSlot {
  const block = context.shiftBlockById.get(slot.shiftBlockId)!;

  return {
    id: slot.id,
    date: slot.date,
    taskTypeId: slot.taskTypeId,
    slotIndex: slot.slotIndex,
    shiftBlockId: slot.shiftBlockId,
    shiftTemplateId: block.shiftTemplateId,
    shiftCategory: block.shiftCategory,
    shiftName: block.name,
    paidHours: Number(block.paidHours),
    startMinute: block.startMinute,
    endMinute: block.endMinute,
    requirementLevel: slot.requirementLevel,
  };
}

function toExistingAssignment(
  context: ManualEditContext,
  slots: ManualEditDraftSlot[],
  assignment: ManualEditDraftAssignment,
): ExistingAssignment {
  const slot = slots.find((item) => item.id === assignment.slotId)!;
  const block = context.shiftBlockById.get(slot.shiftBlockId)!;
  const taskType = context.taskTypeById.get(slot.taskTypeId)!;

  return {
    slotId: slot.id,
    employeeId: assignment.employeeId,
    date: slot.date,
    taskTypeId: slot.taskTypeId,
    startMinute: block.startMinute,
    endMinute: block.endMinute,
    shiftBlockId: slot.shiftBlockId,
    shiftCategory: block.shiftCategory,
    paidHours: Number(block.paidHours),
    isPatientFacing: taskType.isPatientFacing,
    isClinical: taskType.isClinical,
    isBackground: taskType.isBackground,
    isEndoscopy: taskType.isEndoscopy,
    locked: assignment.locked,
  };
}

function coverageIssues(
  slots: ManualEditDraftSlot[],
  assignments: ManualEditDraftAssignment[],
) {
  return slots.flatMap((slot) => {
    const count = assignments.filter(
      (assignment) => assignment.slotId === slot.id,
    ).length;

    if (slot.requirementLevel !== "REQUIRED" || count >= slot.requiredStaff) {
      return [];
    }

    return [{
      key: `${slot.id}:${count}`,
      diagnostic: {
        severity: "OVERRIDE_REQUIRED" as const,
        code: "REQUIRED_COVERAGE_UNFILLED",
        message: `A required slot on ${slot.date} has ${count}/${slot.requiredStaff} assigned staff.`,
        slotId: slot.id,
        date: slot.date,
      },
    }];
  });
}

function coverageIssueKeys(
  slots: ManualEditDraftSlot[],
  assignments: ManualEditDraftAssignment[],
) {
  return new Set(coverageIssues(slots, assignments).map((item) => item.key));
}

function pendingTimeOffForSlot(
  context: ManualEditContext,
  employeeId: string,
  slot: ManualEditDraftSlot,
) {
  const employee = context.employeeById.get(employeeId);
  const block = context.shiftBlockById.get(slot.shiftBlockId);

  if (!employee || !block) {
    return [];
  }

  const labels: string[] = [];
  const overlaps = (request: {
    startDate: Date;
    endDate: Date;
    startMinute: number | null;
    endMinute: number | null;
  }) =>
    toIsoDate(request.startDate) <= slot.date &&
    toIsoDate(request.endDate) >= slot.date &&
    block.startMinute < (request.endMinute ?? 24 * 60) &&
    (request.startMinute ?? 0) < block.endMinute;

  if (
    employee.ptoRequests.some(
      (request) => request.status === "PENDING" && overlaps(request),
    )
  ) {
    labels.push("PTO");
  }
  if (
    employee.nptoRequests.some(
      (request) => request.status === "PENDING" && overlaps(request),
    )
  ) {
    labels.push("NPTO");
  }

  return labels;
}

function hoursForEmployee(
  assignments: ManualEditDraftAssignment[],
  slots: ManualEditDraftSlot[],
  shiftBlockById: ManualEditContext["shiftBlockById"],
  employeeId: string,
) {
  const uniqueBlocks = new Set(
    assignments
      .filter((assignment) => assignment.employeeId === employeeId)
      .map((assignment) => {
        const slot = slots.find((item) => item.id === assignment.slotId);
        return slot ? `${slot.date}:${slot.shiftBlockId}` : null;
      })
      .filter((value): value is string => Boolean(value)),
  );

  return [...uniqueBlocks].reduce((total, key) => {
    const blockId = key.slice(key.indexOf(":") + 1);
    return total + Number(shiftBlockById.get(blockId)?.paidHours ?? 0);
  }, 0);
}

function validateBatchReferences(
  context: ManualEditContext,
  batch: ManualEditBatch,
  diagnostics: ManualEditDiagnostic[],
) {
  const assignmentIds = new Set(context.baseState.assignments.map((item) => item.id));
  const slotIds = new Set(context.baseState.slots.map((item) => item.id));
  const employeeIds = new Set(context.employees.map((item) => item.id));
  const blockIds = new Set(context.baseState.shiftBlocks.map((item) => item.id));
  const taskTypeIds = new Set(context.taskTypes.map((item) => item.id));

  for (const change of batch.assignmentChanges) {
    if (!assignmentIds.has(change.assignmentId)) {
      diagnostics.push(blocker("UNKNOWN_ASSIGNMENT", "A changed assignment no longer exists."));
    }
    if (change.employeeId && !employeeIds.has(change.employeeId)) {
      diagnostics.push(blocker("UNKNOWN_EMPLOYEE", "A selected employee no longer exists."));
    }
  }
  for (const addition of batch.addedAssignments) {
    if (!slotIds.has(addition.slotId)) {
      diagnostics.push(blocker("UNKNOWN_SLOT", "An assignment target no longer exists."));
    }
    if (!employeeIds.has(addition.employeeId)) {
      diagnostics.push(blocker("UNKNOWN_EMPLOYEE", "A selected employee no longer exists."));
    }
  }
  for (const addition of batch.addedSlots) {
    if (!blockIds.has(addition.shiftBlockId) || !taskTypeIds.has(addition.taskTypeId)) {
      diagnostics.push(blocker("UNKNOWN_SLOT_INPUT", "A manual slot references unavailable configuration."));
    }
    if (addition.employeeId && !employeeIds.has(addition.employeeId)) {
      diagnostics.push(blocker("UNKNOWN_EMPLOYEE", "A selected employee no longer exists."));
    }
  }
}

async function assertManualEditRevisions(
  tx: Prisma.TransactionClient,
  batch: ManualEditBatch,
) {
  const ids = batch.revisions.map((revision) => revision.scheduleDayId);

  if (ids.length === 0) {
    throw new Error("This week has no prepared schedule days.");
  }

  const rows = await tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>`
    SELECT "id", "updatedAt"
    FROM "ScheduleDay"
    WHERE "id" IN (${Prisma.join(ids)})
    FOR UPDATE
  `;
  const actualById = new Map(rows.map((row) => [row.id, row.updatedAt.toISOString()]));

  for (const revision of batch.revisions) {
    if (actualById.get(revision.scheduleDayId) !== revision.updatedAt) {
      throw new Error(
        "The schedule changed while this workspace was open. Refresh before saving.",
      );
    }
  }
}

function candidateBatch(
  input: {
    batch: ManualEditBatch;
    assignmentId?: string | null;
    slotId?: string | null;
  },
  employeeId: string,
): ManualEditBatch {
  if (input.assignmentId) {
    const existing = input.batch.assignmentChanges.find(
      (change) => change.assignmentId === input.assignmentId,
    );
    return {
      ...input.batch,
      assignmentChanges: [
        ...input.batch.assignmentChanges.filter(
          (change) => change.assignmentId !== input.assignmentId,
        ),
        {
          assignmentId: input.assignmentId,
          employeeId,
          locked: existing?.locked ?? true,
          note: existing?.note ?? null,
        },
      ],
    };
  }

  if (input.slotId) {
    return {
      ...input.batch,
      addedAssignments: [
        ...input.batch.addedAssignments.filter(
          (addition) => addition.clientId !== "__candidate__",
        ),
        {
          clientId: "__candidate__",
          slotId: input.slotId,
          employeeId,
          locked: true,
          note: null,
        },
      ],
    };
  }

  return input.batch;
}

function emptyBatch(context: ManualEditContext): ManualEditBatch {
  return {
    weekStart: context.range.startDate,
    revisions: context.scheduleDays.map((day) => ({
      scheduleDayId: day.id,
      updatedAt: day.updatedAt.toISOString(),
    })),
    assignmentChanges: [],
    addedAssignments: [],
    addedSlots: [],
    overrideReason: null,
  };
}

function touchedDatesForBatch(
  context: ManualEditContext,
  batch: ManualEditBatch,
) {
  const dates = new Set(batch.addedSlots.map((addition) => addition.date));

  for (const change of batch.assignmentChanges) {
    const assignment = context.baseState.assignments.find(
      (item) => item.id === change.assignmentId,
    );
    const slot = assignment
      ? context.baseState.slots.find((item) => item.id === assignment.slotId)
      : null;
    if (slot) dates.add(slot.date);
  }
  for (const addition of batch.addedAssignments) {
    const slot = context.baseState.slots.find((item) => item.id === addition.slotId);
    if (slot) dates.add(slot.date);
  }

  return dates;
}

function warningSeverity(code: string): "WARNING" | "OVERRIDE_REQUIRED" {
  return code === "FAIRNESS_IMBALANCE" || code === "PATTERN_DEVIATION"
    ? "WARNING"
    : "OVERRIDE_REQUIRED";
}

function diagnosticCounts(diagnostics: ManualEditDiagnostic[]) {
  return {
    warningCount: diagnostics.filter((item) => item.severity === "WARNING").length,
    overrideRequiredCount: diagnostics.filter(
      (item) => item.severity === "OVERRIDE_REQUIRED",
    ).length,
    blockerCount: diagnostics.filter((item) => item.severity === "BLOCKER").length,
  };
}

function severityFromDiagnostics(
  diagnostics: ManualEditDiagnostic[],
): ManualEditSeverity {
  if (diagnostics.some((item) => item.severity === "BLOCKER")) return "BLOCKER";
  if (diagnostics.some((item) => item.severity === "OVERRIDE_REQUIRED")) {
    return "OVERRIDE_REQUIRED";
  }
  if (diagnostics.some((item) => item.severity === "WARNING")) return "WARNING";
  return "SAFE";
}

function severityRank(severity: ManualEditSeverity) {
  return ["SAFE", "WARNING", "OVERRIDE_REQUIRED", "BLOCKER"].indexOf(severity);
}

function dedupeDiagnostics(diagnostics: ManualEditDiagnostic[]) {
  return [
    ...new Map(
      diagnostics.map((item) => [
        `${item.severity}:${item.code}:${item.employeeId ?? ""}:${item.assignmentId ?? ""}:${item.slotId ?? ""}:${item.date ?? ""}`,
        item,
      ]),
    ).values(),
  ];
}

function blocker(code: string, message: string): ManualEditDiagnostic {
  return { severity: "BLOCKER", code, message };
}

function hardIssueKey(issue: {
  code: string;
  employeeId: string | null;
  message: string;
}) {
  return `${issue.code}:${issue.employeeId ?? ""}:${issue.message}`;
}

function jsonNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(Number).filter((item) => Number.isFinite(item))
    : [];
}

function jsonNumberRecord(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, Number(item)] as const)
      .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0),
  );
}
