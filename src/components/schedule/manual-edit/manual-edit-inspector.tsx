"use client";

import {
  ArrowLeftRight,
  Lock,
  Plus,
  Trash2,
  Unlock,
  UserRoundSearch,
} from "lucide-react";
import { useState } from "react";
import type {
  ManualEditCandidate,
  ManualEditDiagnostic,
} from "@/lib/schedule/manual-edit-types";
import { formatCompactMinuteRange } from "@/lib/utils/time";

type InspectorAssignment = {
  id: string;
  persistedAssignmentId: string | null;
  slotId: string;
  employeeId: string;
  employeeName: string;
  locked: boolean;
  roleName: string;
  date: string;
  startMinute: number;
  endMinute: number;
};

type InspectorEmptyCell = {
  employeeId: string;
  employeeName: string;
  date: string;
  openSlots: Array<{
    id: string;
    roleName: string;
    shiftName: string;
    startMinute: number;
    endMinute: number;
  }>;
  shiftBlocks: Array<{
    id: string;
    name: string;
    startMinute: number;
    endMinute: number;
  }>;
  taskTypes: Array<{
    id: string;
    name: string;
    optional: boolean;
  }>;
};

type ManualEditInspectorProps = {
  assignment: InspectorAssignment | null;
  emptyCell: InspectorEmptyCell | null;
  candidates: ManualEditCandidate[] | null;
  candidateLoading: boolean;
  diagnostics: ManualEditDiagnostic[];
  swapSourceId: string | null;
  onChooseCandidate: (employeeId: string) => void;
  onLoadCandidates: () => void;
  onRemove: () => void;
  onToggleLock: () => void;
  onStartSwap: () => void;
  onCancelSwap: () => void;
  onAddAssignment: (slotId: string) => void;
  onAddManualSlot: (shiftBlockId: string, taskTypeId: string) => void;
};

export function ManualEditInspector({
  assignment,
  emptyCell,
  candidates,
  candidateLoading,
  diagnostics,
  swapSourceId,
  onChooseCandidate,
  onLoadCandidates,
  onRemove,
  onToggleLock,
  onStartSwap,
  onCancelSwap,
  onAddAssignment,
  onAddManualSlot,
}: ManualEditInspectorProps) {
  if (assignment) {
    return (
      <AssignmentInspector
        assignment={assignment}
        candidates={candidates}
        candidateLoading={candidateLoading}
        diagnostics={diagnostics}
        swapSourceId={swapSourceId}
        onChooseCandidate={onChooseCandidate}
        onLoadCandidates={onLoadCandidates}
        onRemove={onRemove}
        onToggleLock={onToggleLock}
        onStartSwap={onStartSwap}
        onCancelSwap={onCancelSwap}
      />
    );
  }

  if (emptyCell) {
    return (
      <EmptyCellInspector
        emptyCell={emptyCell}
        onAddAssignment={onAddAssignment}
        onAddManualSlot={onAddManualSlot}
      />
    );
  }

  return (
    <aside className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-950">Edit inspector</h2>
      </div>
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div className="max-w-64">
          <UserRoundSearch
            size={28}
            className="mx-auto text-slate-400"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-semibold text-slate-800">
            Select an assignment or cell
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Change a person, swap assignments, add coverage, or create an optional
            manual role.
          </p>
        </div>
      </div>
    </aside>
  );
}

