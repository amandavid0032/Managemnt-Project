import React, { useEffect, useState } from "react";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { downloadText, formatNumber, toCsv } from "../../utils/format.js";
import { TimeBarChart } from "./Charts.jsx";
import { Panel, PanelError, PanelLoading } from "./Panel.jsx";

const GRANULARITIES = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

const toInputDate = (d) => d.toISOString().slice(0, 10);

const label = (granularity) => (iso, long) => {
  const d = new Date(iso);
  const opts = { timeZone: "UTC" };
  if (granularity === "year") return String(d.getUTCFullYear());
  if (granularity === "month") return d.toLocaleDateString(undefined, { ...opts, month: "short", ...(long || d.getUTCMonth() === 0 ? { year: "numeric" } : {}) });
  if (long) return `${granularity === "week" ? "Week of " : ""}${d.toLocaleDateString(undefined, { ...opts, dateStyle: "medium" })}`;
  return d.toLocaleDateString(undefined, { ...opts, day: "numeric", month: "short" });
};

/**
 * New accounts and institutions per period. Empty dates mean "the API's
 * default window for this granularity". All buckets are UTC — said on screen,
 * because a day boundary that moves with the viewer's timezone would make two
 * admins see different numbers for "the same day".
 */
const RegistrationsPanel = ({ compact = false }) => {
  const [granularity, setGranularity] = useState("day");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .registrations({
        granularity,
        ...(from ? { from: `${from}T00:00:00Z` } : {}),
        ...(to ? { to: `${to}T23:59:59Z` } : {}),
      })
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "Could not load registrations." })))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [granularity, from, to, reload]);

  const exportCsv = () => {
    const csv = toCsv(
      [
        { label: `period_start_utc (${granularity})`, value: (r) => r.bucket },
        { label: "new_users", value: (r) => r.users },
        { label: "new_institutions", value: (r) => r.institutions },
      ],
      data.series,
    );
    downloadText(`eduhub-registrations-${granularity}-${data.from.slice(0, 10)}-to-${data.to.slice(0, 10)}.csv`, csv);
  };

  return (
    <Panel
      title="Registrations"
      description="New accounts and institutions per period (UTC). Includes records archived since."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Granularity">
            {GRANULARITIES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGranularity(g.value)}
                aria-pressed={granularity === g.value}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${granularity === g.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                {g.label}
              </button>
            ))}
          </div>
          {!compact && data && (
            <button type="button" onClick={exportCsv} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Export CSV
            </button>
          )}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col text-xs font-medium text-slate-600">
          From
          <input type="date" value={from} max={to || toInputDate(new Date())} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-600">
          To
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        {(from || to) && (
          <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
            Reset range
          </button>
        )}
        {data && (
          <p className="ml-auto text-xs text-slate-500">
            {new Date(data.from).toLocaleDateString(undefined, { timeZone: "UTC", dateStyle: "medium" })} –{" "}
            {new Date(data.to).toLocaleDateString(undefined, { timeZone: "UTC", dateStyle: "medium" })}:{" "}
            <strong className="text-slate-900">{formatNumber(data.totals.users)}</strong> users ·{" "}
            <strong className="text-slate-900">{formatNumber(data.totals.institutions)}</strong> institutions
          </p>
        )}
      </div>
      {error && <PanelError message={error} onRetry={() => setReload((n) => n + 1)} />}
      {!error && loading && !data && <PanelLoading label="Loading registrations…" />}
      {!error && data && (
        <div className={loading ? "opacity-50" : ""}>
          <TimeBarChart
            rows={data.series}
            series={[
              { key: "users", label: "Users" },
              { key: "institutions", label: "Institutions" },
            ]}
            formatLabel={label(granularity)}
          />
        </div>
      )}
    </Panel>
  );
};

export default RegistrationsPanel;
