"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { authConfigured } from "@/lib/auth";
import { getDb } from "@/lib/db";

export type LoginFormState = {
  message?: string;
  error?: string;
};

export async function requestMagicLinkAction(
  _state: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  if (!authConfigured()) {
    return {
      error:
        "Email login is not fully configured. Add AUTH_SECRET, EMAIL_SERVER, and EMAIL_FROM.",
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
      error: "No active employee profile is linked to that email address.",
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
    message: "Check your email for a secure login link.",
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
