import React, { useCallback, useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import schoolApi from "../../api/schoolApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import { MembershipStatusBadge, humanise } from "../ui/Badge.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import { Select } from "../ui/Field.jsx";
import Pagination from "../ui/Pagination.jsx";
import { EmptyRow, ErrorRow, LoadingRow } from "../ui/TableStates.jsx";
import AddMemberForm, { MEMBERSHIP_ROLES } from "./AddMemberForm.jsx";

const COLUMNS = 6;
const PAGE_SIZE = 15;
const STATUSES = ["ACTIVE", "SUSPENDED", "LEFT", "PENDING"];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

/** What each status action does, written for the confirmation dialog. */
const ACTIONS = {
  SUSPENDED: {
    label: "Suspend",
    done: (m) => `${m.user.fullName}'s membership is suspended.`,
    title: "Suspend this membership?",
    description: (m) =>
      `${m.user.fullName} immediately loses access to anything at this institution that needs their membership. Nothing is deleted, and you can reinstate them later.`,
    destructive: true,
  },
  ACTIVE: {
    label: "Reinstate",
    done: (m) => `${m.user.fullName}'s membership is active again.`,
    title: "Reinstate this membership?",
    description: (m) => `${m.user.fullName} regains access as ${humanise(m.role)}.`,
    destructive: false,
  },
  LEFT: {
    label: "End",
    done: (m) => `${m.user.fullName}'s membership has ended and is kept as history.`,
    title: "End this membership?",
    description: (m) =>
      `${m.user.fullName} stops being a ${humanise(m.role).toLowerCase()} here today. The membership stays in their education history with today as the end date. This cannot be undone — to bring them back, add them again.`,
    destructive: true,
  },
};

/**
 * Members of one institution, with management for those allowed to manage.
 *
 * Used by both the school dashboard and the platform admin's institution
 * screen. `canManage` only decides which controls are SHOWN — the API
 * independently refuses every change from anyone who is not an
 * INSTITUTION_ADMIN there (or platform staff).
 */
const MembersPanel = ({ institutionId, canManage = false, onChanged }) => {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebouncedValue(searchDraft.trim(), 350);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(null);

  const [pending, setPending] = useState(null); // { member, status }
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const [roleEdit, setRoleEdit] = useState(null); // { member, role }
  const [roleError, setRoleError] = useState(null);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // A new filter starts from the first page.
  useEffect(() => setPage(1), [role, status, search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    schoolApi.members
      .list(institutionId, {
        page,
        limit: PAGE_SIZE,
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      })
      .then(({ rows: data, pagination: meta }) => {
        if (cancelled) return;
        setRows(data);
        setPagination(meta);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: "Could not load members." }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId, page, role, status, search, reloadToken]);

  const afterChange = (message) => {
    setNotice(message);
    reload();
    onChanged?.();
  };

  const confirmStatus = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await schoolApi.members.changeStatus(institutionId, pending.member.id, pending.status);
      afterChange(ACTIONS[pending.status].done(pending.member));
      setPending(null);
    } catch (err) {
      setActionError(apiErrorMessage(err, { fallback: "Could not change this membership." }));
    } finally {
      setActionBusy(false);
    }
  };

  const saveRole = async () => {
    setActionBusy(true);
    setRoleError(null);
    try {
      await schoolApi.members.update(institutionId, roleEdit.member.id, { role: roleEdit.role });
      afterChange(`${roleEdit.member.user.fullName} is now ${humanise(roleEdit.role)}.`);
      setRoleEdit(null);
    } catch (err) {
      setRoleError(apiErrorMessage(err, { fallback: "Could not change the role." }));
    } finally {
      setActionBusy(false);
    }
  };

  const filtered = Boolean(role || status || search);

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {canManage
              ? "Add people, change their role, suspend or end memberships. Ended memberships stay as history."
              : "Students, teachers, staff and administrators. Only administrators can make changes."}
          </p>
        </div>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setNotice(null);
            }}
            className="whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Add member
          </button>
        )}
      </div>

      {adding && (
        <AddMemberForm
          institutionId={institutionId}
          onCancel={() => setAdding(false)}
          onAdded={(created) => {
            setAdding(false);
            afterChange(`${created.user.fullName} added as ${humanise(created.role)}.`);
          }}
        />
      )}

      {notice && (
        <p role="status" className="border-t border-green-100 bg-green-50 px-5 py-2 text-sm text-green-800">
          {notice}
        </p>
      )}

      <div className="grid gap-3 border-t border-gray-100 px-5 py-3 sm:grid-cols-3">
        <div className="relative">
          <label htmlFor="member-search" className="sr-only">
            Search members
          </label>
          <FaSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="member-search"
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Name, email or member ID"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Select
          id="member-role-filter"
          aria-label="Filter by role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="All roles"
          options={MEMBERSHIP_ROLES.map((r) => ({ value: r, label: humanise(r) }))}
        />
        <Select
          id="member-status-filter"
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="All statuses"
          options={STATUSES.map((s) => ({ value: s, label: s === "LEFT" ? "Former (ended)" : humanise(s) }))}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Person", "Role", "Status", "Member ID", "Dates", canManage ? "Actions" : ""].map((heading, i) => (
                <th
                  key={heading || `col-${i}`}
                  scope="col"
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <LoadingRow colSpan={COLUMNS} label="Loading members…" />}
            {!loading && error && <ErrorRow colSpan={COLUMNS} message={error} onRetry={reload} />}
            {!loading && !error && rows.length === 0 && (
              <EmptyRow
                colSpan={COLUMNS}
                title={filtered ? "No members match these filters" : "No members yet"}
                description={
                  filtered
                    ? "Try clearing the search or filters."
                    : canManage
                      ? "Use “Add member” to link the first person to this institution."
                      : "Nobody has been linked to this institution yet."
                }
              />
            )}

            {!loading &&
              !error &&
              rows.map((member) => {
                const ended = member.status === "LEFT";
                const editingRole = roleEdit?.member.id === member.id;
                return (
                  <tr key={member.id} className={ended ? "bg-gray-50 text-gray-500" : "hover:bg-gray-50"}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{member.user?.fullName ?? "—"}</p>
                      <p className="text-xs text-gray-500">{member.user?.email}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {editingRole ? (
                        <div className="flex min-w-[12rem] flex-col gap-1">
                          <Select
                            id={`role-${member.id}`}
                            aria-label="New role"
                            value={roleEdit.role}
                            onChange={(e) => setRoleEdit({ ...roleEdit, role: e.target.value })}
                            options={MEMBERSHIP_ROLES.map((r) => ({ value: r, label: humanise(r) }))}
                            disabled={actionBusy}
                          />
                          {roleError && (
                            <span role="alert" className="text-xs text-red-700">
                              {roleError}
                            </span>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={saveRole}
                              disabled={actionBusy || roleEdit.role === member.role}
                              className="rounded bg-blue-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setRoleEdit(null)}
                              disabled={actionBusy}
                              className="px-2 py-1 text-xs text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        humanise(member.role)
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <MembershipStatusBadge status={member.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-500">{member.institutionMemberId || "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                      {formatDate(member.joinedAt)}
                      {member.leftAt && <span> – {formatDate(member.leftAt)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {canManage && !ended && !editingRole && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRoleError(null);
                              setRoleEdit({ member, role: member.role });
                            }}
                            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Change role
                          </button>
                          {member.status === "ACTIVE" && (
                            <button
                              type="button"
                              onClick={() => {
                                setActionError(null);
                                setPending({ member, status: "SUSPENDED" });
                              }}
                              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Suspend
                            </button>
                          )}
                          {(member.status === "SUSPENDED" || member.status === "PENDING") && (
                            <button
                              type="button"
                              onClick={() => {
                                setActionError(null);
                                setPending({ member, status: "ACTIVE" });
                              }}
                              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Reinstate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setPending({ member, status: "LEFT" });
                            }}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            End
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <Pagination pagination={pagination} disabled={loading} onChange={setPage} />

      <ConfirmDialog
        open={pending !== null}
        title={pending ? ACTIONS[pending.status].title : ""}
        description={pending ? ACTIONS[pending.status].description(pending.member) : ""}
        confirmLabel={pending ? ACTIONS[pending.status].label : "Confirm"}
        destructive={pending ? ACTIONS[pending.status].destructive : false}
        busy={actionBusy}
        error={actionError}
        onConfirm={confirmStatus}
        onCancel={() => setPending(null)}
      />
    </section>
  );
};

export default MembersPanel;
