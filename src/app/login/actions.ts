"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { authConfigured } from "@/lib/auth";
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
    await signIn("nodemailer", {
      email,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Unable to send a login link. Check the email settings and try again.",
      };
    }

    throw error;
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

function safeCallbackUrl(value: string) {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  if (value.startsWith("//")) {
    return "/";
  }

  return value;
}
