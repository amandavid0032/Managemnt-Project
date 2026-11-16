import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { PageHeader, Panel, PanelEmpty, PanelError, PanelLoading } from "../../components/admin/Panel.jsx";
import StatusChangeDialog from "../../components/admin/StatusChangeDialog.jsx";
import { InstitutionStatusBadge, humanise } from "../../components/ui/Badge.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { countryName, formatDate, formatDateTime } from "../../utils/format.js";

/**
 * The review queue.
 *
 * How the requested workflow maps onto the existing lifecycle (no new
 * status values, so no existing record or test changes meaning):
 *   DRAFT          → DRAFT
 *   PENDING_REVIEW → PENDING_REVIEW
 *   APPROVED       → PUBLISHED, with verifiedAt stamped the first time
 *   REJECTED       → back to DRAFT, with a required reason in the audit log
 *   SUSPENDED      → SUSPENDED
 */
const ApprovalsPage = () => {
  const [queue, setQueue] = useState(null);
  const [queueError, setQueueError] = useState(null);
  const [decisions, setDecisions] = useState(null);
  const [decisionsPage, setDecisionsPage] = useState(1);
  const [decisionsError, setDecisionsError] = useState(null);
  const [review, setReview] = useState(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    document.title = "Verification & Approvals · EduHub Admin";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setQueueError(null);
    adminApi
      .approvals()
      .then((d) => !cancelled && setQueue(d))
      .catch((err) => !cancelled && setQueueError(apiErrorMessage(err, { fallback: "Could not load the queue." })));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    setDecisionsError(null);
    adminApi
      .auditLogs({ action: "institution.status_changed", page: decisionsPage, limit: 15 })
      .then((d) => !cancelled && setDecisions(d))
      .catch((err) => !cancelled && setDecisionsError(apiErrorMessage(err, { fallback: "Could not load decisions." })));
    return () => {
      cancelled = true;
    };
  }, [decisionsPage, reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verification & Approvals"
        description="Institutions submitted for review. Approving publishes the record and marks it verified; rejecting returns it to draft with a reason. Every decision is recorded with the reviewer's name."
      />

      <Panel
        title="Waiting for review"
        description={queue ? `${queue.total} submission${queue.total === 1 ? "" : "s"}, oldest first.` : undefined}
        bodyClassName="p-0"
      >
        {queueError && <div className="p-5"><PanelError message={queueError} onRetry={refresh} /></div>}
        {!queue && !queueError && <div className="px-5"><PanelLoading label="Loading queue…" /></div>}
        {queue && queue.rows.length === 0 && <PanelEmpty>Nothing is waiting for review.</PanelEmpty>}
        {queue && queue.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Institution</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Country</th>
                  <th className="px-3 py-3">Submitted</th>
                  <th className="px-3 py-3">Verification</th>
                  <th className="px-5 py-3 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.rows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link to={`/admin/institutions/${p.id}`} className="font-medium text-slate-900 hover:text-blue-700">{p.name}</Link>
                      <p className="text-xs text-slate-500">{p.city ?? "City not given"}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{humanise(p.category)}{p.typeLabel && <span className="text-slate-400"> · {p.typeLabel}</span>}</td>
                    <td className="px-3 py-3 text-slate-700">{countryName(p.countryCode)}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {p.submittedAt ? formatDate(p.submittedAt) : <span className="text-slate-400" title="Submitted before the audit log existed, or imported as pending">Not recorded</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{p.verifiedAt ? `Verified ${formatDate(p.verifiedAt)}` : "Never verified"}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Link to={`/admin/institutions/${p.id}`} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Inspect</Link>
                        <button type="button" onClick={() => setReview({ institution: { ...p, status: "PENDING_REVIEW" }, status: "PUBLISHED" })} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button>
                        <button type="button" onClick={() => setReview({ institution: { ...p, status: "PENDING_REVIEW" }, status: "DRAFT" })} className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50">Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Submitted documents: not supported yet — there is no file storage, so institutions cannot upload evidence. Review against the record's own details and website.
        </p>
      </Panel>

      <Panel title="Decision history" description="Every status change, newest first, with who made it and why." bodyClassName="p-0">
        {decisionsError && <div className="p-5"><PanelError message={decisionsError} onRetry={refresh} /></div>}
        {!decisions && !decisionsError && <div className="px-5"><PanelLoading /></div>}
        {decisions && decisions.rows.length === 0 && <PanelEmpty>No decisions recorded yet.</PanelEmpty>}
        {decisions && decisions.rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">When</th>
                    <th className="px-3 py-3">Institution</th>
                    <th className="px-3 py-3">Change</th>
                    <th className="px-3 py-3">Reviewer</th>
                    <th className="px-5 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {decisions.rows.map((d) => (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDateTime(d.createdAt)}</td>
                      <td className="px-3 py-3">
                        {d.targetLabel ? <Link to={`/admin/institutions/${d.targetId}`} className="text-slate-900 hover:text-blue-700">{d.targetLabel}</Link> : <span className="text-slate-400">Archived record</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {d.metadata.decision && (
                            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${d.metadata.decision === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{humanise(d.metadata.decision)}</span>
                          )}
                          <InstitutionStatusBadge status={d.metadata.from} />
                          <span className="text-slate-400" aria-label="to">→</span>
                          <InstitutionStatusBadge status={d.metadata.to} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{d.actor?.fullName ?? "—"}<span className="block text-xs text-slate-400">{humanise(d.actorRole)}</span></td>
                      <td className="px-5 py-3 text-slate-700">{d.metadata.reason ?? <span className="text-slate-400">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={decisions.pagination} onChange={setDecisionsPage} />
          </>
        )}
      </Panel>

      <StatusChangeDialog
        action={review}
        onCancel={() => setReview(null)}
        onDone={() => {
          setReview(null);
          refresh();
        }}
      />
    </div>
  );
};

export default ApprovalsPage;
