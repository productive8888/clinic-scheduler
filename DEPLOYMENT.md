# Vercel Deployment

This app is a Next.js App Router application intended for Vercel with
PostgreSQL/Neon and Auth.js magic-link login.

The app does not seed or migrate automatically during production builds. Run
migrations intentionally, then seed demo data only when you want demo accounts.

## 1. Deploy From GitHub

1. Push the repository to GitHub.
2. In Vercel, create a new project from the GitHub repository.
3. Keep the framework preset as Next.js.
4. Use the default install/build commands:
   - Install: `npm install`
   - Build: `npm run build`

`postinstall` runs `prisma generate` so Prisma Client exists before build.

## 2. Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables for Production
and Preview as appropriate:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
AUTH_SECRET="generated-secret"
AUTH_URL="https://your-vercel-domain.vercel.app"
EMAIL_SERVER="smtp://username:password@smtp.example.com:587"
EMAIL_FROM="Clinic Scheduler <noreply@example.com>"
DISABLE_LOCAL_DEV_AUTH="true"
```

`NEXTAUTH_URL` can be used instead of `AUTH_URL` if needed by the deployment
environment. Use one canonical deployed URL, including `https://`.

Do not commit real secrets. Store production values only in Vercel environment
variables or local `.env.local` files.

## 3. Neon / Postgres

1. Create a Neon project and database.
2. Copy the pooled or direct Postgres connection string.
3. Set it as `DATABASE_URL` in Vercel.
4. For local development, place it in `.env.local` or use `vercel env pull`.

## 4. Auth Secret

Generate a strong Auth.js secret locally:

```bash
npx auth secret
```

Copy the generated value into Vercel as `AUTH_SECRET`.

## 5. Email Magic Links

Configure an SMTP provider and set:

- `EMAIL_SERVER`: full SMTP URL.
- `EMAIL_FROM`: verified sender identity.

For Resend, the sender domain usually must be verified before sending to clinic
users. Development sandbox senders may only send to restricted addresses.

## 6. Migrations

Run migrations against the production database intentionally:

```bash
npx prisma migrate deploy
```

Recommended options:

- Run locally with production env pulled into a temporary shell.
- Run from a controlled CI job.
- Do not run `prisma migrate dev` against production.

## 7. Seed Demo Data

Seed only when you want demo data:

```bash
npm run prisma:seed
```

Seeded demo login emails:

- Admin: `ava.allergy@clinic.test`
- Employee: `cora.civil@clinic.test`

Those `.test` addresses are placeholders and will not receive real email. For a
live clinic demo, update or create `Employee` rows with real reachable email
addresses:

1. Seed locally or in the target database.
2. In the database, update one active admin/manager employee email to your demo
   admin email.
3. Update one active employee email to your demo employee email.
4. Sign in with each email through `/login`.

Role comes from the active `Employee` record matching the magic-link email.

## 8. Local Development Auth

Local user switching is development-only:

- Enabled only when `NODE_ENV=development`.
- Disabled when `DISABLE_LOCAL_DEV_AUTH="true"`.
- Never enabled in Vercel production.

For testing real magic-link login locally, set:

```env
DISABLE_LOCAL_DEV_AUTH="true"
```

This prevents the local fallback admin from masking the real Auth.js session.

## 9. Verify Deployment

After deployment and migration:

1. Visit `/login`.
2. Request a link for the demo admin email.
3. Confirm admin routes to `/schedule` or `/admin`.
4. Log out.
5. Request a link for the demo employee email.
6. Confirm employee routes to `/employee` and cannot access `/admin`.
7. As an admin, visit `/admin/diagnostics`.
8. Confirm:
   - session source is `Auth.js session`
   - employee ID and role match the database record
   - required env vars show as configured

You can also run:

```bash
npm run check:deployment
```

The check prints only whether required variables are present. It does not print
secret values.

## 10. Session Duration

Auth.js uses database sessions with:

- Max age: 30 days
- Update age: 1 day

This acts as the app's default "remember this device" behavior. Sessions are not
permanent. Users can end a session from the visible logout action.
