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

Safe defaults create routine task slots only on shift blocks marked
`defaultForSchedule`. Easton spreadsheet defaults are instead applied primarily
through editable staffing requirement rules by shift template, weekday, and role
demand count.

The app does not hardcode final clinic policy in scheduler branches. Easton
defaults seed editable rules for week-to-week patterns, shortage order, Saturday
work patterns, and endoscopy PTO banking.
