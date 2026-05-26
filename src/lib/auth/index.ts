export {
  auditActorId,
  authConfigured,
  authEmailConfigured,
  authSecretConfigured,
  authUrlConfigured,
  DEV_ACTOR_COOKIE,
  getLocalDevSwitchEmployees,
  getCurrentActor,
  getSessionDiagnostics,
  localDevAuthEnabled,
  requireActor,
  requireManager,
  requireRole,
  type AuthActor,
  type DevSwitchEmployee,
} from "./session";
export {
  isLocalDevAuthAvailable,
  resolveSessionSource,
  sessionSourceLabel,
  type SessionSource,
} from "./session-source";
export {
  canManageEmployees,
  canOverrideSchedules,
  isManagerRole,
  managerRoles,
} from "./roles";
