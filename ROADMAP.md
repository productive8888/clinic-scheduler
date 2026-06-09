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
- Whole-day schedule review with every shift block visible, plus a manager week
  view with Monday-Saturday status, shortage, PTO, and NPTO summaries.
- Dense shift-block daily board with compact configured time labels, clear
  clinic/background/Float classification, assignment warnings, and no normal
  legacy full-day workflow.
- Simplified whole-day workflow with every shift shown automatically, no
  shift-selection tab, no normal prepare-only action, and per-shift manual role
  additions.
- Weekly employee-row staff summary for AM/PM roles, unique-shift paid hours,
  patient/background workload, Saturday/endoscopy counts, and GI/Allergy/PCP
  exposure review.
- Day/week/month/custom-range generation with published-date protection,
  deterministic per-date seeds, background-slot preparation, aggregate result
  summaries, and bulk audit logs.
- Easton week generation now applies all `Shifts + Hours` demand to exact AM,
  PM, and Saturday shift templates, including shift-specific BG, Front
  Background, Booking, Research, and Float slots.
- Schedule status calendar with draft/published/needs-regeneration visibility,
  shortages, PTO/NPTO counts, day actions, and range unpublish workflows.
- Weekly generation prepares the complete date range before assignment and uses
  configured weekly-hour/work-pattern guidance while retaining deterministic
  daily scheduler execution.
- One-click generation pipeline that prepares visible shift blocks and clinic/
  background slots, invokes the shared scheduler, persists assignments and
  conflicts, and returns generation diagnostics without per-day manual
  preparation.
- Empty non-closed schedule publish protection with required-slot blocker
  details and week-level manual-review visibility.
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
- Shift-template and shift-block scheduling foundation with editable spreadsheet
  shift times, dated shift snapshots, shift-grouped schedule board display, and
  shift-aware staffing requirement rules.
- Configurable fairness settings for window selection and clinical/total/hour/
  Saturday/endoscopy weighting.
- Configurable shortage guidance storage and admin UI for manager-facing
  closure/cut recommendations without hardcoded final order.
- Background task category/definition foundation with estimated hours, period
  type, priority, ownership, eligibility, pullability, and admin UI.
- Period-aware background task slot generation with required-count/hour support,
  task-type links, due windows, required-skill/employee eligibility enforcement,
  protected assignment preservation, and clear `(Background)` labels.
- IT, Research, and PA / Prior Authorization skills and task requirements,
  including a clear distinction between Prior Authorization and Physician
  Assistant / MD.
- Manual reassignment warning previews and audited override reasons, plus a
  multi-shift AM/PM assignment helper.
- Easton spreadsheet import/review foundation for private workbook parsing,
  parsed July shift/demand/target review, and applying editable database
  defaults without activating June sample assignments.
- Easton spreadsheet shift times seeded as editable shift templates, including
  7:00 AM-12:00 PM early AM, 1:00 PM-6:00 PM Monday long PM, regular weekday
  AM/PM, and Saturday endoscopy/short shifts.
- Schedule pattern and employee target foundations for week-to-week consistency,
  patient-facing fairness, per-role/skill targets, and GI/Allergy/PCP exposure
  goals.
- Easton shortage recommendation order seeded as editable rules, plus
  employee-specific background pull-priority rules with max-pull caps.
- Work-pattern templates for exact July Easton groups: Saturday endoscopy and
  non-endoscopy `M + Th`, `T + Th`, `M + W`, `M + T`, `T + W`, and `W + Th`
  40-hour patterns, assignable from employee profiles and imported from
  `Shifts by GY`.
- Hard weekly validation for July work-pattern requirements and employee BG
  minimums, with week-view blockers and audited publish override reasons.
- Employee-owned required weekly BG/background minimums, imported from Easton
  `Shifts by GY` but editable in employee profiles, plus deterministic
  BG/hour top-off slots after clinic coverage generation.
- Soft week-to-week consistency preference from the previous published matching
  weekday/shift/task assignment.
- Task type classification flags are manager-editable from the staffing admin
  page.
- Endoscopy extra-hour payroll policy defaults to PTO banking and avoids
  shortened-shift suggestions unless managers change the setting.
- Payroll calculations now use shift-block paid hours before falling back to
  task-slot duration.
- Append-only payroll adjustment ledger for PTO debits, NPTO unpaid deductions,
  holiday/comp-time/manual adjustments, and reversal entries.
- Seeded demo employees, skills, task types, and mixed Monday-Friday /
  Tuesday-Saturday recurring availability for generated schedules.
- Pure scheduler modules for constraints, scoring, fairness, assignment, and
  coverage replacement.
- Shift-aware same-day assignment support, partial-day PTO/NPTO overlap
  enforcement, patient-facing-first ordering, alternate candidate selection,
  and deterministic bounded assignment-swap repair.
- Future schedule invalidation when an employee is deactivated or deleted,
  including assignment removal, unpublish, shortage visibility,
  `NEEDS_REGENERATION` status, and audit metadata.
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
6. Continue validating Easton shortage/closure defaults with clinic leadership.
7. Finalize full background task priority/protection/pullability policy and build
   the remaining rollover optimizer workflow.
8. Finalize endoscopy overtime/payout policy and add report snapshots.
9. Implement Google Calendar, Google Sheets, and printable exports.
