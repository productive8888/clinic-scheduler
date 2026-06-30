import { eastonWorkPatternGroups } from "@/lib/easton-import/work-patterns";
import { dateToWeekday } from "@/lib/scheduler/constraints";
import type {
  EmployeeWeekSkeleton,
  SchedulerEmployee,
  SchedulerTaskSlot,
} from "@/lib/scheduler";

export type JulyWeekShiftBlock = {
  id: string;
  date: string;
  shiftCategory?: SchedulerTaskSlot["shiftCategory"] | null;
  startMinute: number;
  endMinute: number;
  paidHours: number;
};

export function buildJulyWeekSkeletons(input: {
  employees: SchedulerEmployee[];
  shiftBlocks: JulyWeekShiftBlock[];
}) {
  const shiftBlocks = [...input.shiftBlocks].sort(compareShiftBlocks);
  const allShiftBlockIds = shiftBlocks.map((shiftBlock) => shiftBlock.id);
  const blockUsage = new Map<string, number>();
  const offDayCounts = new Map<number, number>();
  const skeletons = new Map<string, EmployeeWeekSkeleton>();

  for (const employee of [...input.employees].sort(compareEmployees)) {
    const pattern = employee.workPattern;

    if (!pattern?.kind) {
      continue;
    }

    const skeleton =
      pattern.kind === "ENDOSCOPY_SATURDAY"
        ? buildEndoscopySkeleton({
            employee,
            shiftBlocks,
            allShiftBlockIds,
            blockUsage,
          })
        : pattern.kind === "NON_ENDOSCOPY_SATURDAY"
          ? buildNonEndoscopySkeleton({
              employee,
              shiftBlocks,
              allShiftBlockIds,
              blockUsage,
              offDayCounts,
            })
          : null;

    if (skeleton) {
      skeletons.set(employee.id, skeleton);

      for (const shiftBlockId of skeleton.requiredShiftBlockIds) {
        blockUsage.set(shiftBlockId, (blockUsage.get(shiftBlockId) ?? 0) + 1);
      }
    }
  }

  return skeletons;
}

function buildEndoscopySkeleton(input: {
  employee: SchedulerEmployee;
  shiftBlocks: JulyWeekShiftBlock[];
  allShiftBlockIds: string[];
  blockUsage: Map<string, number>;
}): EmployeeWeekSkeleton {
  const plannedDays: EmployeeWeekSkeleton["plannedDays"] = [];
  const requiredShiftBlockIds: string[] = [];
  const saturday = findBlock(input.shiftBlocks, 6, isSaturdayEndoscopyBlock);
  const workWeekdays = chooseEndoscopyWeekdays(input.shiftBlocks);

  for (const date of sortedDates(input.shiftBlocks)) {
    const weekday = dateToWeekday(date);

    if (weekday === 6) {
      const ids = saturday?.date === date ? [saturday.id] : [];
      plannedDays.push({
        date,
        kind: "SATURDAY_ENDO",
        allowedShiftBlockIds: ids,
        requiredShiftBlockIds: ids,
      });
      requiredShiftBlockIds.push(...ids);
      continue;
    }

    if (workWeekdays.includes(weekday)) {
      const normal = normalFullDayBlocks(input.shiftBlocks, date);
      plannedDays.push({
        date,
        kind: "NORMAL_FULL_DAY",
        allowedShiftBlockIds: normal.map((block) => block.id),
        requiredShiftBlockIds: normal.map((block) => block.id),
      });
      requiredShiftBlockIds.push(...normal.map((block) => block.id));
      continue;
    }

    plannedDays.push({
      date,
      kind: "OFF",
      allowedShiftBlockIds: [],
      requiredShiftBlockIds: [],
    });
  }

  const allowedShiftBlockIds = unique(requiredShiftBlockIds);

  return {
    employeeId: input.employee.id,
    groupLabel: workPatternLabel(input.employee),
    targetHours: Number(input.employee.targetWeeklyHours ?? 40),
    allowedShiftBlockIds,
    requiredShiftBlockIds: allowedShiftBlockIds,
    forbiddenShiftBlockIds: input.allShiftBlockIds.filter(
      (shiftBlockId) => !allowedShiftBlockIds.includes(shiftBlockId),
    ),
    requiredSaturdayShiftBlockId: saturday?.id ?? null,
    requiredExtraHourWeekdays: [],
    plannedDays,
  };
}

