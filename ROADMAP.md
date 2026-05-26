# Roadmap

## Implemented Foundation

- Prisma/PostgreSQL schema, generated client, seed data, and initial migration.
- Auth.js magic-link authentication with database-backed sessions, role checks,
  protected routes, real-session-first role resolution, and a local development
  user switcher.
- Admin employee CRUD surface for profiles, roles, status, skills, PTO balance,
  and per-weekday recurring availability.
- Daily schedule board with default task-slot creation, deterministic generation,
  and locked manual overrides.
- Manager draft/review/publish workflow with previous/next day navigation and
  visible shortage indicators.
- PTO/unavailability request submission, manager approval/rejection, and
  regeneration of existing affected schedule days.
- PTO approval reversal, admin override, return-to-pending, and cancel workflows
  with audit logs and schedule repair.
- Personal/vacation approval rules, sick/emergency auto-approval, PTO balance
  floor enforcement, and clearer employee/admin PTO status messaging.
- NPTO no-pay time off workflow with separate request records, configurable
  240-hour default cap, cap denial reasons, admin override/reversal, audit logs,
  short-notice flags, and schedule repair.
- Clinic scenarios for routine, clinic-closed, reduced-staffing, and custom
  schedule days.
- Optional manual-only tasks for Research, Background, Booking, Float, and
  Extra.
- Configurable staffing requirement rules for tiered multi-slot task staffing by
  task type, weekday, scenario, effective date range, and requirement level.
- Employee-facing portal for upcoming assignments, PTO status, PTO balance,
  skills, and normal weekly schedule visibility.
- Role-aware navigation, admin route protection, and a development-only seeded
  employee switcher for local testing.
- Development/admin session diagnostics, deployment environment checks, and
  Vercel deployment documentation for demo readiness.
- Admin audit log visibility for recent employee, schedule, PTO, and rule events.
- Admin staffing analytics dashboard for date-level staffing health, employee
  workload, role leaders, task understaffing, manual overrides, and short-notice
  changes.
- Admin scheduling rule management for employee-task preferences, boosts,
  penalties, and backup-only rules.
- Admin staffing requirements management for required, desired, conditional, and
  optional task slots without code changes.
- Published-schedule ICS calendar exports for managers and employee-specific
  assignment calendars.
- Payroll reporting foundation with biweekly date-range reports, employee paid
  hour summaries, PTO/NPTO accounting, paid holiday support, comp-time banking
  settings, warning flags, and CSV export.
- Append-only payroll adjustment ledger for PTO debits, NPTO unpaid deductions,
  holiday/comp-time/manual adjustments, and reversal entries.
- Seeded demo employees, skills, task types, and mixed Monday-Friday /
  Tuesday-Saturday recurring availability for generated schedules.
- Pure scheduler modules for constraints, scoring, fairness, assignment, and
  coverage replacement.
- Scheduler unit tests for skill enforcement, PTO blocking, double-booking,
  deterministic generation, override preservation, direct coverage replacement,
  priority rule scoring, PTO/NPTO policy behavior, clinic scenario defaults,
  configurable staffing requirements, short-notice detection, staffing
  analytics aggregation, payroll calculations, comp-time banking, holiday
  credits, warning flags, and CSV export.
- Export and webhook route placeholders.

## Next Phases

1. Configure production SMTP credentials and rotate `AUTH_SECRET` through the
   hosting environment.
2. Add drag/drop assignment interactions on top of the existing manual override
   server action.
3. Add historical effective-date management for recurring availability changes.
4. Add richer payroll review workflows for manager sign-off and report snapshot
   history after clinic payroll policies are finalized.
5. Add richer conflict resolution for desired/conditional staffing shortages.
6. Implement Google Calendar, Google Sheets, and printable exports.
