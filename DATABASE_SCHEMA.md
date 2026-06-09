# Database Schema

The canonical schema lives in `prisma/schema.prisma` and is backed by the
versioned migrations in `prisma/migrations`.

## Core Tables

- `Employee`: staff profile, Auth.js user link, role, status, PTO balance,
  expected weekly hours, required weekly BG/background shift minimum,
  comp-time balance display field, weekly assignment limit, work pattern,
  start/end dates. Employee role/status remains the source of truth for
  authorization, and `requiredWeeklyBackgroundShifts` is the live source of
  truth for weekly BG/background minimums.
- `User`, `Account`, `Session`, and `VerificationToken`: Auth.js-owned
  authentication tables for magic-link users, persistent sessions, and email
  verification tokens.
- `Skill` and `EmployeeSkill`: normalized boolean skill checklist.
- Seeded configurable skills include IT, Research, and `PA / Prior
  Authorization`. Prior Authorization is intentionally distinct from the
  `Physician Assistant / MD` task type.
- `TaskType`: configurable clinic task catalog with skill requirements,
  difficulty, sort order, scenario-default flags, optional/manual-only flags,
  patient-facing/clinical/background/skilled/endoscopy/float/closure-candidate
  classification flags, and interchangeable task group keys.
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
- `PayrollSettings`: singleton payroll-reporting configuration for default
  period length, full-time weekly hours, default holiday hours, under-hour
  flagging, optional comp-time banking/debit behavior, and configurable
  endoscopy extra-hour banking behavior.
- `PaidHoliday`: manager-configured holiday calendar rows with date, name,
  hours, pay rule, active state, notes, and creator metadata.
- `PayrollAdjustmentLedger`: append-only payroll accounting ledger for PTO
  debits/credits, NPTO unpaid deductions, paid holiday credits, comp-time
  credits/debits, manual adjustments, and reversal adjustments. Entries keep
  employee, hours, source entity, optional period range, creator, metadata, and
  notes.
- `ScheduleDay`: one operational staffing day, including draft, generated,
  needs-regeneration, published, or locked status, clinic scenario, and publish
  metadata. Employee deactivation/deletion marks affected future dates
  `NEEDS_REGENERATION` and clears publish metadata without deleting history.
- `ShiftTemplate`: editable manager-configured reusable shift definitions with
  weekday scope, start/end minute, paid hours, shift category, default schedule
  flag, active status, and effective dates. Active July Easton templates
  imported from `Shifts + Hours` are all marked `defaultForSchedule` so every
  spreadsheet shift column is generated as a schedulable block; exact task
  demand remains controlled by `StaffingRequirementRule`.
- `ShiftBlock`: concrete dated shift snapshot for a `ScheduleDay`. Task slots
  attach to shift blocks, preserving historical schedules when future shift
  templates are edited. The migration-only legacy full-day block remains
  available for historical compatibility but is excluded from normal manager
  preparation and review.
- `TaskSlot`: concrete task opening on a schedule day, including `slotIndex`,
  `shiftBlockId`, requirement level (`REQUIRED`, `DESIRED`, `OPTIONAL`, or
  `CONDITIONAL`), source (`DEFAULT`, `STAFFING_RULE`, `MANUAL`, or
  `BACKGROUND_DEFINITION`). Generated weekly top-off filler uses
  `GENERATED_BACKGROUND_TOP_OFF` as its slot source, while hard July
  work-pattern repair uses `GENERATED_WORK_PATTERN_TOP_OFF` for optional slots
  created on exact required 5-hour group shifts. Task slots can optionally link
  to the generated background task instance that created them.
- `StaffingRequirementRule`: admin-configured multi-slot requirements by task
  type, shift template or shift category, weekday, scenario, effective date
  range, min/desired/max slots, requirement level, active state, and notes.
  Easton `Shifts + Hours` clinic and background counts are applied through these
  rows against their exact AM, PM, or Saturday shift template.
- `FairnessSetting`: singleton scheduler scoring configuration for fairness
  window, clinical/total/hour/Saturday/endoscopy weights, Easton pattern
  consistency, patient-facing, skill/role target, exposure-goal, and background
  deferral weights.
- `ShortageRule`: manager-facing shortage/cut recommendation storage by task
  type, shift template/category, scenario, priority, effective dates, and
  instruction text. These rules provide visible guidance and store Easton's
  editable closure/pull order without silently dropping clinic roles.
- `WorkPattern`: editable employee work-pattern templates, including exact
  July Easton groups, target weekly hours, required Saturday shift category,
  Saturday paid hours, and configured extra-hour weekdays. Generation validates
  the exact group weekdays, including Monday's early-or-late 5-hour equivalence,
  before ordinary BG/hour top-off is allowed to fill remaining gaps.
- `SchedulePattern` and `SchedulePatternSlot`: editable/reference weekly
  schedule pattern storage. The active July Easton import uses
  `SchedulePattern` only as an employee-target container and does not create
  slots from June sample assignments.
- `EmployeeScheduleTarget`: spreadsheet-derived target counts by employee name
  or employee link, including patient-shift targets, per-role counts, imported
  BG minimum snapshots, imported work-pattern code, extra-hour weekdays,
  exposure goals, and 40-hour weekly targets. These rows remain historical and
  auditable; current generation and publish validation read the editable
  employee profile field for required weekly BG/background shifts.
- `BackgroundPullRule`: employee-specific pull order and max-pull caps for
  pullable, non-protected background work.
- `BackgroundTaskCategory`, `BackgroundTaskDefinition`, and
  `BackgroundTaskInstance`: foundation for non-clinic work obligations,
  required count or estimated hours per period, generated task type, period
  type, priority, mentor/owner, eligibility, required skills, pullability for
  clinic coverage, protected-from-pull state, due window, and generated period
  instances.
- `EastonImportReview`: private workbook parse/apply review snapshots with
  counts and warnings. Private spreadsheet contents remain out of public docs
  and source control.
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
With shift blocks, the same `TaskType` can appear more than once on the same
date by attaching each `TaskSlot` to a different `ShiftBlock`.

## Clinic Scenarios

Schedule days support `Routine`, `Clinic Closed`, `Doctor Off / Reduced
Staffing`, and `Custom Scenario`. Clinic-closed days create no default task
slots. Routine and reduced-staffing days start from safe defaults unless active
staffing requirement rules override them. Optional task types such as Research,
Background, Booking, Float, and Extra appear only when manually added or
configured by a staffing requirement rule or generated from an active
background task definition.

## Analytics

The admin staffing analytics dashboard is derived from canonical schedule, PTO,
assignment, task, and audit records. No cached reporting tables are used in V1,
which keeps analytics consistent with the current schedule state.

## Payroll Reporting

Payroll reports are manager-reviewable estimates generated from current
database records. The app does not process payroll or submit data to a payroll
vendor. Reports combine published/draft schedule assignments, shift-block paid
hours, approved PTO, approved NPTO, paid holidays, configurable expected weekly hours, comp-time
settings, and ledger adjustments. The report flags missing schedule data,
unpublished schedules, unresolved shortages, manual overrides, negative PTO
balances, PTO below -24 hours, and reversed/cancelled time off in the selected
period.

The ledger is append-only. PTO/NPTO reversals create reversal entries instead of
deleting original accounting events.
