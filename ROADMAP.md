# Roadmap

## Implemented Foundation

- Prisma/PostgreSQL schema, generated client, seed data, and initial migration.
- Clerk-shaped auth helpers with role checks and a local development fallback
  when Clerk keys are not configured.
- Admin employee CRUD surface for profiles, roles, status, skills, PTO balance,
  and default availability.
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
  skills, and recurring availability.
- Role-aware navigation, admin route protection, and a development-only seeded
  employee switcher for local testing.
- Admin audit log visibility for recent employee, schedule, PTO, and rule events.
- Admin scheduling rule management for employee-task preferences, boosts,
  penalties, and backup-only rules.
- Seeded demo employees, skills, task types, and Monday-Friday recurring
  availability for a complete generated schedule.
- Pure scheduler modules for constraints, scoring, fairness, assignment, and
  coverage replacement.
- Scheduler unit tests for skill enforcement, PTO blocking, double-booking,
  deterministic generation, override preservation, direct coverage replacement,
  priority rule scoring, PTO policy behavior, and clinic scenario defaults.
- Export and webhook route placeholders.

## Next Phases

1. Configure Clerk keys, set up Clerk webhooks, and map Clerk users to employees.
2. Add drag/drop assignment interactions on top of the existing manual override
   server action.
3. Add manager editing surfaces for recurring availability.
4. Implement Google Calendar, Google Sheets, and printable exports.
