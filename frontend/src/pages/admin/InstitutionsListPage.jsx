import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaPlus, FaSearch } from "react-icons/fa";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { InstitutionStatusBadge, humanise } from "../../components/ui/Badge.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import StatusChangeDialog, { transitionLabel } from "../../components/admin/StatusChangeDialog.jsx";
import { PageHeader } from "../../components/admin/Panel.jsx";
import { countryName, formatDate } from "../../utils/format.js";
import Pagination from "../../components/ui/Pagination.jsx";
import { EmptyRow, ErrorRow, LoadingRow } from "../../components/ui/TableStates.jsx";
import { Select } from "../../components/ui/Field.jsx";
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import {
  INSTITUTION_CATEGORIES,
  INSTITUTION_STATUSES,
  INSTITUTION_STATUS_TRANSITIONS,
  asOptions,
} from "./enums.js";

const COLUMNS = 8;
const PAGE_SIZE = 20;

/**
 * The first gallery image, the same one the public card shows. Without one,
 * initials — never a stock picture that would suggest a real logo.
 */
const Logo = ({ inst }) => {
  const [failed, setFailed] = useState(false);
  const img = inst.media?.[0];
  if (img && !failed) {
    return (
      <img
        src={img.url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-10 w-10 flex-none rounded-lg border border-slate-200 object-cover"
      />
    );
  }
  const letters = inst.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
      {letters}
    </span>
  );
};

const VERIFIED_OPTIONS = [
  { value: "true", label: "Verified" },
  { value: "false", label: "Never verified" },
];

