import React from "react";

/**
 * Previous/next only, driven by the API's own `hasNext`/`hasPrevious`.
 *
 * Numbered page links are deliberately absent: with `total` the UI could draw
 * them, but every extra page button is another request, and the list is
 * search-and-filter driven rather than browsed page by page.
 */
const Pagination = ({ pagination, onChange, disabled = false }) => {
  if (!pagination || pagination.total === 0) return null;

  const { page, limit, total, totalPages, hasNext, hasPrevious } = pagination;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row">
      <p className="text-sm text-gray-600" aria-live="polite">
        Showing <span className="font-medium">{first}</span>–
        <span className="font-medium">{last}</span> of{" "}
        <span className="font-medium">{total}</span>
        {totalPages > 1 && (
          <span className="text-gray-400">
            {" "}
            · page {page} of {totalPages}
          </span>
        )}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={disabled || !hasPrevious}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={disabled || !hasNext}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Pagination;
