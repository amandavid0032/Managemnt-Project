/**
 * Where a user goes after signing in, and which dashboards they are offered.
 *
 * Platform authority is checked before tenant membership, because a super
 * admin who also administers a school should land on the platform surface.
 *
 * This is a CONVENIENCE, not a security boundary. Every route it can produce
 * is independently guarded, and the API authorises each request on its own —
 * editing the URL by hand gets a 401/403/404 from the server, not data.
 */
export const PLATFORM_ADMIN_ROLES = ["SUPER_ADMIN", "PLATFORM_ADMIN"];

/**
 * Membership roles that open an institution dashboard. Mirrors the
 * @TenantScoped roles on GET /institutions/:id/overview — teachers and
 * students are members, but the dashboard is the institution's office.
 */
export const SCHOOL_DASHBOARD_ROLES = ["INSTITUTION_ADMIN", "STAFF"];

/** Memberships that come with a dashboard, one entry per institution. */
export function dashboardMemberships(memberships = []) {
  const byInstitution = new Map();
  for (const m of memberships) {
    if (!SCHOOL_DASHBOARD_ROLES.includes(m.role)) continue;
    const seen = byInstitution.get(m.institutionId);
    // Someone who is both STAFF and INSTITUTION_ADMIN appears once, as admin.
    if (!seen || m.role === "INSTITUTION_ADMIN") byInstitution.set(m.institutionId, m);
  }
  return [...byInstitution.values()];
}

export function landingPathFor(user, memberships = []) {
  if (!user) return "/login";
  if (PLATFORM_ADMIN_ROLES.includes(user.platformRole)) return "/admin";

  const schools = dashboardMemberships(memberships);
  if (schools.length === 1) return `/school/${schools[0].slug}`;
  // Several institutions: let the person choose rather than guess.
  if (schools.length > 1) return "/school";

  return "/profile";
}
