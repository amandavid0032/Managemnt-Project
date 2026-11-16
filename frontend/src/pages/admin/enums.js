/**
 * Enum values mirrored from the Prisma schema.
 *
 * Duplicating them in the client is a deliberate trade: the alternative is an
 * endpoint that serves the schema's enums, which is a request on every page
 * load to learn something that changes once a year. The API validates every
 * value it receives, so a stale copy here produces a 400 — never bad data.
 *
 * KEEP IN SYNC with api/prisma/schema.prisma.
 */

export const INSTITUTION_CATEGORIES = [
  "SCHOOL",
  "COLLEGE",
  "UNIVERSITY",
  "POLYTECHNIC",
  "INSTITUTE",
  "TRAINING_CENTER",
  "COACHING_CENTER",
  "OTHER",
];

export const INSTITUTION_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "SUSPENDED",
  "ARCHIVED",
];

export const PLATFORM_ROLES = ["USER", "PLATFORM_ADMIN", "SUPER_ADMIN"];

export const USER_STATUSES = [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
];

/**
 * The publication lifecycle, mirroring STATUS_TRANSITIONS in
 * api/src/institutions/institutions.service.ts.
 *
 * Used only to decide which buttons to OFFER. The server re-checks every
 * transition, so a drift here shows up as a refused request rather than an
 * illegal state.
 *
 * ARCHIVED is absent because archiving is the delete action, which also
 * soft-deletes the row.
 */
export const INSTITUTION_STATUS_TRANSITIONS = {
  DRAFT: ["PENDING_REVIEW", "PUBLISHED"],
  PENDING_REVIEW: ["PUBLISHED", "DRAFT"],
  PUBLISHED: ["SUSPENDED", "DRAFT"],
  SUSPENDED: ["PUBLISHED", "DRAFT"],
  ARCHIVED: [],
};

/** What each transition does, for the confirmation dialog. */
export const TRANSITION_DESCRIPTION = {
  PUBLISHED: "This institution becomes visible to everyone, including visitors who are not signed in.",
  PENDING_REVIEW: "Marks the record as awaiting review. It stays hidden from the public.",
  DRAFT: "Returns the record to draft. It is removed from public listings immediately.",
  SUSPENDED: "Hides the record from the public without deleting anything. It can be published again later.",
};

export const asOptions = (values, label = (v) => v) =>
  values.map((value) => ({ value, label: label(value) }));
