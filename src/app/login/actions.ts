"use server";

import { headers } from "next/headers";
import { authConfigured } from "@/lib/auth";
import { sendClinicMagicLink, safeCallbackUrl } from "@/lib/auth/magic-link";
import { getDb } from "@/lib/db";
import { getMissingAuthSetupLabels } from "@/lib/deployment/env";

export type LoginFormState = {
  message?: string;
  error?: string;
};

export async function requestMagicLinkAction(
  _state: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  if (!authConfigured()) {
    const missing = getMissingAuthSetupLabels();

    return {
      error: `Email login is not fully configured. Missing: ${missing.join(", ")}.`,
    };
  }

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""));

  if (!email) {
    return { error: "Enter a valid email address." };
  }

  const employee = await getDb().employee.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!employee) {
    return {
      message:
        "If that email is linked to an active employee profile, a secure login link will arrive shortly.",
    };
  }

  try {
    await sendClinicMagicLink({
      email,
      callbackUrl,
      origin: await requestOrigin(),
    });
  } catch (error) {
    console.error("[auth] Unable to send clinic magic link", {
      email: redactEmail(email),
      error: error instanceof Error ? error.message : "unknown",
    });

    return {
      error: "Unable to send a login link. Check the email settings and try again.",
    };
  }

  return {
    message:
      "If that email is linked to an active employee profile, a secure login link will arrive shortly.",
  };
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function requestOrigin() {
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (host) {
    return `${protocol}://${host}`;
  }

  const configuredOrigin =
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? null;

  if (configuredOrigin) {
    return configuredOrigin;
  }

  throw new Error("Unable to determine app origin");
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
