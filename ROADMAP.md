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
- Seeded demo employees, skills, task types, and Monday-Friday recurring
  availability for a complete generated schedule.
- Pure scheduler modules for constraints, scoring, fairness, assignment, and
  coverage replacement.
- Scheduler unit tests for skill enforcement, PTO blocking, double-booking,
  deterministic generation, override preservation, and direct coverage
  replacement.
- Export and webhook route placeholders.

## Next Phases

1. Configure Clerk keys, set up Clerk webhooks, and map Clerk users to employees.
2. Add drag/drop assignment interactions on top of the existing manual override
   server action.
3. Add manager editing surfaces for recurring availability and scheduling rules.
4. Implement Google Calendar, Google Sheets, and printable exports.
