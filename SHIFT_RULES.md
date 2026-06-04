# Shift Rules

Shift times are configurable. Easton's spreadsheet is the source of truth for
the current defaults:

- Weekday early AM where configured: 7:00 AM-12:00 PM
- Weekday regular AM: 8:00 AM-12:00 PM
- Monday long PM where configured: 1:00 PM-6:00 PM
- Weekday regular PM: 1:00 PM-5:00 PM
- Saturday long/endoscopy: 6:00 AM-2:00 PM
- Saturday shorter: 8:00 AM-2:00 PM

`ShiftTemplate` rows are reusable manager-managed definitions. Easton's seeded
templates are weekday-specific because the workbook has different shift columns
by day. A blank weekday is still supported for future broad templates.

`ShiftBlock` rows are dated snapshots attached to `ScheduleDay`. Task slots
belong to shift blocks, which lets the same task type appear in multiple shifts
on the same date without duplicate task types.

The manager whole-day view displays every shift block for one date. The week
view summarizes Monday-Saturday and links back to each whole-day board. Bulk
generation prepares all applicable shift blocks and staffing-rule slots before
running the same deterministic daily scheduler in ascending date order.

Automatic generation continues to limit employees to one generated assignment
per day. Managers can use the multi-shift helper for non-overlapping AM/PM
assignments; true overlaps and other rule violations require an explicit
override reason.

Safe defaults create routine task slots only on shift blocks marked
`defaultForSchedule`. Easton spreadsheet defaults are instead applied primarily
through editable staffing requirement rules by shift template, weekday, and role
demand count.

The app does not hardcode final clinic policy in scheduler branches. Easton
defaults seed editable rules for week-to-week patterns, shortage order, Saturday
work patterns, and endoscopy PTO banking.