function buildNonEndoscopySkeleton(input: {
  employee: SchedulerEmployee;
  shiftBlocks: JulyWeekShiftBlock[];
  allShiftBlockIds: string[];
  blockUsage: Map<string, number>;
  offDayCounts: Map<number, number>;
}): EmployeeWeekSkeleton {
  const extraWeekdays = [...(input.employee.workPattern?.extraHourWeekdays ?? [])]
    .map(Number)
    .filter((weekday) => weekday >= 1 && weekday <= 4)
    .sort((left, right) => left - right);
  const offWeekday = chooseNonEndoscopyOffWeekday({
    requiredExtraWeekdays: extraWeekdays,
    offDayCounts: input.offDayCounts,
  });
  input.offDayCounts.set(
    offWeekday,
    (input.offDayCounts.get(offWeekday) ?? 0) + 1,
  );

  const plannedDays: EmployeeWeekSkeleton["plannedDays"] = [];
  const requiredShiftBlockIds: string[] = [];
  const saturday = findBlock(input.shiftBlocks, 6, isSaturdayRegularBlock);

  for (const date of sortedDates(input.shiftBlocks)) {
    const weekday = dateToWeekday(date);

    if (weekday === 6) {
      const ids = saturday?.date === date ? [saturday.id] : [];
      plannedDays.push({
        date,
        kind: "SATURDAY_REGULAR",
        allowedShiftBlockIds: ids,
        requiredShiftBlockIds: ids,
      });
      requiredShiftBlockIds.push(...ids);
      continue;
    }

    if (weekday === offWeekday || weekday < 1 || weekday > 5) {
      plannedDays.push({
        date,
        kind: "OFF",
        allowedShiftBlockIds: [],
        requiredShiftBlockIds: [],
      });
      continue;
    }

    const blocks = extraWeekdays.includes(weekday)
      ? extendedFullDayBlocks({
          shiftBlocks: input.shiftBlocks,
          date,
          blockUsage: input.blockUsage,
        })
      : normalFullDayBlocks(input.shiftBlocks, date);
    const ids = blocks.map((block) => block.id);

    plannedDays.push({
      date,
      kind: extraWeekdays.includes(weekday)
        ? "EXTENDED_FULL_DAY"
        : "NORMAL_FULL_DAY",
      allowedShiftBlockIds: ids,
      requiredShiftBlockIds: ids,
    });
    requiredShiftBlockIds.push(...ids);
  }

  const allowedShiftBlockIds = unique(requiredShiftBlockIds);

  return {
    employeeId: input.employee.id,
    groupLabel: workPatternLabel(input.employee),
    targetHours: Number(input.employee.targetWeeklyHours ?? 40),
    allowedShiftBlockIds,
    requiredShiftBlockIds: allowedShiftBlockIds,
    forbiddenShiftBlockIds: input.allShiftBlockIds.filter(
      (shiftBlockId) => !allowedShiftBlockIds.includes(shiftBlockId),
    ),
    requiredSaturdayShiftBlockId: saturday?.id ?? null,
    requiredExtraHourWeekdays: extraWeekdays,
    plannedDays,
  };
}

function chooseEndoscopyWeekdays(shiftBlocks: JulyWeekShiftBlock[]) {
  const preferred = [2, 3, 4, 5];
  const availablePreferred = preferred.filter((weekday) =>
    sortedDates(shiftBlocks).some(
      (date) =>
        dateToWeekday(date) === weekday &&
        normalFullDayBlocks(shiftBlocks, date).length === 2,
    ),
  );

  if (availablePreferred.length >= 4) {
    return availablePreferred.slice(0, 4);
  }

  const fallback = [1, 2, 3, 4, 5].filter((weekday) =>
    sortedDates(shiftBlocks).some(
      (date) =>
        dateToWeekday(date) === weekday &&
        normalFullDayBlocks(shiftBlocks, date).length === 2,
    ),
  );

  return unique([...availablePreferred, ...fallback]).slice(0, 4);
}

function chooseNonEndoscopyOffWeekday(input: {
  requiredExtraWeekdays: number[];
  offDayCounts: Map<number, number>;
}) {
  const required = new Set(input.requiredExtraWeekdays);
  const candidates = [1, 2, 3, 4, 5].filter((weekday) => !required.has(weekday));

  return candidates.sort(
    (left, right) =>
      (input.offDayCounts.get(left) ?? 0) -
        (input.offDayCounts.get(right) ?? 0) ||
      offDayPreference(left) - offDayPreference(right) ||
      left - right,
  )[0] ?? 5;
}

function offDayPreference(weekday: number) {
  // Friday has lower clinic demand in the July workbook; prefer it as the
  // default non-endoscopy off-day when that still balances across employees.
  return weekday === 5 ? 0 : weekday === 1 ? 1 : 2;
}

function normalFullDayBlocks(shiftBlocks: JulyWeekShiftBlock[], date: string) {
  return [
    shiftBlocks.find((block) => block.date === date && isRegularAmBlock(block)),
    shiftBlocks.find((block) => block.date === date && isRegularPmBlock(block)),
  ].filter((block): block is JulyWeekShiftBlock => Boolean(block));
}

