# Shift Rules

Shift times are configurable. The seeded spreadsheet defaults are:

- AM early: 7:00 AM-11:30 AM
- AM regular: 8:00 AM-12:00 PM
- PM early/long: 12:30 PM-5:00 PM
- PM regular: 1:00 PM-5:00 PM
- Saturday long/endoscopy: 6:00 AM-2:00 PM
- Saturday shorter: 8:00 AM-2:00 PM

`ShiftTemplate` rows are reusable manager-managed definitions. A blank weekday
means weekdays for the seeded clinic model; Saturday templates are explicit.

`ShiftBlock` rows are dated snapshots attached to `ScheduleDay`. Task slots
belong to shift blocks, which lets the same task type appear in multiple shifts
on the same date without duplicate task types.

Safe defaults create routine task slots only on shift blocks marked
`defaultForSchedule`. Managers can add additional AM, PM, Saturday, or endoscopy
coverage through staffing requirement rules by shift template or category.

The app does not hardcode final endoscopy overtime or comp-time policy.
