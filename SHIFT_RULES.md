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
view includes an employee-row staff summary with AM/PM roles, unique-shift paid
hours, patient/background counts, Saturday/endoscopy counts, and GI/Allergy/PCP
exposure. Bulk generation prepares all applicable shift blocks and
staffing-rule slots before running the same deterministic daily scheduler in
ascending date order.

The daily board always renders all configured shift blocks together. There is
no normal shift-selection tab or dropdown. Manual roles are added from the
specific shift section they belong to. Managers normally use `Generate day` or
`Generate this week`; a separate manual preparation step is not required.

Automatic generation and the multi-shift helper allow multiple non-overlapping
same-day assignments. True interval overlaps, such as 0700-1200 and 0800-1200,
remain invalid unless a manager explicitly overrides with a reason.

The migration-only legacy full-day shift remains stored for old schedule
history, but it is inactive and hidden from normal generation, staffing-rule,
shortage-rule, and manager schedule views. New preparation uses configured
ShiftTemplates only; the app no longer creates an implicit 8-5 fallback block.

Safe defaults create routine task slots only on shift blocks marked
`defaultForSchedule`. Easton spreadsheet defaults are instead applied primarily
through editable staffing requirement rules by shift template, weekday, and role
demand count.

Spreadsheet-derived regular 8:00 AM blocks are seeded as safe defaults. If a
database has no configured default for a date, generation deterministically
chooses the closest regular AM block so incomplete configuration creates a
reviewable schedule instead of an empty one.

The app does not hardcode final clinic policy in scheduler branches. Easton
defaults seed editable rules for week-to-week patterns, shortage order, Saturday
work patterns, and endoscopy PTO banking.
