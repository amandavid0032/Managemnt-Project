import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { PageHeader, Panel, PanelEmpty, PanelError, PanelLoading } from "../../components/admin/Panel.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import { PlatformRoleBadge, UserStatusBadge } from "../../components/ui/Badge.jsx";
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import { formatDate } from "../../utils/format.js";

/**
 * What each role may do — a description of what the API enforces, kept next
 * to the code that enforces it (PlatformRoles / TenantScoped decorators).
 * Hiding a button is never the control; the server refuses the request.
 */
const PLATFORM_MATRIX = [
  ["View dashboard, analytics, system health, audit log", "—", "✓", "✓"],
  ["Create, edit, publish, suspend, archive institutions", "—", "✓", "✓"],
  ["Approve or reject submitted institutions", "—", "✓", "✓"],
  ["Suspend or reactivate accounts", "—", "✓", "✓ (incl. super admins)"],
  ["Manage any institution's members (override)", "—", "✓", "✓"],
  ["Grant or revoke Platform Admin", "—", "—", "✓"],
  ["View platform settings", "—", "—", "✓"],
  ["Create a Super Admin", "—", "—", "Database access only"],
];

const TENANT_MATRIX = [
  ["Appears in education history", "✓", "✓", "✓", "✓"],
  ["Open the institution dashboard", "—", "—", "✓ (read)", "✓"],
  ["View the member list", "—", "—", "✓", "✓"],
  ["Add members, change roles, suspend, end", "—", "—", "—", "✓"],
  ["Edit the public listing", "—", "—", "—", "— (platform staff)"],
];

const Matrix = ({ head, rows }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
        <tr>
          {head.map((h) => (
            <th key={h} className="px-4 py-2.5">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(([label, ...cells]) => (
          <tr key={label}>
            <td className="px-4 py-2.5 text-slate-800">{label}</td>
            {cells.map((c, i) => (
              <td key={i} className={`px-4 py-2.5 ${c.startsWith("✓") ? "font-medium text-emerald-700" : "text-slate-400"}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const RolesPage = () => {
  const { user: me } = useAuth();
  const isSuper = me?.platformRole === "SUPER_ADMIN";
  const [staff, setStaff] = useState(null);
  const [staffError, setStaffError] = useState(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 350);
  const [candidates, setCandidates] = useState([]);
  const [change, setChange] = useState(null);
  const [busy, setBusy] = useState(false);
  const [changeError, setChangeError] = useState(null);

  useEffect(() => {
    document.title = "Roles & Permissions · EduHub Admin";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStaffError(null);
    Promise.all([
      adminApi.users.list({ platformRole: "SUPER_ADMIN", limit: 100 }),
      adminApi.users.list({ platformRole: "PLATFORM_ADMIN", limit: 100 }),
    ])
      .then(([s, p]) => !cancelled && setStaff([...s.rows, ...p.rows]))
      .catch((err) => !cancelled && setStaffError(apiErrorMessage(err, { fallback: "Could not load platform staff." })));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!isSuper || debounced.trim().length < 2) {
      setCandidates([]);
      return undefined;
    }
    let cancelled = false;
    adminApi.users
      .list({ search: debounced.trim(), platformRole: "USER", status: "ACTIVE", emailVerified: true, limit: 8 })
      .then(({ rows }) => !cancelled && setCandidates(rows))
      .catch(() => !cancelled && setCandidates([]));
    return () => {
      cancelled = true;
    };
  }, [debounced, isSuper]);

  const apply = async () => {
    setBusy(true);
    setChangeError(null);
    try {
      await adminApi.users.changePlatformRole(change.user.id, change.role);
      setChange(null);
      setSearch("");
      refresh();
    } catch (err) {
      setChangeError(apiErrorMessage(err, { fallback: "The role could not be changed." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Platform roles (what someone may do across EduHub) are separate from institution roles (what they may do at one school). Being a school's administrator grants nothing platform-wide."
      />

      <Panel title="Platform roles" bodyClassName="p-0">
        <Matrix head={["Capability", "User", "Platform Admin", "Super Admin"]} rows={PLATFORM_MATRIX} />
      </Panel>

      <Panel title="Institution membership roles" description="Scoped to one institution. Checked on every request against an active membership." bodyClassName="p-0">
        <Matrix head={["Capability", "Student", "Teacher", "Staff", "Institution Admin"]} rows={TENANT_MATRIX} />
      </Panel>

      <Panel
        title="Platform staff"
        description={isSuper ? "Grant or revoke Platform Admin. The person is signed out everywhere so their access matches at once." : "Only a Super Admin can change platform roles."}
        bodyClassName="p-0"
      >
        {isSuper && (
          <div className="border-b border-slate-100 p-5">
            <label htmlFor="grant-search" className="block text-sm font-medium text-slate-700">Make someone a Platform Admin</label>
            <input
              id="grant-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search active, verified users by name or email…"
              className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {debounced.trim().length >= 2 && (
              <ul className="mt-2 max-w-md divide-y divide-slate-100 rounded-lg border border-slate-200">
                {candidates.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No eligible users match. Only active accounts with a verified email can be promoted.</li>}
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{c.fullName}</span>
                      <span className="block truncate text-xs text-slate-500">{c.email}</span>
                    </span>
                    <button type="button" onClick={() => setChange({ user: c, role: "PLATFORM_ADMIN" })} className="shrink-0 rounded-md bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-800">
                      Grant
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {staffError && <div className="p-5"><PanelError message={staffError} onRetry={refresh} /></div>}
        {!staff && !staffError && <div className="px-5"><PanelLoading /></div>}
        {staff && staff.length === 0 && <PanelEmpty>No platform staff.</PanelEmpty>}
        {staff && staff.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link to={`/admin/users/${s.id}`} className="font-medium text-slate-900 hover:text-blue-700">{s.fullName}</Link>
                  {s.id === me?.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                  <p className="text-xs text-slate-500">{s.email} · since {formatDate(s.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <PlatformRoleBadge role={s.platformRole} />
                  <UserStatusBadge status={s.status} />
                  {isSuper && s.platformRole === "PLATFORM_ADMIN" && s.id !== me?.id && (
                    <button type="button" onClick={() => setChange({ user: s, role: "USER" })} className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50">
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Super Admin accounts cannot be created, demoted or removed from this screen — that needs database access (<code>npm run create:superadmin</code>). This makes it impossible to remove the last Super Admin, or to escalate a stolen session to platform owner.
        </p>
      </Panel>

      <ConfirmDialog
        open={change !== null}
        busy={busy}
        error={changeError}
        destructive={change?.role === "USER"}
        title={change?.role === "USER" ? `Revoke Platform Admin from ${change?.user.fullName}?` : `Make ${change?.user.fullName} a Platform Admin?`}
        description={
          change?.role === "USER"
            ? "They lose access to the admin area immediately and are signed out on every device."
            : "They will be able to publish, suspend and archive institutions, suspend accounts and manage any institution's members. They are signed out so their next sign-in carries the new role."
        }
        confirmLabel={change?.role === "USER" ? "Revoke" : "Grant Platform Admin"}
        onConfirm={apply}
        onCancel={() => {
          setChange(null);
          setChangeError(null);
        }}
      />
    </div>
  );
};

export default RolesPage;
