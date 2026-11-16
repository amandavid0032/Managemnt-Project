import React, { useEffect, useState } from "react";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { humanise } from "../ui/Badge.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import { TRANSITION_DESCRIPTION } from "../../pages/admin/enums.js";

/**
 * Every institution status change goes through this one dialog, so the
 * review rules are the same on every screen: a rejection needs a reason (the
 * API refuses one without), a suspension may have one, and both end up in the
 * audit log.
 *
 * `action` is { institution, status } or null.
 */
export const isRejection = (from, to) => from === "PENDING_REVIEW" && to === "DRAFT";

export const transitionLabel = (from, to) => {
  if (from === "PENDING_REVIEW" && to === "PUBLISHED") return "Approve & publish";
  if (isRejection(from, to)) return "Reject";
  if (to === "PUBLISHED") return from === "SUSPENDED" ? "Reactivate" : "Publish";
  if (to === "PENDING_REVIEW") return "Submit for review";
  if (to === "DRAFT") return "Unpublish";
  if (to === "SUSPENDED") return "Suspend";
  return humanise(to);
};

const StatusChangeDialog = ({ action, onDone, onCancel }) => {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setReason("");
    setError(null);
  }, [action]);

  if (!action) return null;
  const { institution, status } = action;
  const rejecting = isRejection(institution.status, status);
  const asksReason = rejecting || status === "SUSPENDED" || (status === "DRAFT" && institution.status === "PUBLISHED");
  const trimmed = reason.trim();

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.institutions.changeStatus(institution.id, status, trimmed || undefined);
      onDone(updated);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: "The change could not be saved." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open
      busy={busy}
      error={error}
      destructive={rejecting || status === "SUSPENDED"}
      title={`${transitionLabel(institution.status, status)}: ${institution.name}?`}
      description={
        rejecting
          ? "The submission goes back to draft and stays hidden from the public. Your reason is recorded in the audit log with your name."
          : TRANSITION_DESCRIPTION[status]
      }
      confirmLabel={transitionLabel(institution.status, status)}
      confirmDisabled={rejecting && trimmed.length < 3}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      {asksReason && (
        <div>
          <label htmlFor="status-reason" className="block text-sm font-medium text-slate-700">
            Reason {rejecting ? <span className="text-red-600">*</span> : <span className="font-normal text-slate-500">(optional)</span>}
          </label>
          <textarea
            id="status-reason"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={rejecting ? "What must change before this can be approved?" : "Recorded in the audit log"}
          />
          {rejecting && <p className="mt-1 text-xs text-slate-500">At least 3 characters.</p>}
        </div>
      )}
    </ConfirmDialog>
  );
};

export default StatusChangeDialog;
