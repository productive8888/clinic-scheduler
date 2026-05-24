# Roadmap

## Implemented Foundation

- Prisma/PostgreSQL schema, generated client, seed data, and initial migration.
- Auth.js magic-link authentication with database-backed sessions, role checks,
  protected routes, and a local development user switcher.
- Admin employee CRUD surface for profiles, roles, status, skills, PTO balance,
  and per-weekday recurring availability.
- Daily schedule board with default task-slot creation, deterministic generation,
  and locked manual overrides.
- Manager draft/review/publish workflow with previous/next day navigation and
  visible shortage indicators.
- PTO/unavailability request submission, manager approval/rejection, and
  regeneration of existing affected schedule days.
- Personal/vacation approval rules, sick/emergency auto-approval, PTO balance
  floor enforcement, and clearer employee/admin PTO status messaging.
- Clinic scenarios for routine, clinic-closed, reduced-staffing, and custom
  schedule days.
- Optional manual-only tasks for Research, Background, Booking, Float, and
  Extra.
- Employee-facing portal for upcoming assignments, PTO status, PTO balance,
  skills, and normal weekly schedule visibility.
- Role-aware navigation, admin route protection, and a development-only seeded
  employee switcher for local testing.
- Admin audit log visibility for recent employee, schedule, PTO, and rule events.
- Admin staffing analytics dashboard for date-level staffing health, employee
  workload, role leaders, task understaffing, manual overrides, and short-notice
  changes.
- Admin scheduling rule management for employee-task preferences, boosts,
  penalties, and backup-only rules.
- Seeded demo employees, skills, task types, and mixed Monday-Friday /
  Tuesday-Saturday recurring availability for generated schedules.
- Pure scheduler modules for constraints, scoring, fairness, assignment, and
  coverage replacement.
- Scheduler unit tests for skill enforcement, PTO blocking, double-booking,
  deterministic generation, override preservation, direct coverage replacement,
  priority rule scoring, PTO policy behavior, clinic scenario defaults,
  short-notice detection, and staffing analytics aggregation.
- Export and webhook route placeholders.

## Next Phases

1. Configure production SMTP credentials and rotate `AUTH_SECRET` through the
   hosting environment.
2. Add drag/drop assignment interactions on top of the existing manual override
   server action.
3. Add historical effective-date management for recurring availability changes.
4. Implement Google Calendar, Google Sheets, and printable exports.
