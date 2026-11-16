import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaSearch } from "react-icons/fa";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { PlatformRoleBadge, UserStatusBadge, humanise } from "../../components/ui/Badge.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { EmptyRow, ErrorRow, LoadingRow } from "../../components/ui/TableStates.jsx";
import { Select } from "../../components/ui/Field.jsx";
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { PLATFORM_ROLES, USER_STATUSES, asOptions } from "./enums.js";
import { PageHeader } from "../../components/admin/Panel.jsx";
import Avatar from "../../components/profile/Avatar.jsx";

const MEMBERSHIP_ROLES = ["STUDENT", "TEACHER", "STAFF", "INSTITUTION_ADMIN"];
const VERIFIED_OPTIONS = [
  { value: "true", label: "Email verified" },
  { value: "false", label: "Email not verified" },
];

const COLUMNS = 8;
const PAGE_SIZE = 20;

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const UsersListPage = () => {
  const { user: me, platformRole } = useAuth();

  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const role = params.get("platformRole") ?? "";
  const status = params.get("status") ?? "";
  const membershipRole = params.get("membershipRole") ?? "";
  const emailVerified = params.get("emailVerified") ?? "";
  const urlSearch = params.get("search") ?? "";

  const [searchDraft, setSearchDraft] = useState(urlSearch);
  const search = useDebouncedValue(searchDraft, 350);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [target, setTarget] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const setParam = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === "" || value === null || value === undefined) next.delete(key);
            else next.set(key, String(value));
          }
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (search !== urlSearch) setParam({ search });
  }, [search, urlSearch, setParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    adminApi.users
      .list({
        page,
        limit: PAGE_SIZE,
        ...(urlSearch ? { search: urlSearch } : {}),
        ...(role ? { platformRole: role } : {}),
        ...(status ? { status } : {}),
        ...(membershipRole ? { membershipRole } : {}),
        ...(emailVerified ? { emailVerified } : {}),
      })
      .then(({ rows: data, pagination: meta }) => {
        if (cancelled) return;
        setRows(data);
        setPagination(meta);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: "Could not load users." }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, urlSearch, role, status, membershipRole, emailVerified, reloadToken]);

  useEffect(() => {
    document.title = "Users & Accounts · EduHub Admin";
  }, []);

  const reload = () => setReloadToken((n) => n + 1);

  /**
   * Mirrors the server's two refusals, so the UI explains them before the
   * click rather than after a 400. The server remains the enforcement point.
   */
  const blockedReason = (row) => {
    if (row.id === me?.id) return "You cannot change your own status";
    if (row.platformRole === "SUPER_ADMIN" && platformRole !== "SUPER_ADMIN") {
      return "Only a super admin can change a super admin";
    }
    return null;
  };

  const suspend = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await adminApi.users.changeStatus(
        target.id,
        target.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED",
      );
      setTarget(null);
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err, { fallback: "The change could not be saved." }));
    } finally {
      setActionBusy(false);
    }
  };

  const filtersApplied = Boolean(urlSearch || role || status || membershipRole || emailVerified);
  const reactivating = target?.status === "SUSPENDED";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & Accounts"
        description="Everyone with an account. Suspending someone ends their sessions immediately. Open an account to see its memberships and activity."
      />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="user-search"
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Name or email…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="user-role" className="sr-only">
            Filter by platform role
          </label>
          <Select
            id="user-role"
            value={role}
            placeholder="All platform roles"
            options={asOptions(PLATFORM_ROLES, humanise)}
            onChange={(e) => setParam({ platformRole: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="user-status" className="sr-only">
            Filter by status
          </label>
          <Select
            id="user-status"
            value={status}
            placeholder="All statuses"
            options={asOptions(USER_STATUSES, humanise)}
            onChange={(e) => setParam({ status: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="user-membership" className="sr-only">
            Filter by active institution role
          </label>
          <Select
            id="user-membership"
            value={membershipRole}
            placeholder="Any institution role"
            options={MEMBERSHIP_ROLES.map((r) => ({ value: r, label: `Active ${humanise(r).toLowerCase()}` }))}
            onChange={(e) => setParam({ membershipRole: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="user-verified" className="sr-only">
            Filter by email verification
          </label>
          <Select
            id="user-verified"
            value={emailVerified}
            placeholder="Any verification"
            options={VERIFIED_OPTIONS}
            onChange={(e) => setParam({ emailVerified: e.target.value })}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Person", "Platform role", "Status", "Email", "Institutions", "Registered", "Last login", ""].map(
                  (heading, i) => (
                    <th
                      key={heading || `actions-${i}`}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {heading || <span className="sr-only">Actions</span>}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <LoadingRow colSpan={COLUMNS} label="Loading users…" />}

              {!loading && error && (
                <ErrorRow colSpan={COLUMNS} message={error} onRetry={reload} />
              )}

              {!loading && !error && rows.length === 0 && (
                <EmptyRow
                  colSpan={COLUMNS}
                  title={filtersApplied ? "No users match these filters" : "No users yet"}
                  description={
                    filtersApplied ? "Try a different search term, role or status." : undefined
                  }
                  action={
                    filtersApplied ? (
                      <button
                        type="button"
                        onClick={() => setParams(new URLSearchParams(), { replace: true })}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Clear filters
                      </button>
                    ) : null
                  }
                />
              )}

              {!loading &&
                !error &&
                rows.map((row) => {
                  const blocked = blockedReason(row);
                  const isSuspended = row.status === "SUSPENDED";
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.fullName} size="sm" />
                          <div className="min-w-0">
                            <Link to={`/admin/users/${row.id}`} className="font-medium text-blue-800 hover:underline">
                              {row.fullName}
                            </Link>
                            {row.id === me?.id && (
                              <span className="ml-2 text-xs font-normal text-gray-500">(you)</span>
                            )}
                            <p className="truncate text-xs text-gray-500">{row.email}</p>
                            <p className="font-mono text-[10px] text-gray-400" title={row.id}>{row.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <PlatformRoleBadge role={row.platformRole} />
                      </td>
                      <td className="px-4 py-3">
                        <UserStatusBadge status={row.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        {row.emailVerifiedAt ? (
                          <span className="font-medium text-emerald-700">✓ Verified</span>
                        ) : (
                          <span className="text-amber-700">Not verified</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row._count?.memberships ?? 0}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {new Date(row.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {formatDateTime(row.lastLoginAt)}
                      </td>
                      <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          to={`/admin/users/${row.id}`}
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setTarget(row)}
                          disabled={blocked !== null}
                          title={blocked ?? undefined}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            isSuspended
                              ? "border-gray-300 text-gray-700 hover:bg-gray-100"
                              : "border-red-200 text-red-700 hover:bg-red-50"
                          }`}
                        >
                          {isSuspended ? "Reactivate" : "Suspend"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <Pagination
          pagination={pagination}
          disabled={loading}
          onChange={(next) => setParam({ page: next })}
        />
      </div>

      <ConfirmDialog
        open={target !== null}
        busy={actionBusy}
        error={actionError}
        destructive={!reactivating}
        title={reactivating ? `Reactivate ${target?.fullName}?` : `Suspend ${target?.fullName}?`}
        description={
          reactivating
            ? "They will be able to sign in again. They will need to log in fresh — their old sessions stay revoked."
            : "They are signed out of every device at once and cannot sign in again until reactivated. Nothing is deleted."
        }
        confirmLabel={reactivating ? "Reactivate" : "Suspend"}
        onConfirm={suspend}
        onCancel={() => {
          setTarget(null);
          setActionError(null);
        }}
      />
    </div>
  );
};

export default UsersListPage;
