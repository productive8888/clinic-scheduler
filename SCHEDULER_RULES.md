# Scheduler Rules

The pure scheduling engine is isolated in `src/lib/scheduler`. React components
and server actions prepare data, call the engine, and persist results; they do
not contain scheduling decisions.

## Current V1 Rules

- Deterministic generation uses a caller-provided seed and stable tie-breakers.
- Required skills are enforced before scoring.
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
- Employees cannot receive more than one generated assignment on the same date.
  Managers can still explicitly create multiple locked manual overrides when
  clinic operations require it.
- Weekly assignment limits are honored when configured.
- Required slots are filled before desired, conditional, and optional slots.
  Within the same requirement level, skilled and difficult slots are filled
  before easier general slots.
- Manual locked assignments are preserved during regeneration.
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
- Default seeded shift templates use spreadsheet times:
  AM early 7:00 AM-11:30 AM, AM regular 8:00 AM-12:00 PM, PM early/long
  12:30 PM-5:00 PM, PM regular 1:00 PM-5:00 PM, Saturday long/endoscopy
  6:00 AM-2:00 PM, and Saturday shorter 8:00 AM-2:00 PM.
- Fairness history is evaluated inside the configured fairness window. The
  scoring layer can balance clinical shift counts, total shifts, scheduled
  paid hours, Saturday shifts, and endoscopy shifts separately.
- Shortage rules store visible manager recommendations for unfilled coverage.
  They do not hardcode final clinic closure order.
- Background task definitions are lower-priority non-clinic obligations.
  Pullability, estimated hours, eligibility, and period type are stored for
  future optimization, but final background priority logic is not implemented.
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
  payroll reporting policies, not scheduler constraints.

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

Optional manual-only task types:

- Research
- Background
- Booking
- Float
- Extra

Seed data creates interchangeable groups for Allergy and GI virtual/in-person
pairs, required skills for Civil Surgeon, Allergy Shots, and Procedure, and a
mix of Monday-Friday and Tuesday-Saturday employee schedules.
