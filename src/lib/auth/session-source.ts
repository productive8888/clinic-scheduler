export type SessionSource = "authjs" | "dev-switcher" | "dev-fallback" | "none";

export function isLocalDevAuthAvailable(input: {
  nodeEnv?: string;
  disableLocalDevAuth?: string;
}) {
  return (
    input.nodeEnv === "development" && input.disableLocalDevAuth !== "true"
  );
}

export function resolveSessionSource(input: {
  hasAuthJsSession: boolean;
  hasResolvedAuthJsActor: boolean;
  localDevAuthEnabled: boolean;
  hasDevSwitcherSelection: boolean;
}) {
  if (input.hasAuthJsSession) {
    return input.hasResolvedAuthJsActor ? "authjs" : "none";
  }

  if (!input.localDevAuthEnabled) {
    return "none";
  }

  return input.hasDevSwitcherSelection ? "dev-switcher" : "dev-fallback";
}

export function sessionSourceLabel(source: SessionSource | undefined) {
  switch (source) {
    case "authjs":
      return "Auth.js session";
    case "dev-switcher":
      return "Dev switcher";
    case "dev-fallback":
      return "Local dev fallback";
    default:
      return "No session";
  }
}
