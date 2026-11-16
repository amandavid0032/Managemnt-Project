import React, { useEffect, useRef } from "react";

/**
 * Confirmation for an action that is hard to undo.
 *
 * Built in React rather than with `window.confirm`: a native dialog blocks the
 * whole JavaScript thread, cannot say what will actually happen, and cannot
 * show the error if the request then fails.
 *
 * Escape closes it and focus moves to the confirm button on open, so the
 * dialog is operable without a mouse.
 */
const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  children = null,
}) => {
  const confirmRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    // A dialog that asks for input (a reason) focuses the input; otherwise the
    // confirm button.
    const field = dialogRef.current?.querySelector("textarea, input, select");
    (field ?? confirmRef.current)?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Clicking the backdrop cancels, but never while a request is in flight. */}
      <div
        className="absolute inset-0 bg-gray-900/50"
        onClick={() => !busy && onCancel()}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
        {children && <div className="mt-4">{children}</div>}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              destructive
                ? "bg-red-700 hover:bg-red-800 focus:ring-red-500"
                : "bg-blue-700 hover:bg-blue-800 focus:ring-blue-500"
            } focus:outline-none focus:ring-2 focus:ring-offset-2`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
