export {
  auditActorId,
  authConfigured,
  authEmailConfigured,
  authSecretConfigured,
  DEV_ACTOR_COOKIE,
  getLocalDevSwitchEmployees,
  getCurrentActor,
  localDevAuthEnabled,
  requireActor,
  requireManager,
  requireRole,
  type AuthActor,
  type DevSwitchEmployee,
} from "./session";
export {
  canManageEmployees,
  canOverrideSchedules,
  isManagerRole,
  managerRoles,
} from "./roles";
