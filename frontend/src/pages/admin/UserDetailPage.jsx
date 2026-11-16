import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { ACTION_LABEL, describeAudit } from "../../components/admin/auditText.js";
import { PageHeader, Panel, PanelEmpty, PanelError, PanelLink, PanelLoading } from "../../components/admin/Panel.jsx";
import Avatar from "../../components/profile/Avatar.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import { MembershipStatusBadge, PlatformRoleBadge, UserStatusBadge, humanise } from "../../components/ui/Badge.jsx";
import { formatDate, formatDateTime } from "../../utils/format.js";

const Detail = ({ label, children }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 break-words text-sm text-slate-900">{children ?? "—"}</dd>
  </div>
);

const ACTIONS = {
  SUSPENDED: { title: "Suspend", description: "They are signed out on every device at once and cannot sign in until reactivated. Nothing is deleted.", destructive: true },
  ACTIVE: { title: "Reactivate", description: "They can sign in again. Sessions ended by the suspension stay ended.", destructive: false },
  PLATFORM_ADMIN: { title: "Make Platform Admin", description: "They gain access to this admin area and are signed out so their next sign-in carries the role.", destructive: false },
  USER: { title: "Revoke Platform Admin", description: "They lose admin access immediately and are signed out everywhere.", destructive: true },
};

const UserDetailPage = () => {
  const { id } = useParams();
  const { user: me } = useAuth();
  const isSuper = me?.platformRole === "SUPER_ADMIN";
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [about, setAbout] = useState(null);
  const [by, setBy] = useState(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi.users
      .get(id)
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        document.title = `${u.fullName} · EduHub Admin`;
      })
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "Could not load this account." })));
    adminApi.auditLogs({ targetId: id, limit: 10 }).then((d) => !cancelled && setAbout(d)).catch(() => !cancelled && setAbout({ rows: [], failed: true }));
    adminApi.auditLogs({ actorUserId: id, limit: 10 }).then((d) => !cancelled && setBy(d)).catch(() => !cancelled && setBy({ rows: [], failed: true }));
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  const run = async () => {
    setBusy(true);
    setActionError(null);
    try {
      if (pending === "SUSPENDED" || pending === "ACTIVE") await adminApi.users.changeStatus(id, pending);
      else await adminApi.users.changePlatformRole(id, pending);
      setPending(null);
      refresh();
    } catch (err) {
      setActionError(apiErrorMessage(err, { fallback: "The change could not be saved." }));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <PanelError message={error} onRetry={refresh} />;
  if (!user) return <Panel><PanelLoading label="Loading account…" /></Panel>;

  const isSelf = user.id === me?.id;
  const targetIsSuper = user.platformRole === "SUPER_ADMIN";
  const canModerate = !isSelf && (!targetIsSuper || isSuper);
  const canChangeRole = isSuper && !isSelf && !targetIsSuper;

  const activity = (title, data, empty, filterKey) => (
    <Panel title={title} action={data?.rows?.length > 0 && <PanelLink to={`/admin/audit-logs?${filterKey}=${id}`}>All</PanelLink>}>
      {!data && <PanelLoading />}
      {data?.failed && <PanelError message="Could not load activity." />}
      {data && !data.failed && data.rows.length === 0 && <PanelEmpty>{empty}</PanelEmpty>}
      {data && data.rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.rows.map((e) => (
            <li key={e.id} className="py-2.5 text-sm">
              <p className="text-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ACTION_LABEL[e.action]}</span>
                <span className="block">{e.actor?.fullName ?? "System"} {describeAudit(e)}</span>
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(e.createdAt)}{e.ipAddress && ` · ${e.ipAddress}`}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        actions={
          <>
            {canModerate && user.status === "ACTIVE" && (
              <button type="button" onClick={() => setPending("SUSPENDED")} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Suspend</button>
            )}
            {canModerate && user.status === "SUSPENDED" && (
              <button type="button" onClick={() => setPending("ACTIVE")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Reactivate</button>
            )}
            {canChangeRole && user.platformRole === "USER" && user.status === "ACTIVE" && user.emailVerifiedAt && (
              <button type="button" onClick={() => setPending("PLATFORM_ADMIN")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Make Platform Admin</button>
            )}
            {canChangeRole && user.platformRole === "PLATFORM_ADMIN" && (
              <button type="button" onClick={() => setPending("USER")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Revoke Platform Admin</button>
            )}
          </>
        }
      />

      <Panel>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={user.fullName} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-900">{user.fullName}</h2>
            <p className="text-sm text-slate-600">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <PlatformRoleBadge role={user.platformRole} />
              <UserStatusBadge status={user.status} />
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${user.emailVerifiedAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {user.emailVerifiedAt ? "Email verified" : "Email not verified"}
              </span>
            </div>
          </div>
          <Link to={`/u/${user.id}`} className="text-sm font-medium text-blue-700 hover:underline">Public profile →</Link>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="User ID"><span className="font-mono text-xs">{user.id}</span></Detail>
          <Detail label="Registered">{formatDateTime(user.createdAt)}</Detail>
          <Detail label="Last sign-in">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}</Detail>
          <Detail label="Email verified">{user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt) : "Not yet"}</Detail>
        </dl>
        {isSelf && <p className="mt-4 text-xs text-slate-500">This is your own account. You cannot suspend yourself or change your own role.</p>}
        {!isSelf && targetIsSuper && <p className="mt-4 text-xs text-slate-500">Super Admin roles can only be changed with database access.</p>}
        {user.platformRole === "USER" && isSuper && (user.status !== "ACTIVE" || !user.emailVerifiedAt) && (
          <p className="mt-4 text-xs text-slate-500">Only active accounts with a verified email can be made Platform Admin.</p>
        )}
      </Panel>

      <Panel title="Memberships" description="Institutions this person belongs to, including ended memberships." bodyClassName="p-0">
        {user.memberships.length === 0 ? (
          <PanelEmpty>No institution memberships.</PanelEmpty>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Institution</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Member ID</th>
                <th className="px-5 py-2.5">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {user.memberships.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-2.5"><Link to={`/admin/institutions/${m.institution.id}`} className="font-medium text-slate-900 hover:text-blue-700">{m.institution.name}</Link></td>
                  <td className="px-3 py-2.5 text-slate-700">{humanise(m.role)}</td>
                  <td className="px-3 py-2.5"><MembershipStatusBadge status={m.status} /></td>
                  <td className="px-3 py-2.5 text-slate-700">{m.institutionMemberId ?? "—"}</td>
                  <td className="px-5 py-2.5 text-slate-700">{formatDate(m.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {activity("Changes to this account", about, "No administrative changes recorded for this account.", "targetId")}
        {activity("Actions by this person", by, "This person has not made any recorded administrative changes.", "actorUserId")}
      </div>

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        error={actionError}
        destructive={ACTIONS[pending]?.destructive}
        title={`${ACTIONS[pending]?.title ?? ""}: ${user.fullName}?`}
        description={ACTIONS[pending]?.description}
        confirmLabel={ACTIONS[pending]?.title}
        onConfirm={run}
        onCancel={() => {
          setPending(null);
          setActionError(null);
        }}
      />
    </div>
  );
};

export default UserDetailPage;
