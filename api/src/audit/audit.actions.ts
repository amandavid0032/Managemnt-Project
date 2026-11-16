/**
 * Every action the audit log can record. A closed list, so the Audit Logs
 * screen can offer a filter and a typo cannot create a new, unfindable verb.
 */
export const AUDIT_ACTIONS = [
  'institution.created',
  'institution.updated',
  'institution.status_changed',
  'institution.archived',
  'user.status_changed',
  'user.platform_role_changed',
  'membership.created',
  'membership.updated',
  'membership.status_changed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = ['institution', 'user', 'membership'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];
