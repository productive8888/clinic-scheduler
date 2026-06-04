# Scheduler Rules

The pure scheduling engine is isolated in `src/lib/scheduler`. React components
and server actions prepare data, call the engine, and persist results; they do
not contain scheduling decisions.

## Current V1 Rules

- Deterministic generation uses a caller-provided seed and stable tie-breakers.
- Required skills are enforced before scoring.
- IT, Research, and PA / Prior Authorization task requirements are enforced like
  every other task skill. PA / Prior Authorization is distinct from Physician
  Assistant / MD.
- Weekly availability is enforced by each employee's configured normal working
  weekdays and minute ranges. The scheduler has no Monday-Friday assumption.
- Approved and overridden PTO/unavailability blocks assignments.
- Reversed, cancelled, rejected, and pending PTO requests do not block
  assignments.
- Approved and overridden NPTO blocks assignments through the same scheduler
  unavailability input, but NPTO is stored separately and never deducts PTO
  balance.
- Personal and vacation requests require manager approval before blocking
  scheduling; sick and emergency requests auto-approve and immediately block
  assignments on affected dates.
- Personal and vacation approvals deduct PTO balance and are denied when they
  would put the balance below -24 hours.
- NPTO requests are manager-reviewed no-pay time off. The default cap is 240
  hours and managers can configure it. Requests that exceed the cap are denied
  with a visible denial reason unless an admin override is used.
- PTO submitted within 7 days of any affected date is marked short notice.
- NPTO submitted within 7 days of any affected date is marked short notice.
- PTO approval, override, and approval reversal regenerate existing affected
  schedule days and return them to generated draft review.
- NPTO approval, override, and approval reversal regenerate existing affected
  schedule days and return them to generated draft review.
- Employees can receive multiple assignments on the same date when the dated
  shift intervals do not overlap. `0800-1200` plus `1300-1700` is valid;
  `0700-1200` plus `0800-1200` is rejected. Weekly assignment limits continue
  to count actual assignments.
- Weekly assignment limits are honored when configured.
- Required slots are filled before desired, conditional, and optional slots.
  Within the same requirement level, patient-facing clinic roles are filled
  before other clinical work, Float, and background work. Skilled and difficult
  clinic slots are then filled before easier general slots.
- If greedy selection leaves a required patient-facing clinic slot unfilled,
  the engine performs a deterministic bounded repair pass. It first tries a
  direct assignment swap, then allows lower-priority Float or explicitly
  pullable background work to yield to clinic coverage. Manager-facing shortage
  recommendations are attached only after these attempts fail.
- Manual locked assignments are preserved during regeneration.
- Protected background assignments are preloaded with locked/manual assignments
  before clinic slot selection, so generation cannot silently pull them.
- Locked assignments that conflict with approved PTO are preserved but surfaced
  as shortage/conflict slots until a manager resolves them.
- Generated task slots are attached to concrete shift blocks. Employees are
  only eligible when their configured recurring availability fully covers the
  slot's shift start/end time, including Saturday shifts when configured.
- Fairness scoring favors underused employees and reduces repeated difficult
  task assignments.
- Configurable `SchedulingRule` rows can prefer, avoid, boost, penalize, or
  mark employees as backup-only for task selection.
- Supported manager-facing rule types are `PREFER_EMPLOYEE_FOR_TASK`,
  `AVOID_EMPLOYEE_FOR_TASK`, `PRIORITY_BOOST`, `PRIORITY_PENALTY`, and
  `BACKUP_ONLY`.
- Clinic scenarios and staffing requirement rules are applied before generation
  by choosing the dated task slots the pure scheduler receives. `Clinic Closed`
  creates no default task slots. Optional tasks are manual-only unless a staffing
  requirement rule explicitly creates them.
- Multi-person staffing uses one `TaskType` and multiple `TaskSlot` records,
  such as `Allergy Shots #1` and `Allergy Shots #2`.
- Active `StaffingRequirementRule` rows can vary slot counts by task type,
  shift template, shift category, weekday, clinic scenario, and effective date
  range. More specific rules win deterministically over broad rules.
- Safe default staffing slots are created only on shift blocks marked as the
  schedule default. Managers can create additional AM/PM/Saturday/Endoscopy
  slots by configuring staffing rules against shift templates or categories.
- Default seeded shift templates use Easton's spreadsheet times:
  weekday early AM 7:00 AM-12:00 PM where configured, weekday regular AM
  8:00 AM-12:00 PM, Monday long PM 1:00 PM-6:00 PM where configured,
  weekday regular PM 1:00 PM-5:00 PM, Saturday long/endoscopy
  6:00 AM-2:00 PM, and Saturday shorter 8:00 AM-2:00 PM.