function AssignmentInspector({
  assignment,
  candidates,
  candidateLoading,
  diagnostics,
  swapSourceId,
  onChooseCandidate,
  onLoadCandidates,
  onRemove,
  onToggleLock,
  onStartSwap,
  onCancelSwap,
}: Omit<ManualEditInspectorProps, "assignment" | "emptyCell" | "onAddAssignment" | "onAddManualSlot"> & {
  assignment: InspectorAssignment;
}) {
  const isSwapSource = swapSourceId === assignment.id;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="font-mono text-xs font-semibold text-emerald-700">
          {assignment.date} ·{" "}
          {formatCompactMinuteRange(
            assignment.startMinute,
            assignment.endMinute,
          )}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">
          {assignment.roleName}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{assignment.employeeName}</p>
      </div>

      {isSwapSource ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          Select another assignment in the grid to preview the swap.
          <button
            type="button"
            onClick={onCancelSwap}
            className="ml-2 font-semibold underline"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 border-b border-slate-200 p-4">
        <button
          type="button"
          onClick={onStartSwap}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <ArrowLeftRight size={15} aria-hidden="true" />
          Swap
        </button>
        <button
          type="button"
          onClick={onToggleLock}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          {assignment.locked ? (
            <Unlock size={15} aria-hidden="true" />
          ) : (
            <Lock size={15} aria-hidden="true" />
          )}
          {assignment.locked ? "Unlock" : "Lock"}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50"
        >
          <Trash2 size={15} aria-hidden="true" />
          Remove
        </button>
      </div>

      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">Change person</h3>
          <button
            type="button"
            onClick={onLoadCandidates}
            disabled={candidateLoading || !assignment.persistedAssignmentId}
            className="text-xs font-semibold text-emerald-700 hover:underline disabled:text-slate-400"
          >
            {candidateLoading ? "Ranking…" : "Rank candidates"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {candidates ? (
          <div className="divide-y divide-slate-100">
            {candidates.map((candidate) => (
              <button
                type="button"
                key={candidate.employeeId}
                onClick={() => onChooseCandidate(candidate.employeeId)}
                className="grid w-full gap-1 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">
                    {candidate.employeeName}
                  </span>
                  <span className={candidateTone(candidate.severity)}>
                    {candidate.severity.replaceAll("_", " ")}
                  </span>
                </span>
                <span className="font-mono text-xs text-slate-500">
                  {candidate.projectedHours.toFixed(2)}/
                  {candidate.targetHours.toFixed(2)}h
                </span>
                {candidate.warningCodes.length > 0 ? (
                  <span className="truncate text-[11px] text-slate-500">
                    {candidate.warningCodes.join(" · ")}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-500">
            Rank candidates to see availability, PTO/NPTO, skill, overlap, hours,
            BG, and work-pattern impact.
          </div>
        )}
      </div>

      {diagnostics.length > 0 ? (
        <div className="max-h-40 overflow-y-auto border-t border-slate-200 bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase text-slate-600">
            Warnings
          </h3>
          <div className="mt-2 grid gap-2">
            {diagnostics.map((diagnostic) => (
              <p
                key={`${diagnostic.code}:${diagnostic.message}`}
                className="text-xs leading-relaxed text-slate-700"
              >
                <strong>{diagnostic.code.replaceAll("_", " ")}:</strong>{" "}
                {diagnostic.message}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function EmptyCellInspector({
  emptyCell,
  onAddAssignment,
  onAddManualSlot,
}: {
  emptyCell: InspectorEmptyCell;
  onAddAssignment: (slotId: string) => void;
  onAddManualSlot: (shiftBlockId: string, taskTypeId: string) => void;
}) {
  const [shiftBlockId, setShiftBlockId] = useState(
    emptyCell.shiftBlocks[0]?.id ?? "",
  );
  const [taskTypeId, setTaskTypeId] = useState(
    emptyCell.taskTypes.find((taskType) => taskType.optional)?.id ??
      emptyCell.taskTypes[0]?.id ??
      "",
  );

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="font-mono text-xs font-semibold text-emerald-700">
          {emptyCell.date}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">
          Add work for {emptyCell.employeeName}
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-slate-950">Open slots</h3>
        <div className="mt-3 grid gap-2">
          {emptyCell.openSlots.length > 0 ? (
            emptyCell.openSlots.map((slot) => (
              <button
                type="button"
                key={slot.id}
                onClick={() => onAddAssignment(slot.id)}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-3 text-left hover:border-emerald-300 hover:bg-emerald-50"
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-950">
                    {slot.roleName}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-slate-500">
                    {formatCompactMinuteRange(slot.startMinute, slot.endMinute)} ·{" "}
                    {slot.shiftName}
                  </span>
                </span>
                <Plus size={16} className="text-emerald-700" aria-hidden="true" />
              </button>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No currently open configured slots for this date.
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-950">
            Add optional/manual slot
          </h3>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Shift
              <select
                value={shiftBlockId}
                onChange={(event) => setShiftBlockId(event.target.value)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                {emptyCell.shiftBlocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.name} ·{" "}
                    {formatCompactMinuteRange(block.startMinute, block.endMinute)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Role
              <select
                value={taskTypeId}
                onChange={(event) => setTaskTypeId(event.target.value)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal"
              >
                {emptyCell.taskTypes.map((taskType) => (
                  <option key={taskType.id} value={taskType.id}>
                    {taskType.name}
                    {taskType.optional ? " · optional" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!shiftBlockId || !taskTypeId}
              onClick={() => onAddManualSlot(shiftBlockId, taskTypeId)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Plus size={16} aria-hidden="true" />
              Add slot and assign
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function candidateTone(severity: ManualEditCandidate["severity"]) {
  switch (severity) {
    case "SAFE":
      return "rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700";
    case "WARNING":
      return "rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700";
    case "OVERRIDE_REQUIRED":
      return "rounded-md bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700";
    default:
      return "rounded-md bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700";
  }
}
