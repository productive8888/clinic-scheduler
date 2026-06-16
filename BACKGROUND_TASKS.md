# Background Tasks

Background tasks are non-clinic work obligations. They are lower priority than
required clinic coverage, but the final priority order and protected-vs-pullable
policy are not finalized yet.

The current foundation stores:

- category
- task name and description
- generated background `TaskType`
- required count per period or estimated hours per period
- estimated hours per period
- period type: weekly, biweekly, monthly, or custom
- priority
- mentor
- primary owner
- eligible employees
- required skills
- whether the task can be pulled for clinic coverage
- whether the task is protected from clinic pull
- whether rollover is allowed
- active status and notes

Easton's default pull-priority configuration is stored separately as
`BackgroundPullRule` rows. These rows rank employees for pullable background
work and can enforce max-pull caps per scheduling period. If a background task is
not pullable, or is marked protected, the pull-priority helper excludes it.

Managers can generate background task slots for a week or selected date range.
The generator creates canonical weekly, biweekly, monthly, or custom period
instances and links optional `TaskSlot` records back to the instance. Count-based
definitions create that count. Hours-only definitions deterministically convert
hours to slots using the selected shift block paid hours.

Day/week/month/custom-range schedule generation automatically invokes this
background-slot preparation before the shared scheduler runs. Generation
summaries separate clinic slots from background slots, and both appear on the
daily shift-block board and weekly staff grid.

Background-definition slots are preserved when clinic staffing requirements are
reconciled. Existing background instances only count current visible
shift-block slots toward their period obligation; archived legacy full-day
slots do not suppress generation of current background work. The week view
explains when no active definitions exist or when configured definitions have
not yet produced visible slots.

Generated background slots are labeled with `(Background)`, enforce the
definition's required skills and eligible employee list, and sort after
required/desired clinic coverage. Protected background assignments are
preserved during regeneration. Pullable assignments may be displaced when the
same schedule is regenerated because required clinic coverage is filled first.
The bounded repair pass may also yield explicitly pullable background work to a
required patient-facing clinic role before a shortage recommendation is shown.

Easton `Shifts + Hours` background demand is imported as editable,
shift-template-specific staffing requirements. A BG, Front Background, Booking,
Research, or Float count under an AM, PM, or Saturday column creates desired
slots on that exact block. These spreadsheet counts are not collapsed into
whole-day or weekly totals. Previously imported Easton weekly definitions are
archived when the workbook defaults are reapplied.

Easton active target sheet BG values are separate employee-specific weekly
minimums. The importer prefers `NEW NEW Shifts by GY`, then `NEW Shifts by GY`,
then legacy `Shifts by GY`. The active sheet BG value is imported into each
matched `Employee.requiredWeeklyBackgroundShifts` field so managers can edit it
directly from employee profiles. The same value is also preserved in
`EmployeeScheduleTarget` as the import snapshot. Current generation, scoring,
and publish validation use the employee profile field as the live source of
truth. These BG values are hard weekly role-mix requirements, not just
under-hour filler.

After required clinic and configured background slots are generated, week/range
generation first repairs hard July work-pattern requirements. That repair may
create optional `GENERATED_WORK_PATTERN_TOP_OFF` Background slots on the exact
5-hour shift needed for a missing group extra-hour day. These are not ordinary
BG minimum slots; they exist so the scheduler can expose and satisfy the
configured 40-hour group math.
The exception is Endoscopy Saturday: an employee whose July group or imported
target requires Saturday Endoscopy must be placed in the real
6:00 AM-2:00 PM Endoscopy block. Generated background cannot satisfy that
requirement while Endoscopy coverage remains unresolved.

After work-pattern repair, generation runs the deterministic BG/hour top-off
pass. Any background-class role counts toward an employee's required BG minimum,
including BG, Front Background, Booking, Research, Float, and generated
Background slots. The pass fills existing open background-class slots first,
then creates optional `GENERATED_BACKGROUND_TOP_OFF` Background slots as needed
to meet employee BG/background minimums and move employees toward expected
weekly hours without overfilling them. Role-mix BG minimums are reserved and
validated before arbitrary clinic over-assignment, so a person with a high BG
minimum should not be filled with random clinic roles until their required BG
mix becomes impossible. The pass can only use shift blocks in the
employee's July work skeleton, so Group Saturday/Endoscopy employees cannot be
topped off with weekday 7:00 AM starts or Monday 6:00 PM endings. The pass
also repairs employees who are already at 40 hours but below their BG minimum
by converting flexible generated non-required work into BG on the same shift
block. This keeps paid hours unchanged, protects required clinic coverage, and
does not touch locked/manual assignments. It respects skills, derived/saved
availability, PTO/NPTO, no overlap, published-date skipping, work-pattern
rules, and locked/manual overrides. It does not hide an unmet group extra-hour
requirement. If the minimum is infeasible, the week view reports the unmet
employee requirement and the specific blockers, and a manager must record an
override reason before publishing.

Period-based `BackgroundTaskDefinition` records remain available for obligations
that truly recur weekly, biweekly, monthly, or over a custom window. The June
workbook sheets are ignored by active generation rather than permanent
assignments or duplicate demand.

The full rollover optimizer and final clinic background-priority policy remain
deferred until clinic policy is finalized.
