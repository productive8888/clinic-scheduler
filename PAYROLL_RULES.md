# Payroll Rules

Payroll features generate manager-reviewable estimates only. The app does not
submit payroll, send payments, or integrate with payroll vendors.

## Report Inputs

Payroll reports combine:

- Active schedule assignments, shift-block paid hours, and task slot start/end
  times for calendar context.
- Approved or overridden PTO.
- Approved or overridden NPTO.
- Configured paid holidays.
- Employee expected weekly hours.
- Payroll adjustment ledger entries.
- Configurable comp-time and under-expected-hour settings.

## Default Period

The default payroll period is biweekly. Employee expected hours are calculated
from `expectedWeeklyHours * periodDays / 7`. The default employee expected
weekly hours value is 40, so a 14-day period defaults to 80 expected hours.

## PTO Accounting

Personal, vacation, and legacy PTO approvals deduct PTO balance and create
`PTO_DEBIT` ledger entries. Sick and emergency requests are still paid time off
for report purposes, but they do not use the balance-deducting rule. Every PTO
request type begins pending and requires manager approval; request type does not
cause automatic approval.

When a balance-deducting PTO approval is reversed, the balance is restored and a
`REVERSAL_ADJUSTMENT` ledger entry is created. Historical records are not
deleted.

## NPTO Accounting

NPTO is unpaid time off. Approved or overridden NPTO blocks scheduling, does not
reduce PTO balance, and creates an `NPTO_UNPAID_DEDUCTION` ledger entry.
Every NPTO request begins pending, and no NPTO hours cap is enforced.

When NPTO is reversed, unpaid hours are removed from the active request and a
`REVERSAL_ADJUSTMENT` ledger entry is created.

## OPTO

OPTO is maintained manually by admins in its own balance and append-only ledger.
It is not included in payroll paid-hour calculations and does not create
`PayrollAdjustmentLedger` entries.

## Holidays

Paid holidays are configured by managers. Holiday rules currently support:

- `PAID_HOLIDAY`: counts as paid holiday hours.
- `BANK_AS_COMP_TIME`: counts as comp-time credit.
- `BANK_AS_PTO`: records PTO-credit style hours for report visibility.
- `UNPAID`: visible holiday configuration with no paid-hour credit.

Holiday hours are counted for employees whose normal recurring availability
includes that weekday.

## Comp Time

Comp-time banking is configurable and disabled by default. When enabled,
over-expected paid hours can be banked as comp-time credit. Under-expected hours
can be flagged, and optional comp-time debit calculations can be enabled later
without changing scheduler behavior.

## Warnings

Reports flag:

- Employee below expected hours.
- Employee above expected hours.
- Negative PTO balance.
- PTO below -24 hours.
- Missing schedule data for normally staffed weekdays.
- Unpublished schedule days in the report period.
- Unresolved shortages.
- Manual overrides.
- Reversed or cancelled PTO/NPTO affecting the period.
- Missing task slot start/end times.

## Variable Shift Lengths

Scheduled work hours prefer the dated `ShiftBlock.paidHours` snapshot. Task slot
start/end times remain important for calendar exports and eligibility checks,
but payroll falls back to duration only when a shift block paid-hour value is
missing.

Whole-day/week views and range generation do not introduce a second hours
model. Manual assignment previews use employee expected weekly hours for
warnings, while payroll reports continue to calculate from dated shift-block
paid hours.

Range generation uses each employee's configured weekly target and unique
assigned shift-block hours as soft scheduling guidance. The week review reports
under/over-target employees, but payroll remains the authoritative reporting
calculation and never assumes that every assignment is a full day.

Easton's current default for endoscopy extra hours is:

- never shorten shifts as the automatic suggestion
- bank extra endoscopy hours as PTO-style credit for manager review

This remains configurable in `PayrollSettings`. Direct payroll payout,
endoscopy overtime pay policy, and final clinic-closure time-back policies are
not hardcoded in V1.
