import React, { useEffect, useState } from "react";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { PageHeader, Panel, PanelError, PanelLoading } from "../../components/admin/Panel.jsx";
import { formatBytes, formatDateTime, formatDuration } from "../../utils/format.js";

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-2 text-sm">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-medium text-slate-900">{children ?? "—"}</dd>
  </div>
);

const Status = ({ ok, label }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok === null ? "bg-slate-100 text-slate-600" : ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${ok === null ? "bg-slate-400" : ok ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden="true" />
    {label}
  </span>
);

/**
 * What this API process can observe about itself right now. Re-checked on
 * demand, not polled: there is no history to plot, and a page that hammers
 * the database while someone reads it is a poor health check.
 */
const SystemHealthPage = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    document.title = "System Health · EduHub Admin";
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .systemHealth()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "The health check failed — the API may be down." })))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        description="Live facts from the API process and database. No uptime percentages or response-time charts: those need a monitoring system that keeps history, which is not set up yet."
        actions={
          <button type="button" onClick={() => setReload((n) => n + 1)} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {loading ? "Checking…" : "Check again"}
          </button>
        }
      />
      {error && <PanelError message={error} onRetry={() => setReload((n) => n + 1)} />}
      {!data && !error && <Panel><PanelLoading label="Checking…" /></Panel>}
      {data && (
        <>
          <p className="text-xs text-slate-500">Checked {formatDateTime(data.checkedAt)}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Backend API" action={<Status ok={data.api.status === "up"} label="Up" />}>
              <dl className="divide-y divide-slate-100">
                <Row label="Environment">{data.api.environment}</Row>
                <Row label="Node.js">{data.api.nodeVersion}</Row>
                <Row label="Process running for">{formatDuration(data.api.processUptimeSeconds)}</Row>
                <Row label="Memory (RSS)">{formatBytes(data.api.memory.rssBytes)}</Row>
                <Row label="Heap used / total">{formatBytes(data.api.memory.heapUsedBytes)} / {formatBytes(data.api.memory.heapTotalBytes)}</Row>
              </dl>
            </Panel>
            <Panel title="PostgreSQL" action={<Status ok={data.database.status === "up"} label={data.database.status === "up" ? "Connected" : "Unreachable"} />}>
              <dl className="divide-y divide-slate-100">
                <Row label="Round-trip latency">{data.database.latencyMs !== null ? `${data.database.latencyMs} ms` : null}</Row>
                <Row label="Server version">{data.database.serverVersion}</Row>
                <Row label="Database size">{formatBytes(data.database.sizeBytes)}</Row>
                <Row label="Open connections">{data.database.connections}</Row>
                <Row label="Migrations applied">{data.database.migrations?.applied}</Row>
                <Row label="Latest migration"><span className="font-mono text-xs">{data.database.migrations?.latest}</span></Row>
                <Row label="Unfinished migrations">
                  {data.database.migrations ? (
                    <span className={data.database.migrations.unfinished > 0 ? "text-rose-700" : ""}>{data.database.migrations.unfinished}</span>
                  ) : null}
                </Row>
              </dl>
            </Panel>
            <Panel title="Application errors" action={<Status ok={data.errors.serverErrors === 0} label={`${data.errors.serverErrors} server errors`} />}>
              <dl className="divide-y divide-slate-100">
                <Row label="5xx responses">{data.errors.serverErrors}</Row>
                <Row label="Counting since">{formatDateTime(data.errors.since)}</Row>
                <Row label="Last server error">{data.errors.lastServerErrorAt ? formatDateTime(data.errors.lastServerErrorAt) : "None"}</Row>
              </dl>
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This count lives in the API process and resets when it restarts. Error monitoring (e.g. Sentry) is not integrated, so errors are not stored, grouped or alerted on.
              </p>
            </Panel>
            <Panel title="Services" bodyClassName="px-5 py-2">
              <dl className="divide-y divide-slate-100">
                <Row label="Email"><Status ok={data.mail.configured ? true : null} label={data.mail.configured ? "SMTP configured" : `Not sending (${data.mail.provider})`} /></Row>
                <Row label="Background jobs"><Status ok={null} label="None exist yet" /></Row>
                <Row label="File storage"><Status ok={null} label="Not integrated" /></Row>
                <Row label="Request performance"><Status ok={null} label="Not measured" /></Row>
              </dl>
              <p className="pb-2 pt-1 text-xs text-slate-500">{data.mail.note}</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default SystemHealthPage;
