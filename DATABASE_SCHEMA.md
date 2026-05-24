# Database Schema

The canonical schema lives in `prisma/schema.prisma` and is backed by the
initial migration in `prisma/migrations/202605240001_initial/migration.sql`.

## Core Tables

- `Employee`: staff profile, Clerk auth link, role, status, PTO balance, weekly
  assignment limit, start/end dates.
- `Skill` and `EmployeeSkill`: normalized boolean skill checklist.
- `TaskType`: configurable clinic task catalog with skill requirements,
  difficulty, sort order, scenario-default flags, optional/manual-only flags,
  and interchangeable task group keys.
- `TaskSkillRequirement`: required skill mapping per task type.
- `WeeklyAvailability`: recurring employee availability by weekday and minute
  range.
- `PTORequest`: PTO, absence, unavailability, and schedule-change requests.
  Personal/vacation requests require approval and can deduct PTO balance.
  Sick/emergency requests auto-approve. Approved requests are consumed by the
  scheduler as employee unavailability.
- `ScheduleDay`: one operational staffing day, including draft/generated/
  published status, clinic scenario, and publish metadata.
- `TaskSlot`: concrete task opening on a schedule day.
- `Assignment`: employee assigned to a task slot, including generated/manual
  source, lock state, and removal history.
- `SchedulingRule`: database-driven preference, priority, avoidance, penalty,
  backup-only, effective-date, and note-backed rules used by the scheduler
  scoring layer.
- `ScheduleGenerationRun`: seed, engine version, input hash, status, and summary
  for reproducible generations.
- `AuditLog`: before/after records for important user and system actions.
- `ExportLog`: queued/completed export attempts for future Google Calendar,
  Google Sheets, and printable exports.

## Important Modeling Rule

The system intentionally separates:

- Task Type: reusable task definition, such as `Front Desk`.
- Task Slot: dated opening, such as `Front Desk #1 on 2026-06-05`.
- Assignment: employee selected for that slot.

## Clinic Scenarios

Schedule days support `Routine`, `Clinic Closed`, `Doctor Off / Reduced
Staffing`, and `Custom Scenario`. Clinic-closed and custom days create no
default task slots. Reduced-staffing days use the task type defaults marked for
reduced staffing. Optional task types such as Research, Background, Booking,
Float, and Extra are manual-only and do not appear by default.
