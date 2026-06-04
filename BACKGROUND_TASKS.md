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

Period-based `BackgroundTaskDefinition` records remain available for obligations
that truly recur weekly, biweekly, monthly, or over a custom window. The June
workbook sheets remain reference patterns rather than permanent assignments or
duplicate demand.

The full rollover optimizer and final clinic background-priority policy remain
deferred until clinic policy is finalized.