function extendedFullDayBlocks(input: {
  shiftBlocks: JulyWeekShiftBlock[];
  date: string;
  blockUsage: Map<string, number>;
}) {
  const weekday = dateToWeekday(input.date);

  if (weekday === 1) {
    const earlyOption = [
      input.shiftBlocks.find(
        (block) => block.date === input.date && isEarlyAmBlock(block),
      ),
      input.shiftBlocks.find(
        (block) => block.date === input.date && isRegularPmBlock(block),
      ),
    ].filter((block): block is JulyWeekShiftBlock => Boolean(block));
    const lateOption = [
      input.shiftBlocks.find(
        (block) => block.date === input.date && isRegularAmBlock(block),
      ),
      input.shiftBlocks.find(
        (block) => block.date === input.date && isMondayLongPmBlock(block),
      ),
    ].filter((block): block is JulyWeekShiftBlock => Boolean(block));

    if (earlyOption.length < 2) return lateOption;
    if (lateOption.length < 2) return earlyOption;

    return optionUsage(earlyOption, input.blockUsage) <=
      optionUsage(lateOption, input.blockUsage)
      ? earlyOption
      : lateOption;
  }

  return [
    input.shiftBlocks.find(
      (block) => block.date === input.date && isEarlyAmBlock(block),
    ),
    input.shiftBlocks.find(
      (block) => block.date === input.date && isRegularPmBlock(block),
    ),
  ].filter((block): block is JulyWeekShiftBlock => Boolean(block));
}

function findBlock(
  shiftBlocks: JulyWeekShiftBlock[],
  weekday: number,
  predicate: (shiftBlock: JulyWeekShiftBlock) => boolean,
) {
  return shiftBlocks.find(
    (shiftBlock) =>
      dateToWeekday(shiftBlock.date) === weekday && predicate(shiftBlock),
  );
}

export function isJulySkeletonForbiddenShift(
  skeleton: EmployeeWeekSkeleton,
  slot: Pick<SchedulerTaskSlot, "shiftBlockId">,
) {
  return Boolean(
    slot.shiftBlockId && !skeleton.allowedShiftBlockIds.includes(slot.shiftBlockId),
  );
}

function isEarlyAmBlock(block: JulyWeekShiftBlock) {
  return (
    block.startMinute === 7 * 60 &&
    block.endMinute === 12 * 60 &&
    Number(block.paidHours) === 5
  );
}

function isRegularAmBlock(block: JulyWeekShiftBlock) {
  return (
    block.startMinute === 8 * 60 &&
    block.endMinute === 12 * 60 &&
    Number(block.paidHours) === 4
  );
}

function isRegularPmBlock(block: JulyWeekShiftBlock) {
  return (
    block.startMinute === 13 * 60 &&
    block.endMinute === 17 * 60 &&
    Number(block.paidHours) === 4
  );
}

function isMondayLongPmBlock(block: JulyWeekShiftBlock) {
  return (
    dateToWeekday(block.date) === 1 &&
    block.startMinute === 13 * 60 &&
    block.endMinute === 18 * 60 &&
    Number(block.paidHours) === 5
  );
}

function isSaturdayEndoscopyBlock(block: JulyWeekShiftBlock) {
  return (
    block.shiftCategory === "ENDO" &&
    block.startMinute === 6 * 60 &&
    block.endMinute === 14 * 60 &&
    Number(block.paidHours) === 8
  );
}

function isSaturdayRegularBlock(block: JulyWeekShiftBlock) {
  return (
    block.shiftCategory === "SATURDAY" &&
    block.startMinute === 8 * 60 &&
    block.endMinute === 14 * 60 &&
    Number(block.paidHours) === 6
  );
}

function optionUsage(
  shiftBlocks: JulyWeekShiftBlock[],
  blockUsage: Map<string, number>,
) {
  return shiftBlocks.reduce(
    (total, shiftBlock) => total + (blockUsage.get(shiftBlock.id) ?? 0),
    0,
  );
}

function sortedDates(shiftBlocks: JulyWeekShiftBlock[]) {
  return unique(shiftBlocks.map((shiftBlock) => shiftBlock.date)).sort();
}

function workPatternLabel(employee: SchedulerEmployee) {
  const code = employee.workPattern?.code;
  const exactPattern = eastonWorkPatternGroups().find(
    (pattern) => pattern.code === code,
  );

  return exactPattern?.label ?? code ?? employee.workPattern?.kind ?? "Current Easton";
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function compareShiftBlocks(left: JulyWeekShiftBlock, right: JulyWeekShiftBlock) {
  return (
    left.date.localeCompare(right.date) ||
    left.startMinute - right.startMinute ||
    left.endMinute - right.endMinute ||
    left.id.localeCompare(right.id)
  );
}

function compareEmployees(left: SchedulerEmployee, right: SchedulerEmployee) {
  return left.fullName.localeCompare(right.fullName) || left.id.localeCompare(right.id);
}