- The private Easton workbook can be parsed from `private/easton-scheduling.xlsx`
  or `private/Copy of Easton Scheduling.xlsx` through the admin Easton import
  page. Parsed shifts, role demand, employee targets, and June sample assignment
  patterns are reviewed before applying editable database rules.
- For deployed databases, run `npm run review:easton` and then
  `npm run apply:easton` locally against the target `DATABASE_URL`; the workbook
  remains private and is not required on Vercel.
- Fairness history is evaluated inside the configured fairness window. The
  scoring layer can balance clinical shift counts, total shifts, scheduled
  paid hours, Saturday shifts, and endoscopy shifts separately.
- Easton fairness defaults add soft scoring for week-to-week consistency,
  patient-facing shift counts, per-role/skill targets, and GI/Allergy/PCP
  exposure goals. These goals never bypass skills, PTO/NPTO, availability, or
  no-double-booking constraints.
- Shortage rules store visible manager recommendations for unfilled coverage.
  Easton's seeded order is Float, non-essential Background, Booking, Front
  Background, IT/close shots, 4th allergy/round-robin adjustment, then Civil.
  The order is editable and is surfaced as notes; the scheduler does not
  silently delete patient-facing roles.
- Background task definitions are lower-priority non-clinic obligations.
  Pullability, protected-from-pull state, estimated hours, eligibility, and
  period type are stored. Employee-specific pull-priority rules are configurable
  and respect max-pull caps.
- Active background definitions can generate optional, period-linked task slots
  for weekly, biweekly, monthly, or custom windows. Required count takes
  precedence over hours-based slot sizing. Definition-level required skills and
  eligible employees are hard constraints.
- Bulk generation processes dates in stable ascending order, prepares shift and
  background slots, preserves locked/manual overrides, and skips published dates
  unless a manager explicitly confirms overwrite. Earlier generated days become
  deterministic fairness history for later days in the range.
- Manual assignment validation previews skill, PTO/NPTO, availability, overlap,
  weekly assignment limit, expected-hours, fairness, configured pattern
  deviation, and required-slot warnings. A manager can proceed with a recorded
  override reason.
- Employee deactivation/deletion removes future active assignments, marks
  affected required slots as shortages, unpublishes affected dates, and marks
  each date `NEEDS_REGENERATION`. Past assignment history is preserved.
- Manual task-slot additions, scenario changes, and manual assignment overrides
  made within 7 days of the affected shift are marked short notice in audit and
  schedule views.
- Staffing analytics are derived from schedule days, task slots, assignments,
  PTO requests, task metadata, and audit records; they do not alter scheduling
  decisions.
- Calendar exports are publish-gated: ICS feeds include active assignments from
  published schedule days only.
- Payroll reports do not change scheduling decisions. They read schedule,
  shift paid hours, PTO/NPTO, holiday, and payroll ledger records after
  scheduling has happened and surface warnings for missing/unpublished schedule
  data or unresolved staffing issues.
- PTO approvals that deduct balance create payroll ledger debit entries.
  Reversal/cancellation workflows restore balance when appropriate and create
  reversal ledger entries rather than deleting history.
- Approved or overridden NPTO creates unpaid deduction ledger entries and never
  reduces PTO balance. NPTO reversal creates a reversal ledger entry and removes
  the deduction from current report totals.
- Expected hours are configurable per employee. The default is 40 hours per
  week, which yields an 80-hour biweekly target.
- Comp-time banking and under-expected-hour debit behavior are configurable
  payroll reporting policies, not scheduler constraints. Easton's default
  endoscopy extra-hour policy banks PTO credit and does not suggest shortened
  future shifts unless a manager changes the setting.

## Initial Task Types

- New Allergy
- Virtual Allergy
- New GI
- Virtual GI
- Followup
- Front Desk
- Civil Surgeon
- Allergy Shots
- Endoscopy
- Clinical A
- Clinical B
- IT
- Procedure
- Physician Assistant / MD

Optional/background task types:

- Research
- Background
- Booking
- Float
- Extra
- PA / Prior Authorization

Seed data creates interchangeable groups for Allergy and GI virtual/in-person
pairs, required skills for Civil Surgeon, Allergy Shots, Procedure, IT,
Research, and Prior Authorization, and a
mix of Monday-Friday and Tuesday-Saturday employee schedules.
