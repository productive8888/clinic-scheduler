"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getManualEditCandidatesAction,
  previewManualEditAction,
  saveManualEditAction,
} from "@/app/(workspace)/schedule/week/manual-edit/actions";
import type { getManualEditWorkspaceData } from "@/lib/db/manual-edit";
import {
  applyManualEditBatchToState,
  type ManualEditDraftAssignment,
} from "@/lib/schedule/manual-edit-state";
import type {
  ManualEditBatch,
  ManualEditCandidate,
  ManualEditPreview,
} from "@/lib/schedule/manual-edit-types";
import { formatCompactMinuteRange } from "@/lib/utils/time";
import { ManualAssignmentChip } from "./manual-assignment-chip";
import { ManualEditInspector } from "./manual-edit-inspector";
import { ManualEditTopbar } from "./manual-edit-topbar";
import { ManualEditValidationRail } from "./manual-edit-validation-rail";

type WorkspaceData = Awaited<ReturnType<typeof getManualEditWorkspaceData>>;

type Selection =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "empty"; employeeId: string; date: string }
  | null;

export function ManualEditWorkspace({ data }: { data: WorkspaceData }) {
  const router = useRouter();
  const [batch, setBatch] = useState<ManualEditBatch>(() => initialBatch(data));
  const [selection, setSelection] = useState<Selection>(null);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ManualEditPreview | null>(null);
  const [candidates, setCandidates] = useState<ManualEditCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const baseState = useMemo(
    () => ({
      slots: data.slots.map((slot) => ({
        id: slot.id,
        persistedSlotId: slot.persistedSlotId,
        scheduleDayId: slot.scheduleDayId,
        date: slot.date,
        shiftBlockId: slot.shiftBlockId,
        taskTypeId: slot.taskTypeId,
        slotIndex: slot.slotIndex,
        requirementLevel: slot.requirementLevel,
        requiredStaff: slot.requiredStaff,
        source: slot.source,
      })),
      assignments: data.assignments.map((assignment) => ({
        id: assignment.id,
        persistedAssignmentId: assignment.persistedAssignmentId,
        slotId: assignment.slotId,
        employeeId: assignment.employeeId,
        locked: assignment.locked,
        source: assignment.source,
        note: assignment.note,
      })),
      shiftBlocks: data.days.flatMap((day) =>
        day.shiftBlocks.map((block) => ({
          id: block.id,
          scheduleDayId: day.id,
          date: day.date,
        })),
      ),
    }),
    [data],
  );
  const draft = useMemo(
    () => applyManualEditBatchToState(baseState, batch),
    [baseState, batch],
  );
  const slotById = useMemo(
    () => new Map(draft.slots.map((slot) => [slot.id, slot])),
    [draft.slots],
  );
  const displaySlotById = useMemo(
    () => new Map(data.slots.map((slot) => [slot.id, slot])),
    [data.slots],
  );
  const taskTypeById = useMemo(
    () => new Map(data.taskTypes.map((taskType) => [taskType.id, taskType])),
    [data.taskTypes],
  );
  const employeeById = useMemo(
    () => new Map(data.employees.map((employee) => [employee.id, employee])),
    [data.employees],
  );
  const shiftBlockById = useMemo(
    () =>
      new Map(
        data.days.flatMap((day) =>
          day.shiftBlocks.map((block) => [
            block.id,
            { ...block, date: day.date, scheduleDayId: day.id },
          ] as const),
        ),
      ),
    [data.days],
  );
  const changeCount =
    batch.assignmentChanges.length +
    batch.addedAssignments.length +
    batch.addedSlots.length;

  useEffect(() => {
    if (changeCount === 0) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changeCount]);

  const selectedAssignment =
    selection?.kind === "assignment"
      ? draft.assignments.find(
          (assignment) => assignment.id === selection.assignmentId,
        ) ?? null
      : null;
  const selectedSlot = selectedAssignment
    ? slotById.get(selectedAssignment.slotId) ?? null
    : null;
  const selectedBlock = selectedSlot
    ? shiftBlockById.get(selectedSlot.shiftBlockId) ?? null
    : null;
  const selectedTaskType = selectedSlot
    ? taskTypeById.get(selectedSlot.taskTypeId) ?? null
    : null;
  const inspectorAssignment =
    selectedAssignment && selectedSlot && selectedBlock && selectedTaskType
      ? {
          ...selectedAssignment,
          employeeName:
            employeeById.get(selectedAssignment.employeeId)?.fullName ?? "Unknown",
          roleName: selectedTaskType.name,
          date: selectedSlot.date,
          startMinute: selectedBlock.startMinute,
          endMinute: selectedBlock.endMinute,
        }
      : null;
  const emptyCell =
    selection?.kind === "empty"
      ? buildEmptyCell({
          data,
          draft,
          employeeId: selection.employeeId,
          date: selection.date,
          employeeById,
          taskTypeById,
          shiftBlockById,
        })
      : null;
  const selectedDiagnostics =
    preview?.diagnostics.filter(
      (diagnostic) =>
        diagnostic.assignmentId === selectedAssignment?.id ||
        diagnostic.slotId === selectedAssignment?.slotId ||
        diagnostic.employeeId === selectedAssignment?.employeeId,
    ) ?? [];

  function updateBatch(updater: (current: ManualEditBatch) => ManualEditBatch) {
    setBatch((current) => updater(current));
    setPreview(null);
    setCandidates(null);
    setError(null);
  }

  function selectAssignment(assignment: ManualEditDraftAssignment) {
    if (swapSourceId && swapSourceId !== assignment.id) {
      const source = draft.assignments.find((item) => item.id === swapSourceId);
      if (source) {
        updateBatch((current) =>
          setAssignmentEmployee(
            setAssignmentEmployee(current, source, assignment.employeeId),
            assignment,
            source.employeeId,
          ),
        );
      }
      setSwapSourceId(null);
    }

    setSelection({ kind: "assignment", assignmentId: assignment.id });
    setCandidates(null);
  }

  function validateChanges() {
    startTransition(async () => {
      try {
        setError(null);
        setPreview(await previewManualEditAction(JSON.stringify(batch)));
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });
  }

  function saveChanges() {
    startTransition(async () => {
      try {
        setError(null);
        await saveManualEditAction(JSON.stringify(batch));
        router.push(`/schedule/week?date=${data.range.startDate}`);
        router.refresh();
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });
  }

  function loadCandidates() {
    if (!selectedAssignment?.persistedAssignmentId) return;

    startTransition(async () => {
      try {
        setError(null);
        setCandidates(
          await getManualEditCandidatesAction({
            payload: JSON.stringify(batch),
            assignmentId: selectedAssignment.persistedAssignmentId,
          }),
        );
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });
  }

  return (
    <div className="flex h-screen min-h-[700px] flex-col overflow-hidden">
      <ManualEditTopbar
        weekStart={data.range.startDate}
        weekEnd={data.range.endDate}
        changeCount={changeCount}
        pending={isPending}
        overrideReason={batch.overrideReason ?? ""}
        needsReason={Boolean(preview && preview.overrideRequiredCount > 0)}
        onOverrideReasonChange={(overrideReason) =>
          setBatch((current) => ({ ...current, overrideReason }))
        }
        onValidate={validateChanges}
        onDiscard={() => {
          setBatch(initialBatch(data));
          setSelection(null);
          setSwapSourceId(null);
          setPreview(null);
          setCandidates(null);
          setError(null);
        }}
        onSave={saveChanges}
      />

      {error ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-sm font-medium text-rose-800">
          {error}
        </div>
      ) : null}
      {swapSourceId ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
          Swap mode: select the second assignment. Both employee changes remain
          staged until save.
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 overflow-auto bg-slate-100">
          <table className="min-w-[1380px] border-collapse text-left">
            <thead className="sticky top-0 z-30 bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="sticky left-0 z-40 w-56 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
                  Employee
                </th>
                {data.days.map((day) => (
                  <th
                    key={day.date}
                    className="min-w-44 border-b border-r border-slate-200 px-3 py-3 font-semibold"
                  >
                    <span className="block">{weekdayLabel(day.date)}</span>
                    <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-400">
                      {day.status}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {data.employees.map((employee) => {
                const beforeHours = hoursForEmployee(
                  baseState.assignments,
                  baseState.slots,
                  shiftBlockById,
                  employee.id,
                );
                const afterHours = hoursForEmployee(
                  draft.assignments,
                  draft.slots,
                  shiftBlockById,
                  employee.id,
                );
                const employeeIssueCount =
                  preview?.diagnostics.filter(
                    (diagnostic) => diagnostic.employeeId === employee.id,
                  ).length ?? 0;

                return (
                  <tr key={employee.id} className="align-top">
                    <th className="sticky left-0 z-20 border-r border-slate-200 bg-white px-4 py-3">
                      <div className="font-semibold text-slate-950">
                        {employee.fullName}
                      </div>
                      <div
                        className={
                          afterHours === employee.targetHours
                            ? "mt-1 font-mono text-xs text-emerald-700"
                            : "mt-1 font-mono text-xs text-amber-700"
                        }
                      >
                        {afterHours.toFixed(2)}/{employee.targetHours.toFixed(2)}h
                        {beforeHours !== afterHours
                          ? ` · ${afterHours > beforeHours ? "+" : ""}${(
                              afterHours - beforeHours
                            ).toFixed(2)}`
                          : ""}
                      </div>
                      {employeeIssueCount > 0 ? (
                        <div className="mt-1 text-[11px] font-semibold text-rose-700">
                          {employeeIssueCount} preview issue
                          {employeeIssueCount === 1 ? "" : "s"}
                        </div>
                      ) : null}
                    </th>
                    {data.days.map((day) => {
                      const assignments = draft.assignments.filter(
                        (assignment) =>
                          assignment.employeeId === employee.id &&
                          slotById.get(assignment.slotId)?.date === day.date,
                      );

                      return (
                        <td
                          key={day.date}
                          className="border-r border-slate-200 px-2 py-2"
                        >
                          <div className="grid gap-2">
                            {assignments.map((assignment) => {
                              const slot = slotById.get(assignment.slotId);
                              const persistedSlot = displaySlotById.get(
                                assignment.slotId,
                              );
                              const block = slot
                                ? shiftBlockById.get(slot.shiftBlockId)
                                : null;
                              const taskType = slot
                                ? taskTypeById.get(slot.taskTypeId)
                                : null;

                              if (!slot || !block || !taskType) return null;

                              return (
                                <ManualAssignmentChip
                                  key={assignment.id}
                                  timeLabel={formatCompactMinuteRange(
                                    block.startMinute,
                                    block.endMinute,
                                  )}
                                  roleName={
                                    persistedSlot?.taskTypeName ?? taskType.name
                                  }
                                  background={taskType.isBackground}
                                  locked={assignment.locked}
                                  selected={
                                    selection?.kind === "assignment" &&
                                    selection.assignmentId === assignment.id
                                  }
                                  changed={isAssignmentChanged(batch, assignment.id)}
                                  onClick={() => selectAssignment(assignment)}
                                />
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => {
                                setSelection({
                                  kind: "empty",
                                  employeeId: employee.id,
                                  date: day.date,
                                });
                                setCandidates(null);
                              }}
                              className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-[11px] font-semibold text-slate-500 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <Plus size={12} aria-hidden="true" />
                              Add
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="min-h-0 border-l border-slate-200">
          <ManualEditInspector
            assignment={inspectorAssignment}
            emptyCell={emptyCell}
            candidates={candidates}
            candidateLoading={isPending}
            diagnostics={selectedDiagnostics}
            swapSourceId={swapSourceId}
            onChooseCandidate={(employeeId) => {
              if (!selectedAssignment) return;
              updateBatch((current) =>
                setAssignmentEmployee(current, selectedAssignment, employeeId),
              );
            }}
            onLoadCandidates={loadCandidates}
            onRemove={() => {
              if (!selectedAssignment) return;
              updateBatch((current) =>
                removeAssignment(current, selectedAssignment),
              );
              setSelection(null);
            }}
            onToggleLock={() => {
              if (!selectedAssignment) return;
              updateBatch((current) =>
                setAssignmentLock(
                  current,
                  selectedAssignment,
                  !selectedAssignment.locked,
                ),
              );
            }}
            onStartSwap={() => {
              if (selectedAssignment) setSwapSourceId(selectedAssignment.id);
            }}
            onCancelSwap={() => setSwapSourceId(null)}
            onAddAssignment={(slotId) => {
              if (!emptyCell) return;
              updateBatch((current) => ({
                ...current,
                addedAssignments: [
                  ...current.addedAssignments,
                  {
                    clientId: crypto.randomUUID(),
                    slotId,
                    employeeId: emptyCell.employeeId,
                    locked: true,
                    note: null,
                  },
                ],
              }));
              setSelection(null);
            }}
            onAddManualSlot={(shiftBlockId, taskTypeId) => {
              if (!emptyCell) return;
              updateBatch((current) => ({
                ...current,
                addedSlots: [
                  ...current.addedSlots,
                  {
                    clientId: crypto.randomUUID(),
                    date: emptyCell.date,
                    shiftBlockId,
                    taskTypeId,
                    employeeId: emptyCell.employeeId,
                    locked: true,
                    note: null,
                  },
                ],
              }));
              setSelection(null);
            }}
          />
        </section>
      </div>

      <ManualEditValidationRail preview={preview} />
    </div>
  );
}

function initialBatch(data: WorkspaceData): ManualEditBatch {
  return {
    weekStart: data.range.startDate,
    revisions: data.revisions,
    assignmentChanges: [],
    addedAssignments: [],
    addedSlots: [],
    overrideReason: null,
  };
}

function setAssignmentEmployee(
  batch: ManualEditBatch,
  assignment: ManualEditDraftAssignment,
  employeeId: string,
) {
  if (assignment.persistedAssignmentId) {
    return {
      ...batch,
      assignmentChanges: [
        ...batch.assignmentChanges.filter(
          (change) => change.assignmentId !== assignment.persistedAssignmentId,
        ),
        {
          assignmentId: assignment.persistedAssignmentId,
          employeeId,
          locked: assignment.locked,
          note: assignment.note,
        },
      ],
    };
  }

  const addedAssignment = batch.addedAssignments.find(
    (addition) => addition.clientId === assignment.id,
  );
  if (addedAssignment) {
    return {
      ...batch,
      addedAssignments: batch.addedAssignments.map((addition) =>
        addition.clientId === assignment.id
          ? { ...addition, employeeId }
          : addition,
      ),
    };
  }

  const slotClientId = assignment.id.replace(/:assignment$/, "");
  return {
    ...batch,
    addedSlots: batch.addedSlots.map((addition) =>
      addition.clientId === slotClientId
        ? { ...addition, employeeId }
        : addition,
    ),
  };
}

function setAssignmentLock(
  batch: ManualEditBatch,
  assignment: ManualEditDraftAssignment,
  locked: boolean,
) {
  const updated = setAssignmentEmployee(batch, assignment, assignment.employeeId);

  if (assignment.persistedAssignmentId) {
    return {
      ...updated,
      assignmentChanges: updated.assignmentChanges.map((change) =>
        change.assignmentId === assignment.persistedAssignmentId
          ? { ...change, locked }
          : change,
      ),
    };
  }

  const slotClientId = assignment.id.replace(/:assignment$/, "");
  return {
    ...updated,
    addedAssignments: updated.addedAssignments.map((addition) =>
      addition.clientId === assignment.id ? { ...addition, locked } : addition,
    ),
    addedSlots: updated.addedSlots.map((addition) =>
      addition.clientId === slotClientId ? { ...addition, locked } : addition,
    ),
  };
}

function removeAssignment(
  batch: ManualEditBatch,
  assignment: ManualEditDraftAssignment,
) {
  if (assignment.persistedAssignmentId) {
    return {
      ...batch,
      assignmentChanges: [
        ...batch.assignmentChanges.filter(
          (change) => change.assignmentId !== assignment.persistedAssignmentId,
        ),
        {
          assignmentId: assignment.persistedAssignmentId,
          employeeId: null,
          locked: assignment.locked,
          note: assignment.note,
        },
      ],
    };
  }

  const slotClientId = assignment.id.replace(/:assignment$/, "");
  return {
    ...batch,
    addedAssignments: batch.addedAssignments.filter(
      (addition) => addition.clientId !== assignment.id,
    ),
    addedSlots: batch.addedSlots.map((addition) =>
      addition.clientId === slotClientId
        ? { ...addition, employeeId: null }
        : addition,
    ),
  };
}

function buildEmptyCell(input: {
  data: WorkspaceData;
  draft: ReturnType<typeof applyManualEditBatchToState>;
  employeeId: string;
  date: string;
  employeeById: Map<string, WorkspaceData["employees"][number]>;
  taskTypeById: Map<string, WorkspaceData["taskTypes"][number]>;
  shiftBlockById: Map<
    string,
    WorkspaceData["days"][number]["shiftBlocks"][number] & {
      date: string;
      scheduleDayId: string;
    }
  >;
}) {
  const employee = input.employeeById.get(input.employeeId);
  if (!employee) return null;

  const openSlots = input.draft.slots.flatMap((slot) => {
    if (slot.date !== input.date) return [];
    const count = input.draft.assignments.filter(
      (assignment) => assignment.slotId === slot.id,
    ).length;
    if (count >= slot.requiredStaff) return [];

    const taskType = input.taskTypeById.get(slot.taskTypeId);
    const block = input.shiftBlockById.get(slot.shiftBlockId);
    if (!taskType || !block) return [];

    return [{
      id: slot.id,
      roleName: taskType.name,
      shiftName: block.name,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
    }];
  });
  const day = input.data.days.find((item) => item.date === input.date);

  return {
    employeeId: employee.id,
    employeeName: employee.fullName,
    date: input.date,
    openSlots,
    shiftBlocks: day?.shiftBlocks ?? [],
    taskTypes: input.data.taskTypes,
  };
}

function hoursForEmployee(
  assignments: Array<{ employeeId: string; slotId: string }>,
  slots: Array<{ id: string; date: string; shiftBlockId: string }>,
  shiftBlockById: Map<string, { paidHours: number }>,
  employeeId: string,
) {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const shiftKeys = new Map<string, string>();

  for (const assignment of assignments) {
    if (assignment.employeeId !== employeeId) continue;
    const slot = slotById.get(assignment.slotId);
    if (slot) shiftKeys.set(`${slot.date}:${slot.shiftBlockId}`, slot.shiftBlockId);
  }

  return [...shiftKeys.values()].reduce(
    (total, blockId) => total + (shiftBlockById.get(blockId)?.paidHours ?? 0),
    0,
  );
}

function isAssignmentChanged(batch: ManualEditBatch, assignmentId: string) {
  return (
    batch.assignmentChanges.some(
      (change) => change.assignmentId === assignmentId,
    ) ||
    batch.addedAssignments.some(
      (addition) => addition.clientId === assignmentId,
    ) ||
    batch.addedSlots.some(
      (addition) => `${addition.clientId}:assignment` === assignmentId,
    )
  );
}

function weekdayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete this action.";
}