const InstitutionsListPage = () => {
  /**
   * Filters live in the URL, not component state. A filtered list is then
   * shareable and survives a reload or a back-navigation from an edit screen —
   * which matters a lot when working through a review queue.
   */
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const status = params.get("status") ?? "";
  const category = params.get("category") ?? "";
  const countryCode = params.get("countryCode") ?? "";
  const verified = params.get("verified") ?? "";
  const urlSearch = params.get("search") ?? "";

  const [searchDraft, setSearchDraft] = useState(urlSearch);
  const search = useDebouncedValue(searchDraft, 350);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Countries that actually have institutions, for the country filter.
  const [countries, setCountries] = useState([]);
  useEffect(() => {
    adminApi
      .distribution()
      .then((d) => setCountries(d.institutions.byCountry.map((c) => c.countryCode)))
      .catch(() => setCountries([]));
    document.title = "Institutions · EduHub Admin";
  }, []);

  // Pending status change (handled by StatusChangeDialog) or archive.
  const [statusAction, setStatusAction] = useState(null);
  const [action, setAction] = useState(null);
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
          // Any filter change invalidates the current page number.
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Keep the URL in step with the debounced search box.
  useEffect(() => {
    if (search !== urlSearch) setParam({ search });
  }, [search, urlSearch, setParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    adminApi.institutions
      .list({
        page,
        limit: PAGE_SIZE,
        sortBy: "updatedAt",
        sortOrder: "desc",
        ...(urlSearch ? { search: urlSearch } : {}),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(countryCode ? { countryCode } : {}),
        ...(verified ? { verified } : {}),
      })
      .then(({ rows: data, pagination: meta }) => {
        if (cancelled) return;
        setRows(data);
        setPagination(meta);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, { fallback: "Could not load institutions." }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, urlSearch, status, category, countryCode, verified, reloadToken]);

  const reload = () => setReloadToken((n) => n + 1);

  const runAction = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await adminApi.institutions.remove(action.institution.id);
      setAction(null);
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err, { fallback: "The change could not be saved." }));
    } finally {
      setActionBusy(false);
    }
  };

  const filtersApplied = Boolean(urlSearch || status || category || countryCode || verified);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Institutions"
        description="Every institution on the platform. Create records, review submissions, publish, suspend and archive."
        actions={
          <Link
            to="/admin/institutions/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            <FaPlus aria-hidden="true" />
            New institution
          </Link>
        }
      />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="inst-search" className="sr-only">
            Search institutions
          </label>
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="inst-search"
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Name or city…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="inst-status" className="sr-only">
            Filter by status
          </label>
          <Select
            id="inst-status"
            value={status}
            placeholder="All statuses"
            options={asOptions(INSTITUTION_STATUSES, humanise)}
            onChange={(e) => setParam({ status: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="inst-category" className="sr-only">
            Filter by category
          </label>
          <Select
            id="inst-category"
            value={category}
            placeholder="All categories"
            options={asOptions(INSTITUTION_CATEGORIES, humanise)}
            onChange={(e) => setParam({ category: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="inst-country" className="sr-only">
            Filter by country
          </label>
          <Select
            id="inst-country"
            value={countryCode}
            placeholder="All countries"
            options={[...new Set([...countries, ...(countryCode ? [countryCode] : [])])]
              .map((c) => ({ value: c, label: `${countryName(c)} (${c})` }))
              .sort((a, b) => a.label.localeCompare(b.label))}
            onChange={(e) => setParam({ countryCode: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="inst-verified" className="sr-only">
            Filter by verification
          </label>
          <Select
            id="inst-verified"
            value={verified}
            placeholder="Any verification"
            options={VERIFIED_OPTIONS}
            onChange={(e) => setParam({ verified: e.target.value })}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Institution", "Type", "Location", "Contact", "Verification", "Status", "Registered", ""].map((heading, i) => (
                  <th
                    key={heading || `actions-${i}`}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {heading || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <LoadingRow colSpan={COLUMNS} label="Loading institutions…" />}

              {!loading && error && (
                <ErrorRow colSpan={COLUMNS} message={error} onRetry={reload} />
              )}

              {!loading && !error && rows.length === 0 && (
                <EmptyRow
                  colSpan={COLUMNS}
                  title={filtersApplied ? "No institutions match these filters" : "No institutions yet"}
                  description={
                    filtersApplied
                      ? "Try a different search term or remove a filter."
                      : "Create the first record to get started."
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
                    ) : (
                      <Link
                        to="/admin/institutions/new"
                        className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800"
                      >
                        New institution
                      </Link>
                    )
                  }
                />
              )}

              {!loading &&
                !error &&
                rows.map((inst) => {
                  const transitions = INSTITUTION_STATUS_TRANSITIONS[inst.status] ?? [];
                  return (
                    <tr key={inst.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Logo inst={inst} />
                          <div className="min-w-0">
                            <Link
                              to={`/admin/institutions/${inst.id}`}
                              className="font-medium text-blue-800 hover:underline"
                            >
                              {inst.name}
                            </Link>
                            <p className="truncate text-xs text-gray-500">{inst.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {humanise(inst.category)}
                        {inst.typeLabel && (
                          <span className="block text-xs text-gray-400">{inst.typeLabel}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {inst.city || "—"}
                        <span className="block text-xs text-gray-500">
                          {[inst.state, countryName(inst.countryCode)].filter(Boolean).join(", ")}
                        </span>
                      </td>
                      <td className="max-w-[14rem] px-4 py-3 text-xs">
                        {inst.website ? (
                          <a href={inst.website} target="_blank" rel="noopener noreferrer" className="block truncate text-blue-700 hover:underline">
                            {inst.website.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <span className="block text-gray-400">No website</span>
                        )}
                        <span className="block truncate text-gray-500">{inst.email ?? "No email"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        {inst.verifiedAt ? (
                          <span className="font-medium text-emerald-700" title={`First approved ${formatDate(inst.verifiedAt)}`}>✓ Verified</span>
                        ) : (
                          <span className="text-gray-500">Never verified</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <InstitutionStatusBadge status={inst.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {formatDate(inst.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {transitions.map((target) => (
                            <button
                              key={target}
                              type="button"
                              onClick={() => setStatusAction({ institution: inst, status: target })}
                              className="whitespace-nowrap rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
                            >
                              {transitionLabel(inst.status, target)}
                            </button>
                          ))}
                          <Link
                            to={`/admin/institutions/${inst.id}`}
                            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
                          >
                            View / edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => setAction({ kind: "delete", institution: inst })}
                            className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
                          >
                            Archive
                          </button>
                        </div>
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

      <StatusChangeDialog
        action={statusAction}
        onCancel={() => setStatusAction(null)}
        onDone={() => {
          setStatusAction(null);
          reload();
        }}
      />

      <ConfirmDialog
        open={action !== null}
        busy={actionBusy}
        error={actionError}
        destructive
        title={`Archive ${action?.institution.name}?`}
        description="The record is archived and hidden everywhere, but kept in the database for audit. Its URL slug becomes available for reuse. The archive is recorded in the audit log."
        confirmLabel="Archive"
        onConfirm={runAction}
        onCancel={() => {
          setAction(null);
          setActionError(null);
        }}
      />
    </div>
  );
};

export default InstitutionsListPage;
