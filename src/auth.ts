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

async function linkEmployeeToAuthUser(input: {
  userId: string | null | undefined;
  email: string | null | undefined;
}) {
  const userId = input.userId;
  const email = normalizeEmail(input.email);

  if (!userId || !email) {
    return;
  }

  const employee = await findActiveEmployeeByEmail(email);

  if (!employee || employee.authProviderId === userId) {
    return;
  }

  await getDb().$transaction(async (tx) => {
    await tx.employee.updateMany({
      where: {
        authProviderId: userId,
        id: { not: employee.id },
      },
      data: {
        authProviderId: null,
      },
    });

    await tx.employee.update({
      where: { id: employee.id },
      data: { authProviderId: userId },
    });
  });
}

async function safelyLinkEmployeeToAuthUser(input: {
  userId: string | null | undefined;
  email: string | null | undefined;
  source: string;
}) {
  try {
    await linkEmployeeToAuthUser(input);
  } catch (error) {
    console.warn("[auth] Unable to link employee to Auth.js user", {
      source: input.source,
      email: redactEmail(normalizeEmail(input.email)),
      error: error instanceof Error ? error.message : "unknown",
    });
  }
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

      await safelyLinkEmployeeToAuthUser({
        userId: user.id,
        email: employee.email,
        source: "session",
      });

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
  events: {
    async createUser({ user }) {
      await safelyLinkEmployeeToAuthUser({
        userId: user.id,
        email: user.email,
        source: "createUser",
      });
    },
    async updateUser({ user }) {
      await safelyLinkEmployeeToAuthUser({
        userId: user.id,
        email: user.email,
        source: "updateUser",
      });
    },
  },
});
