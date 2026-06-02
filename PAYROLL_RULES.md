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
for report purposes, but they do not use the balance-deducting rule.

When a balance-deducting PTO approval is reversed, the balance is restored and a
`REVERSAL_ADJUSTMENT` ledger entry is created. Historical records are not
deleted.

## NPTO Accounting

NPTO is unpaid time off. Approved or overridden NPTO blocks scheduling, does not
reduce PTO balance, and creates an `NPTO_UNPAID_DEDUCTION` ledger entry.

When NPTO is reversed, unpaid hours are removed from the active request and a
`REVERSAL_ADJUSTMENT` ledger entry is created.

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

Endoscopy overtime, comp-time banking for Saturday/endoscopy shifts, shortened
future float shifts, and clinic-closure time-back policies are intentionally
configuration/future-policy items. They are not hardcoded in V1.
