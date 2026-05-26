export type DeploymentEnvKey =
  | "DATABASE_URL"
  | "AUTH_SECRET"
  | "AUTH_URL_OR_NEXTAUTH_URL"
  | "EMAIL_SERVER"
  | "EMAIL_FROM";

export type DeploymentEnvItem = {
  key: DeploymentEnvKey;
  label: string;
  configured: boolean;
  required: boolean;
  description: string;
};

export type DeploymentEnvStatus = {
  ready: boolean;
  emailLoginReady: boolean;
  items: DeploymentEnvItem[];
  missingLabels: string[];
};

export function getDeploymentEnvStatus(
  env: Record<string, string | undefined> = process.env,
): DeploymentEnvStatus {
  const items: DeploymentEnvItem[] = [
    {
      key: "DATABASE_URL",
      label: "DATABASE_URL",
      configured: hasValue(env.DATABASE_URL),
      required: true,
      description: "PostgreSQL connection string, such as Neon.",
    },
    {
      key: "AUTH_SECRET",
      label: "AUTH_SECRET",
      configured: hasValue(env.AUTH_SECRET),
      required: true,
      description: "Auth.js secret used to sign and verify session data.",
    },
    {
      key: "AUTH_URL_OR_NEXTAUTH_URL",
      label: "AUTH_URL or NEXTAUTH_URL",
      configured: hasValue(env.AUTH_URL) || hasValue(env.NEXTAUTH_URL),
      required: true,
      description: "Canonical deployed app URL for Auth.js callbacks.",
    },
    {
      key: "EMAIL_SERVER",
      label: "EMAIL_SERVER",
      configured: hasValue(env.EMAIL_SERVER),
      required: true,
      description: "SMTP connection URL for magic-link email.",
    },
    {
      key: "EMAIL_FROM",
      label: "EMAIL_FROM",
      configured: hasValue(env.EMAIL_FROM),
      required: true,
      description: "Sender address used for magic-link email.",
    },
  ];
  const missingLabels = items
    .filter((item) => item.required && !item.configured)
    .map((item) => item.label);

  return {
    ready: missingLabels.length === 0,
    emailLoginReady:
      hasValue(env.AUTH_SECRET) &&
      hasValue(env.EMAIL_SERVER) &&
      hasValue(env.EMAIL_FROM),
    items,
    missingLabels,
  };
}

export function getMissingAuthSetupLabels(
  env: Record<string, string | undefined> = process.env,
) {
  return getDeploymentEnvStatus(env)
    .items.filter((item) =>
      ["AUTH_SECRET", "EMAIL_SERVER", "EMAIL_FROM"].includes(item.key),
    )
    .filter((item) => !item.configured)
    .map((item) => item.label);
}

function hasValue(value: string | undefined) {
  return Boolean(value && value.trim());
}
