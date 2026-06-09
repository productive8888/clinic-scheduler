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

For the active July Easton model, every shift template imported from
`Shifts + Hours` is marked `defaultForSchedule`. This does not mean every role
appears on every shift; staffing requirement rules still decide slot counts.
It means every spreadsheet shift column is treated as generated and schedulable,
including 0700-1200, Monday 1300-1800, Friday 1300-1700, Saturday 0600-1400,
and Saturday 0800-1400.

The manager whole-day view displays every shift block for one date. The week
view includes an employee-row staff summary with AM/PM roles, unique-shift paid
hours, patient/background counts, Saturday/endoscopy counts, and GI/Allergy/PCP
exposure. Bulk generation prepares all applicable shift blocks and
staffing-rule slots for the complete selected range before running the same
deterministic daily scheduler in ascending date order. This gives later dates
the earlier dates' weekly-hours and fairness context while preserving the
shared scheduler as the single assignment engine.

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
`defaultForSchedule`. Easton spreadsheet demand is applied primarily through
editable staffing requirement rules by shift template, weekday, and role demand
count, so marking every July shift as default/generated-active does not hardcode
whole-day task demand.

`Shifts + Hours` is the active reusable Easton demand source. Every nonzero
clinic and background count is stored against its exact shift template, so PM
and Saturday blocks do not depend on the 8:00 AM safe default. June sheets,
including `June Schedule`, `June Shifts by GY`, and `June Shifts + Hours`, are
deprecated for active generation and no longer create schedule-pattern slots.

`Shifts by GY` is the active Easton employee-target source. Its group column is
imported as hard July work-pattern metadata: `Saturday` means the 6:00 AM-2:00
PM endoscopy Saturday block, while `M + Th`, `T + Th`, `M + W`, `M + T`,
`T + W`, and `W + Th` mean the 8:00 AM-2:00 PM Saturday block plus 5-hour
make-up shifts on the listed weekdays. The sheet's BG value is copied to the
matched employee profile as `requiredWeeklyBackgroundShifts`; the imported
target row remains a snapshot, but the employee field drives current generation
and publish validation.

For Tuesday, Wednesday, and Thursday, a group make-up day is satisfied only by
the 7:00 AM-12:00 PM shift. For Monday, either 7:00 AM-12:00 PM or
1:00 PM-6:00 PM satisfies the make-up day. Week generation repairs these hard
requirements before any general BG/hour filler runs, so a normal non-endoscopy
employee should not remain at 38 hours when a group-compliant week is feasible.

Generation summaries explicitly report total, AM, PM, Saturday, 0700 early AM,
0800 regular AM, 1300-1700 PM, Monday 1300-1800 PM, Saturday endoscopy, and
Saturday regular block counts plus generated work-pattern and BG/hour top-off
slots. The schedule status calendar provides day/month review, while day, week,
month, and custom-range unpublish actions preserve assignments and make dates
eligible for regeneration. Published prior-week assignments are used only as
soft consistency preferences when the same weekday/shift/task is generated
again.

The app does not hardcode final clinic policy in scheduler branches. Easton
defaults seed editable rules for week-to-week patterns, shortage order, exact
July Saturday work-pattern groups, and endoscopy PTO banking.
