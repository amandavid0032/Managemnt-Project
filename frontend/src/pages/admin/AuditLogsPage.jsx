import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { ACTION_LABEL, AUDIT_ACTIONS, describeAudit } from "../../components/admin/auditText.js";
import { PageHeader } from "../../components/admin/Panel.jsx";
import { humanise } from "../../components/ui/Badge.jsx";
import { Select } from "../../components/ui/Field.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { EmptyRow, ErrorRow, LoadingRow } from "../../components/ui/TableStates.jsx";
import { downloadText, formatDateTime, toCsv } from "../../utils/format.js";

const COLUMNS = 5;

const targetHref = (e) =>
  e.targetType === "institution" ? `/admin/institutions/${e.targetId}` : e.targetType === "user" ? `/admin/users/${e.targetId}` : e.institutionId ? `/admin/institutions/${e.institutionId}` : null;

/**
 * Read-only by construction: the API has no route to change an entry and the
 * database rejects UPDATE and DELETE on the table.
 */
const AuditLogsPage = () => {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const action = params.get("action") ?? "";
  const targetType = params.get("targetType") ?? "";
  const targetId = params.get("targetId") ?? "";
  const actorUserId = params.get("actorUserId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    document.title = "Audit logs · EduHub Admin";
  }, []);

  const setParam = useCallback(
    (patch) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) (v ? next.set(k, String(v)) : next.delete(k));
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const query = {
    page,
    limit: 25,
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetId ? { targetId } : {}),
    ...(actorUserId ? { actorUserId } : {}),
    ...(from ? { from: `${from}T00:00:00Z` } : {}),
    ...(to ? { to: `${to}T23:59:59Z` } : {}),
  };
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .auditLogs(JSON.parse(queryKey))
      .then(({ rows: r, pagination: p }) => {
        if (cancelled) return;
        setRows(r);
        setPagination(p);
      })
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "Could not load the audit log." })))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryKey, reload]);

  const exportPage = () =>
    downloadText(
      `eduhub-audit-page-${page}.csv`,
      toCsv(
        [
          { label: "timestamp", value: (e) => e.createdAt },
          { label: "actor_id", value: (e) => e.actorUserId },
          { label: "actor_email", value: (e) => e.actor?.email },
          { label: "actor_role", value: (e) => e.actorRole },
          { label: "action", value: (e) => e.action },
          { label: "target_type", value: (e) => e.targetType },
          { label: "target_id", value: (e) => e.targetId },
          { label: "institution_id", value: (e) => e.institutionId },
          { label: "ip_address", value: (e) => e.ipAddress },
          { label: "metadata", value: (e) => JSON.stringify(e.metadata) },
        ],
        rows,
      ),
    );

  const filtered = Boolean(action || targetType || targetId || actorUserId || from || to);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit logs"
        description="Every administrative change: who, what, to which record, from which IP, and when. Entries cannot be edited or deleted — the database refuses it. Recording began with this release."
        actions={
          rows.length > 0 && (
            <button type="button" onClick={exportPage} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Export this page (CSV)
            </button>
          )
        }
      />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="audit-action" className="mb-1 block text-xs font-medium text-slate-600">Action</label>
          <Select id="audit-action" value={action} placeholder="All actions" options={AUDIT_ACTIONS.map((a) => ({ value: a, label: ACTION_LABEL[a] }))} onChange={(e) => setParam({ action: e.target.value })} />
        </div>
        <div>
          <label htmlFor="audit-target" className="mb-1 block text-xs font-medium text-slate-600">Record type</label>
          <Select id="audit-target" value={targetType} placeholder="All types" options={["institution", "user", "membership"].map((t) => ({ value: t, label: humanise(t) }))} onChange={(e) => setParam({ targetType: e.target.value })} />
        </div>
        <div>
          <label htmlFor="audit-from" className="mb-1 block text-xs font-medium text-slate-600">From</label>
          <input id="audit-from" type="date" value={from} onChange={(e) => setParam({ from: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="audit-to" className="mb-1 block text-xs font-medium text-slate-600">To</label>
          <input id="audit-to" type="date" value={to} onChange={(e) => setParam({ to: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        {(targetId || actorUserId) && (
          <p className="text-xs text-slate-600 sm:col-span-2 lg:col-span-4">
            Showing entries for one {targetId ? "record" : "actor"} only.{" "}
            <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setParam({ targetId: "", actorUserId: "" })}>Show all</button>
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">IP address</th>
                <th className="px-4 py-3"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <LoadingRow colSpan={COLUMNS} label="Loading audit log…" />}
              {!loading && error && <ErrorRow colSpan={COLUMNS} message={error} onRetry={() => setReload((n) => n + 1)} />}
              {!loading && !error && rows.length === 0 && (
                <EmptyRow colSpan={COLUMNS} title={filtered ? "No entries match these filters" : "No entries yet"} description={filtered ? undefined : "Entries appear as soon as an administrator changes something."} />
              )}
              {!loading &&
                !error &&
                rows.map((e) => {
                  const href = targetHref(e);
                  return (
                    <React.Fragment key={e.id}>
                      <tr className="align-top hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(e.createdAt)}</td>
                        <td className="px-4 py-3">
                          {e.actor ? (
                            <Link to={`/admin/users/${e.actorUserId}`} className="font-medium text-slate-900 hover:text-blue-700">{e.actor.fullName}</Link>
                          ) : (
                            <span className="text-slate-500">{e.actorUserId ? "Unknown user" : "System"}</span>
                          )}
                          <span className="block text-xs text-slate-500">{humanise(e.actorRole)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{ACTION_LABEL[e.action] ?? e.action}</span>
                          {href ? <Link to={href} className="hover:text-blue-700">{describeAudit(e)}</Link> : describeAudit(e)}
                          {e.metadata?.reason && <span className="mt-0.5 block text-xs text-slate-500">Reason: “{e.metadata.reason}”</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{e.ipAddress ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id} className="text-xs font-medium text-blue-700 hover:underline">
                            {open === e.id ? "Hide" : "Raw"}
                          </button>
                        </td>
                      </tr>
                      {open === e.id && (
                        <tr>
                          <td colSpan={COLUMNS} className="bg-slate-50 px-4 py-3">
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-700">
                              {JSON.stringify({ id: e.id, actorUserId: e.actorUserId, targetType: e.targetType, targetId: e.targetId, institutionId: e.institutionId, userAgent: e.userAgent, metadata: e.metadata }, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
        <Pagination pagination={pagination} disabled={loading} onChange={(p) => setParam({ page: p })} />
      </div>
    </div>
  );
};

export default AuditLogsPage;
