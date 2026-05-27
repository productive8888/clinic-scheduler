import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { EmployeeRole } from "@prisma/client";
import { createTransport } from "nodemailer";
import { getDb } from "@/lib/db";

const MAGIC_LINK_MAX_AGE_SECONDS = 60 * 60 * 24;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type ConsumeMagicLinkResult =
  | {
      ok: false;
      reason: "missing" | "not_found" | "expired" | "no_employee";
      email?: string;
    }
  | {
      ok: true;
      email: string;
      employee: {
        id: string;
        email: string;
        fullName: string;
        role: EmployeeRole;
        authProviderId: string | null;
      };
      sessionToken: string;
      expires: Date;
    };

export async function sendClinicMagicLink(input: {
  email: string;
  callbackUrl: string;
  origin: string;
}) {
  const email = normalizeEmail(input.email);

  if (!email) {
    throw new Error("Invalid email");
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + MAGIC_LINK_MAX_AGE_SECONDS * 1000);
  const tokenHash = hashMagicToken(token);

  await getDb().$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({
      where: { identifier: email },
    });

    await tx.verificationToken.create({
      data: {
        identifier: email,
        token: tokenHash,
        expires,
      },
    });
  });

  const url = new URL("/api/auth/clinic-magic", input.origin);
  url.searchParams.set("email", email);
  url.searchParams.set("token", token);
  url.searchParams.set("callbackUrl", safeCallbackUrl(input.callbackUrl));

  await sendEmail({
    to: email,
    url: url.toString(),
    host: new URL(input.origin).host,
  });
}

export async function consumeClinicMagicLink(input: {
  email: string | null;
  token: string | null;
}): Promise<ConsumeMagicLinkResult> {
  const email = normalizeEmail(input.email);
  const token = input.token;

  if (!email || !token) {
    return { ok: false, reason: "missing" as const };
  }

  const tokenHash = hashMagicToken(token);
  const invite = await getDb().verificationToken
    .delete({
      where: {
        identifier_token: {
          identifier: email,
          token: tokenHash,
        },
      },
    })
    .catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2025"
      ) {
        return null;
      }

      throw error;
    });

  if (!invite) {
    return { ok: false, reason: "not_found" as const, email };
  }

  if (invite.expires.valueOf() < Date.now()) {
    return { ok: false, reason: "expired" as const, email };
  }

  const employee = await getDb().employee.findFirst({
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

  if (!employee) {
    return { ok: false, reason: "no_employee" as const, email };
  }

  const user = await getDb().user.upsert({
    where: { email },
    update: {
      name: employee.fullName,
      emailVerified: new Date(),
    },
    create: {
      email,
      name: employee.fullName,
      emailVerified: new Date(),
    },
    select: {
      id: true,
      email: true,
    },
  });

  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const sessionToken = randomUUID();

  await getDb().$transaction(async (tx) => {
    await tx.employee.updateMany({
      where: {
        authProviderId: user.id,
        id: { not: employee.id },
      },
      data: { authProviderId: null },
    });

    await tx.employee.update({
      where: { id: employee.id },
      data: { authProviderId: user.id },
    });

    await tx.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });
  });

  return {
    ok: true,
    email,
    employee,
    sessionToken,
    expires,
  };
}

export function sessionCookieName(origin: string) {
  return new URL(origin).protocol === "https:"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function safeCallbackUrl(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  if (value.startsWith("//")) {
    return "/";
  }

  return value;
}

function hashMagicToken(token: string) {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required for magic links");
  }

  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

async function sendEmail(input: { to: string; url: string; host: string }) {
  if (!process.env.EMAIL_SERVER || !process.env.EMAIL_FROM) {
    throw new Error("Email login is not configured");
  }

  const transport = createTransport(process.env.EMAIL_SERVER);
  const result = await transport.sendMail({
    to: input.to,
    from: process.env.EMAIL_FROM,
    subject: `Sign in to ${input.host}`,
    text: `Sign in to Clinic Scheduler\n\n${input.url}\n\nThis link expires in 24 hours and can only be used once.`,
    html: `<p>Sign in to Clinic Scheduler</p><p><a href="${escapeHtml(input.url)}">Open secure sign-in link</a></p><p>This link expires in 24 hours and can only be used once.</p>`,
  });
  const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(
    Boolean,
  );

  if (failed.length) {
    throw new Error(`Email could not be sent to ${failed.join(", ")}`);
  }
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
