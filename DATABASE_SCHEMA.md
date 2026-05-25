# Database Schema

The canonical schema lives in `prisma/schema.prisma` and is backed by the
versioned migrations in `prisma/migrations`.

## Core Tables

- `Employee`: staff profile, Auth.js user link, role, status, PTO balance,
  weekly assignment limit, start/end dates. Employee role/status remains the
  source of truth for authorization.
- `User`, `Account`, `Session`, and `VerificationToken`: Auth.js-owned
  authentication tables for magic-link users, persistent sessions, and email
  verification tokens.
- `Skill` and `EmployeeSkill`: normalized boolean skill checklist.
- `TaskType`: configurable clinic task catalog with skill requirements,
  difficulty, sort order, scenario-default flags, optional/manual-only flags,
  and interchangeable task group keys.
- `TaskSkillRequirement`: required skill mapping per task type.
- `WeeklyAvailability`: recurring employee normal working schedule by weekday,
  start/end minute, effective date range, and active state. Days without an
  active row are treated as normally unavailable.
- `PTORequest`: PTO, absence, unavailability, and schedule-change requests.
  Personal/vacation requests require approval and can deduct PTO balance.
  Sick/emergency requests auto-approve. Approved requests are consumed by the
  scheduler as employee unavailability. Reversed/cancelled/rejected requests do
  not block scheduling; overridden requests do. Requests submitted within 7 days
  of an affected date are marked short notice.
- `NPTORequest`: no-pay time off requests stored separately from PTO for future
  payroll support. Approved or overridden NPTO blocks scheduling but never
  reduces PTO balance. Each row stores requested/unpaid hours, cap snapshot,
  used-hours snapshot, denial reason, review metadata, short-notice flag, and a
  future `payrollProcessedAt` marker.
- `TimeOffSettings`: singleton time-off configuration, including the
  manager-configurable NPTO cap. The default NPTO cap is 240 hours.
- `ScheduleDay`: one operational staffing day, including draft/generated/
  published status, clinic scenario, and publish metadata.
- `TaskSlot`: concrete task opening on a schedule day, including `slotIndex`,
  requirement level (`REQUIRED`, `DESIRED`, `OPTIONAL`, or `CONDITIONAL`), and
  source (`DEFAULT`, `STAFFING_RULE`, or `MANUAL`).
- `StaffingRequirementRule`: admin-configured multi-slot requirements by task
  type, weekday, scenario, effective date range, min/desired/max slots,
  requirement level, active state, and notes.
- `Assignment`: employee assigned to a task slot, including generated/manual
  source, lock state, short-notice override flag, and removal history.
- `SchedulingRule`: database-driven preference, priority, avoidance, penalty,
  backup-only, effective-date, and note-backed rules used by the scheduler
  scoring layer.
- `ScheduleGenerationRun`: seed, engine version, input hash, status, and summary
  for reproducible generations.
- `AuditLog`: before/after records for important user and system actions.
- `ExportLog`: queued/completed export attempts for ICS calendar downloads and
  future Google Calendar, Google Sheets, and printable exports.

## Important Modeling Rule

The system intentionally separates:

- Task Type: reusable task definition, such as `Front Desk`.
- Task Slot: dated opening, such as `Front Desk #1 on 2026-06-05`.
- Assignment: employee selected for that slot.

Multi-person staffing is modeled by multiple `TaskSlot` records for the same
`TaskType`, never by creating duplicate task types such as `Allergy Shots 1`.

## Clinic Scenarios

Schedule days support `Routine`, `Clinic Closed`, `Doctor Off / Reduced
Staffing`, and `Custom Scenario`. Clinic-closed days create no default task
slots. Routine and reduced-staffing days start from safe defaults unless active
staffing requirement rules override them. Optional task types such as Research,
Background, Booking, Float, and Extra appear only when manually added or
configured by a staffing requirement rule.

## Analytics

The admin staffing analytics dashboard is derived from canonical schedule, PTO,
assignment, task, and audit records. No cached reporting tables are used in V1,
which keeps analytics consistent with the current schedule state.
