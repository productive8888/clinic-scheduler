# Roadmap

## Implemented Foundation

- Prisma/PostgreSQL schema, generated client, seed data, and initial migration.
- Clerk-shaped auth helpers with role checks and a local development fallback
  when Clerk keys are not configured.
- Admin employee CRUD surface for profiles, roles, status, skills, PTO balance,
  and default availability.
- Daily schedule board with default task-slot creation, deterministic generation,
  and locked manual overrides.
- Pure scheduler modules for constraints, scoring, fairness, assignment, and
  coverage replacement.
- Scheduler unit tests for skill enforcement, PTO blocking, double-booking,
  deterministic generation, and direct coverage replacement.
- Export and webhook route placeholders.

## Next Phases

1. Connect a real Neon or Supabase PostgreSQL database and run the initial
   migration and seed.
2. Configure Clerk keys, set up Clerk webhooks, and map Clerk users to employees.
3. Add PTO request submission, manager approval/rejection, and regeneration of
   affected task slots.
4. Add drag/drop assignment interactions on top of the existing manual override
   server action.
5. Implement Google Calendar, Google Sheets, and printable exports.
