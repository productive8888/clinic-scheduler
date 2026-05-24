# Scheduler Rules

The pure scheduling engine is isolated in `src/lib/scheduler`. React components
and server actions prepare data, call the engine, and persist results; they do
not contain scheduling decisions.

## Current V1 Rules

- Deterministic generation uses a caller-provided seed and stable tie-breakers.
- Required skills are enforced before scoring.
- Weekly availability is enforced by weekday and minute range.
- Approved PTO/unavailability blocks assignments.
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

Seed data creates interchangeable groups for Allergy and GI virtual/in-person
pairs, plus required skills for Civil Surgeon, Allergy Shots, and Procedures.
