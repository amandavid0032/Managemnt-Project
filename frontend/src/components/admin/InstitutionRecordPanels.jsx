import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import adminApi from "../../api/adminApi.js";
import schoolApi from "../../api/schoolApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { ACTION_LABEL, describeAudit } from "./auditText.js";
import { Panel, PanelEmpty, PanelError, PanelLink, PanelLoading } from "./Panel.jsx";
import { InstitutionStatusBadge, humanise } from "../ui/Badge.jsx";
import { formatDate, formatDateTime, formatNumber } from "../../utils/format.js";

const Fact = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-2 text-sm">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-medium text-slate-900">{children ?? "—"}</dd>
  </div>
);

/**
 * Verification facts, member counts, publication history and every recorded
 * admin action for one institution. `refreshKey` changes after a status
 * change so the history picks it up.
 */
const InstitutionRecordPanels = ({ institution, refreshKey }) => {
  const id = institution.id;
  const [counts, setCounts] = useState(null);
  const [countsError, setCountsError] = useState(null);
  const [history, setHistory] = useState(null);
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCountsError(null);
    // Platform staff read the overview through the API's explicit override.
    schoolApi
      .overview(id)
      .then((o) => !cancelled && setCounts(o.members))
      .catch((err) => !cancelled && setCountsError(apiErrorMessage(err, { fallback: "Could not load member counts." })));
    Promise.all([
      adminApi.auditLogs({ targetId: id, action: "institution.status_changed", limit: 20 }),
      // Everything about this institution: edits to the record and changes to its memberships.
      Promise.all([adminApi.auditLogs({ targetId: id, limit: 15 }), adminApi.auditLogs({ institutionId: id, limit: 15 })]),
    ])
      .then(([h, [onRecord, inside]]) => {
        if (cancelled) return;
        setHistory(h.rows);
        setActivity(
          [...onRecord.rows, ...inside.rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 15),
        );
      })
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "Could not load history." })));
    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="Verification & membership">
        <dl className="divide-y divide-slate-100">
          <Fact label="Verified">{institution.verifiedAt ? `First approved ${formatDate(institution.verifiedAt)}` : "Never approved"}</Fact>
          <Fact label="Data source">{humanise(institution.source)}</Fact>
          <Fact label="Registered">{formatDateTime(institution.createdAt)}</Fact>
          <Fact label="Last changed">{formatDateTime(institution.updatedAt)}</Fact>
        </dl>
        <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Active members</h3>
        {countsError && <PanelError message={countsError} />}
        {!counts && !countsError && <PanelLoading />}
        {counts && (
          <dl className="divide-y divide-slate-100">
            <Fact label="Students">{formatNumber(counts.active.students)}</Fact>
            <Fact label="Teachers">{formatNumber(counts.active.teachers)}</Fact>
            <Fact label="Staff">{formatNumber(counts.active.staff)}</Fact>
            <Fact label="Administrators">{formatNumber(counts.active.administrators)}</Fact>
            <Fact label="Pending / suspended / former">
              {counts.pending} / {counts.suspended} / {counts.former}
            </Fact>
          </dl>
        )}
      </Panel>

      <Panel title="Publication history" description="Status changes, with reviewer and reason.">
        {error && <PanelError message={error} />}
        {!history && !error && <PanelLoading />}
        {history && history.length === 0 && <PanelEmpty>No status changes recorded since the audit log began.</PanelEmpty>}
        {history && history.length > 0 && (
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  {h.metadata.decision && (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${h.metadata.decision === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{humanise(h.metadata.decision)}</span>
                  )}
                  <InstitutionStatusBadge status={h.metadata.from} />
                  <span className="text-slate-400">→</span>
                  <InstitutionStatusBadge status={h.metadata.to} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {h.actor?.fullName ?? "Unknown"} · {formatDateTime(h.createdAt)}
                </p>
                {h.metadata.reason && <p className="mt-0.5 text-xs text-slate-700">“{h.metadata.reason}”</p>}
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Administrative activity" action={<PanelLink to={`/admin/audit-logs?targetId=${id}`}>Audit log</PanelLink>}>
        {error && <PanelError message={error} />}
        {!activity && !error && <PanelLoading />}
        {activity && activity.length === 0 && <PanelEmpty>No recorded actions yet.</PanelEmpty>}
        {activity && activity.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {activity.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{ACTION_LABEL[e.action]}</span>
                <span className="text-slate-800">
                  {e.actor ? <Link to={`/admin/users/${e.actorUserId}`} className="font-medium hover:text-blue-700">{e.actor.fullName}</Link> : "System"} {describeAudit(e)}
                </span>
                <span className="block text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};

export default InstitutionRecordPanels;
