import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { getDb } from "@/lib/db";

const developmentSecret =
  process.env.NODE_ENV === "development"
    ? "clinic-scheduler-local-development-secret"
    : undefined;

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
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
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  callbacks: {
    async signIn({ user, email }) {
      const emailAddress = normalizeEmail(user.email);

      if (!emailAddress) {
        return "/login?error=MissingEmail";
      }

      const employee = await findActiveEmployeeByEmail(emailAddress);

      if (!employee) {
        return "/login?error=AccessDenied";
      }

      if (!email?.verificationRequest && user.id && employee.authProviderId !== user.id) {
        await getDb().employee.update({
          where: { id: employee.id },
          data: { authProviderId: user.id },
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
