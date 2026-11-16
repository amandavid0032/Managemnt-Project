import { humanise } from "../ui/Badge.jsx";

/** Mirrors AUDIT_ACTIONS in api/src/audit/audit.actions.ts. */
export const AUDIT_ACTIONS = [
  "institution.created",
  "institution.updated",
  "institution.status_changed",
  "institution.archived",
  "user.status_changed",
  "user.platform_role_changed",
  "membership.created",
  "membership.updated",
  "membership.status_changed",
];

export const ACTION_LABEL = {
  "institution.created": "Institution created",
  "institution.updated": "Institution edited",
  "institution.status_changed": "Institution status changed",
  "institution.archived": "Institution archived",
  "user.status_changed": "Account status changed",
  "user.platform_role_changed": "Platform role changed",
  "membership.created": "Member added",
  "membership.updated": "Membership edited",
  "membership.status_changed": "Membership status changed",
};

/** One readable sentence for an audit entry, built only from what it recorded. */
export const describeAudit = (e) => {
  const m = e.metadata ?? {};
  const target = e.targetLabel ?? (e.targetType === "membership" ? "a membership" : `${e.targetType} ${e.targetId?.slice(0, 8)}`);
  switch (e.action) {
    case "institution.created":
      return `created ${target}`;
    case "institution.updated":
      return `edited ${target} (${Object.keys(m.changes ?? {}).map(humanise).join(", ") || "no fields"})`;
    case "institution.status_changed":
      if (m.decision === "APPROVED") return `approved and published ${target}`;
      if (m.decision === "REJECTED") return `rejected ${target}`;
      return `moved ${target} from ${humanise(m.from)} to ${humanise(m.to)}`;
    case "institution.archived":
      return `archived ${target}`;
    case "user.status_changed":
      return `${m.to === "SUSPENDED" ? "suspended" : "reactivated"} ${target}`;
    case "user.platform_role_changed":
      return `changed ${target}'s platform role from ${humanise(m.from)} to ${humanise(m.to)}`;
    case "membership.created":
      return `added a ${humanise(m.role).toLowerCase()} to an institution`;
    case "membership.updated":
      return m.role ? `changed a member's role from ${humanise(m.role.from)} to ${humanise(m.role.to)}` : "edited a membership";
    case "membership.status_changed":
      return `set a membership to ${humanise(m.to)}`;
    default:
      return e.action;
  }
};
