# Database Schema

The canonical schema lives in `prisma/schema.prisma` and is backed by the
initial migration in `prisma/migrations/202605240001_initial/migration.sql`.

## Core Tables

- `Employee`: staff profile, Clerk auth link, role, status, PTO balance, weekly
  assignment limit, start/end dates.
- `Skill` and `EmployeeSkill`: normalized boolean skill checklist.
- `TaskType`: configurable clinic task catalog with skill requirements,
  difficulty, sort order, and interchangeable task group keys.
- `TaskSkillRequirement`: required skill mapping per task type.
- `WeeklyAvailability`: recurring employee availability by weekday and minute
  range.
- `PTORequest`: PTO, absence, unavailability, and schedule-change requests.
- `ScheduleDay`: one operational staffing day, including draft/generated/
  published status and publish metadata.
- `TaskSlot`: concrete task opening on a schedule day.
- `Assignment`: employee assigned to a task slot, including generated/manual
  source, lock state, and removal history.
- `SchedulingRule`: database-driven preference, priority, avoidance, and target
  rules used by the scheduler scoring layer.
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
