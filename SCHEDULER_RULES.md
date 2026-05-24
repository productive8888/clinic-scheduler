# Scheduler Rules

The pure scheduling engine is isolated in `src/lib/scheduler`. React components
and server actions prepare data, call the engine, and persist results; they do
not contain scheduling decisions.

## Current V1 Rules

- Deterministic generation uses a caller-provided seed and stable tie-breakers.
- Required skills are enforced before scoring.
- Weekly availability is enforced by weekday and minute range.
- Approved PTO/unavailability blocks assignments.
- Personal and vacation requests require manager approval before blocking
  scheduling; sick and emergency requests auto-approve and immediately block
  assignments on affected dates.
- Personal and vacation approvals deduct PTO balance and are denied when they
  would put the balance below -24 hours.
- PTO approval regenerates existing affected schedule days and returns them to
  generated draft review.
- Employees cannot be double-booked for overlapping slots on the same date.
- Weekly assignment limits are honored when configured.
- Skilled and difficult slots are filled before easier general slots.
- Manual locked assignments are preserved during regeneration.
- Locked assignments that conflict with approved PTO are preserved but surfaced
  as shortage/conflict slots until a manager resolves them.
- Default generated task slots use 8 AM-5 PM working hours so they match the
  seeded recurring availability window.
- Fairness scoring favors underused employees and reduces repeated difficult
  task assignments.
- Configurable `SchedulingRule` rows can prefer, avoid, boost, penalize, or
  mark employees as backup-only for task selection.
- Supported manager-facing rule types are `PREFER_EMPLOYEE_FOR_TASK`,
  `AVOID_EMPLOYEE_FOR_TASK`, `PRIORITY_BOOST`, `PRIORITY_PENALTY`, and
  `BACKUP_ONLY`.
- Clinic scenarios are applied before generation by choosing the dated task
  slots the pure scheduler receives. `Clinic Closed` and `Custom Scenario`
  create no default task slots. `Doctor Off / Reduced Staffing` uses reduced
  task defaults. Optional tasks are manual-only.

## Initial Task Types

- New Allergy
- Virtual Allergy
- New GI
- Virtual GI
- Followup
- Front Desk
- Civil Surgeon
- Allergy Shots
- Procedures

Optional manual-only task types:

- Research
- Background
- Booking
- Float
- Extra

Seed data creates interchangeable groups for Allergy and GI virtual/in-person
pairs, plus required skills for Civil Surgeon, Allergy Shots, and Procedures.
