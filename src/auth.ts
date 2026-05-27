import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { getDb } from "@/lib/db";

const developmentSecret =
  process.env.NODE_ENV === "development"
    ? "clinic-scheduler-local-development-secret"
    : undefined;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
}

function emailFromSignInCallback(input: {
  userEmail?: string | null;
  email?: unknown;
}) {
  const providerEmail =
    input.email && typeof input.email === "object" && "identifier" in input.email
      ? String(input.email.identifier ?? "")
      : null;

  return normalizeEmail(input.userEmail ?? providerEmail);
}

function redactEmail(email: string | null) {
  if (!email) {
    return "missing";
  }

  const [name, domain] = email.split("@");

  if (!domain) {
    return "invalid";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

async function findActiveEmployeeByEmail(email: string) {
  return getDb().employee.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      authProviderId: true,
    },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(getDb()),
  secret: process.env.AUTH_SECRET ?? developmentSecret,
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER
        ? process.env.EMAIL_SERVER
        : { jsonTransport: true },
      from: process.env.EMAIL_FROM ?? "Clinic Scheduler <no-reply@clinic.local>",
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/login/verify-request",
  },
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  callbacks: {
    async signIn({ user, email }) {
      const emailAddress = emailFromSignInCallback({
        userEmail: user.email,
        email,
      });

      if (!emailAddress) {
        console.warn("[auth] Magic-link sign-in denied: missing email");
        return "/login?error=MissingEmail";
      }

      const employee = await findActiveEmployeeByEmail(emailAddress);

      if (!employee) {
        console.warn("[auth] Magic-link sign-in denied: no active employee", {
          email: redactEmail(emailAddress),
          verificationRequest: Boolean(email?.verificationRequest),
        });
        return "/login?error=AccessDenied";
      }

      if (!email?.verificationRequest && user.id && employee.authProviderId !== user.id) {
        await getDb().$transaction(async (tx) => {
          await tx.employee.updateMany({
            where: {
              authProviderId: user.id,
              id: { not: employee.id },
            },
            data: {
              authProviderId: null,
            },
          });

          await tx.employee.update({
            where: { id: employee.id },
            data: { authProviderId: user.id },
          });
        });
      }

      return true;
    },
    async session({ session, user }) {
      const emailAddress = normalizeEmail(session.user?.email ?? user.email);

      if (!emailAddress) {
        return session;
      }

      const employee = await findActiveEmployeeByEmail(emailAddress);

      if (!employee) {
        return session;
      }

      session.user = {
        ...session.user,
        id: user.id,
        employeeId: employee.id,
        email: employee.email,
        name: employee.fullName,
        role: employee.role,
      };

      return session;
    },
  },
});
