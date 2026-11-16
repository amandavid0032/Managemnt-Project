import React from "react";

/** Spans the whole table so the message sits in the body, not beside it. */
const Row = ({ colSpan, children }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-12 text-center">
      {children}
    </td>
  </tr>
);

export const LoadingRow = ({ colSpan, label = "Loading…" }) => (
  <Row colSpan={colSpan}>
    <div className="flex items-center justify-center gap-3 text-gray-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-700" />
      {label}
    </div>
  </Row>
);

export const ErrorRow = ({ colSpan, message, onRetry }) => (
  <Row colSpan={colSpan}>
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Try again
      </button>
    )}
  </Row>
);

/**
 * An empty table because nothing exists and an empty table because a filter
 * excluded everything are different problems with different fixes, so the
 * caller passes the message that fits.
 */
export const EmptyRow = ({ colSpan, title, description, action = null }) => (
  <Row colSpan={colSpan}>
    <p className="text-sm font-medium text-gray-900">{title}</p>
    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </Row>
);
