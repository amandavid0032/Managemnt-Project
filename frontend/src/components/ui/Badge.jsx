import React from "react";

/**
 * Status colours are meaning, not decoration: green reads as "live", amber as
 * "needs a decision", red as "stopped", grey as "not yet real".
 *
 * Each badge also carries its text, so the colour is never the only signal —
 * a red/green pair is invisible to the commonest form of colour blindness.
 */
const TONES = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  grey: "bg-gray-100 text-gray-700",
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
};

const INSTITUTION_STATUS_TONE = {
  PUBLISHED: "green",
  PENDING_REVIEW: "amber",
  DRAFT: "grey",
  SUSPENDED: "red",
  ARCHIVED: "grey",
};

const USER_STATUS_TONE = {
  ACTIVE: "green",
  PENDING_VERIFICATION: "amber",
  SUSPENDED: "red",
  DEACTIVATED: "grey",
};

const PLATFORM_ROLE_TONE = {
  SUPER_ADMIN: "purple",
  PLATFORM_ADMIN: "blue",
  USER: "grey",
};

const MEMBERSHIP_STATUS_TONE = {
  ACTIVE: "green",
  PENDING: "amber",
  SUSPENDED: "red",
  REJECTED: "red",
  LEFT: "grey",
};

/** Enum values are SCREAMING_SNAKE on the wire; people read "Pending review". */
export const humanise = (value) =>
  typeof value === "string" && value.length > 0
    ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ")
    : "—";

const Badge = ({ tone = "grey", children }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
      TONES[tone] ?? TONES.grey
    }`}
  >
    {children}
  </span>
);

export const InstitutionStatusBadge = ({ status }) => (
  <Badge tone={INSTITUTION_STATUS_TONE[status]}>{humanise(status)}</Badge>
);

export const UserStatusBadge = ({ status }) => (
  <Badge tone={USER_STATUS_TONE[status]}>{humanise(status)}</Badge>
);

export const PlatformRoleBadge = ({ role }) => (
  <Badge tone={PLATFORM_ROLE_TONE[role]}>{humanise(role)}</Badge>
);

export const MembershipStatusBadge = ({ status }) => (
  <Badge tone={MEMBERSHIP_STATUS_TONE[status]}>{humanise(status)}</Badge>
);

export default Badge;
