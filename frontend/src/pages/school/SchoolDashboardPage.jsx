import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import schoolApi from "../../api/schoolApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { PLATFORM_ADMIN_ROLES, dashboardMemberships } from "../../auth/landing.js";
import AccountLayout from "../../components/layout/AccountLayout.jsx";
import MembersPanel from "../../components/members/MembersPanel.jsx";
import { InstitutionStatusBadge, humanise } from "../../components/ui/Badge.jsx";

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const Stat = ({ label, value, hint }) => (
  <div className="rounded-xl bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
  </div>
);

const Detail = ({ label, children }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-0.5 break-words text-sm text-gray-900">{children || "—"}</dd>
  </div>
);

const STATUS_EXPLAINED = {
  PUBLISHED: "Visible to everyone on EduHub.",
  DRAFT: "Not yet visible to the public. EduHub staff publish institutions after review.",
  PENDING_REVIEW: "Waiting for EduHub staff to review it before it goes public.",
  SUSPENDED: "Hidden from the public by EduHub staff. Members can still use this dashboard.",
};

/**
 * An institution's own dashboard at /school/:slug.
 *
 * The slug is resolved to an id from the caller's OWN memberships (from
 * /auth/me). That id is still re-verified by the API on every request — the
 * browser choosing it grants nothing. Anyone without a dashboard role there
 * sees the same "no access" screen, whether or not the slug exists.
 */
const SchoolDashboardPage = () => {
  const { slug } = useParams();
  const { memberships, user, refreshUser } = useAuth();
  const membership = dashboardMemberships(memberships).find((m) => m.slug === slug);
  const institutionId = membership?.institutionId;

  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reloadOverview = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!institutionId) return undefined;
    let cancelled = false;
    setError(null);
    schoolApi
      .overview(institutionId)
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        document.title = `${data.institution.name} · EduHub`;
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: "Could not load this institution." }));
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId, reloadToken]);

  if (!membership) {
    const isPlatformStaff = PLATFORM_ADMIN_ROLES.includes(user?.platformRole);
    return (
      <AccountLayout>
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">No dashboard here</h1>
          <p className="mt-2 text-sm text-gray-600">
            This dashboard is for an institution's administrators and staff, and you are not one of them — or the
            address is wrong.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link to="/profile" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Go to my profile
            </Link>
            {isPlatformStaff && (
              <Link to="/admin/institutions" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                Manage institutions in Admin
              </Link>
            )}
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (error) {
    return (
      <AccountLayout>
        <div role="alert" className="rounded-xl bg-white p-8 text-center shadow-sm">
          <p className="text-red-700">{error}</p>
          <button
            type="button"
            onClick={reloadOverview}
            className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Try again
          </button>
        </div>
      </AccountLayout>
    );
  }

  if (!overview) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center gap-3 py-20 text-gray-500" role="status">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-700" />
          Loading {membership.name}…
        </div>
      </AccountLayout>
    );
  }

  const { institution, members, viewer } = overview;
  const address = [institution.addressLine1, institution.addressLine2, institution.city, institution.state, institution.postalCode, institution.countryCode]
    .filter(Boolean)
    .join(", ");

  return (
    <AccountLayout>
      <div className="space-y-6">
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-gray-500">
                {humanise(institution.category)}
                {institution.typeLabel && ` · ${institution.typeLabel}`}
              </p>
              <h1 className="text-2xl font-bold text-gray-900">{institution.name}</h1>
              {institution.legalName && institution.legalName !== institution.name && (
                <p className="text-sm text-gray-600">{institution.legalName}</p>
              )}
            </div>
            <div className="text-left sm:text-right">
              <InstitutionStatusBadge status={institution.status} />
              <p className="mt-1 max-w-xs text-xs text-gray-500">{STATUS_EXPLAINED[institution.status]}</p>
            </div>
          </div>
        </section>

        <section aria-label="Member counts">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Students" value={members.active.students} />
            <Stat label="Teachers" value={members.active.teachers} />
            <Stat label="Staff" value={members.active.staff} />
            <Stat label="Administrators" value={members.active.administrators} />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Active members: {members.active.total}. Also {members.suspended} suspended, {members.pending} pending and{" "}
            {members.former} former member{members.former === 1 ? "" : "s"}.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-xl bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900">Institution profile</h2>
            <p className="mb-4 text-sm text-gray-600">
              What EduHub shows publicly. To change these details, contact EduHub support — public listings are
              reviewed before they change.
            </p>
            {institution.description && <p className="mb-4 whitespace-pre-line text-sm text-gray-700">{institution.description}</p>}
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Address">{address}</Detail>
              <Detail label="Website">
                {institution.website && (
                  <a href={institution.website} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                    {institution.website}
                  </a>
                )}
              </Detail>
              <Detail label="Email">{institution.email}</Detail>
              <Detail label="Phone">{institution.phone}</Detail>
              <Detail label="Verified by EduHub">{institution.verifiedAt ? formatDate(institution.verifiedAt) : "Not yet"}</Detail>
              <Detail label="On EduHub since">{formatDate(institution.createdAt)}</Detail>
            </dl>
          </section>

          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Your membership</h2>
            <dl className="mt-4 space-y-3">
              <Detail label="Role">{humanise(viewer.role)}</Detail>
              <Detail label="Member since">{formatDate(viewer.membership?.joinedAt)}</Detail>
              <Detail label="Member ID">{viewer.membership?.institutionMemberId}</Detail>
              <Detail label="What you can do">
                {viewer.canManage
                  ? "Add members, change roles, suspend and end memberships."
                  : "View this dashboard and the member list. Ask an administrator to make changes."}
              </Detail>
            </dl>
          </section>
        </div>

        <MembersPanel
          institutionId={institution.id}
          canManage={viewer.canManage}
          onChanged={() => {
            reloadOverview();
            // An admin may have just changed their OWN role or ended their own
            // membership; refresh it so navigation and access match the server.
            refreshUser().catch(() => {});
          }}
        />
      </div>
    </AccountLayout>
  );
};

export default SchoolDashboardPage;
