import React, { useEffect, useState } from "react";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { PageHeader, Panel, PanelError, PanelLoading } from "../../components/admin/Panel.jsx";

const Row = ({ label, value, hint }) => (
  <div className="grid gap-1 py-2.5 text-sm sm:grid-cols-3">
    <dt className="text-slate-500">{label}</dt>
    <dd className="break-words font-medium text-slate-900 sm:col-span-2">
      {Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : (value ?? "—")}
      {hint && <span className="block text-xs font-normal text-slate-500">{hint}</span>}
    </dd>
  </div>
);

const PLANNED = [
  ["Platform branding", "Logo, name and colours. Needs file storage for the logo."],
  ["Localization", "Supported languages and default locale. The UI has no translations yet."],
  ["Country configuration", "See Countries & Regions — needs a countries table first."],
  ["Integration settings", "No third-party integrations exist yet (data imports arrive in Phase 4)."],
];

/**
 * Effective configuration, read-only. It comes from environment variables
 * and changes with a redeploy — an edit form here would save nothing.
 * Secrets are reported only as set / not set; the API never sends values.
 */
const SettingsPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = "Platform Settings · EduHub Admin";
  }, []);
  useEffect(() => {
    if (user?.platformRole !== "SUPER_ADMIN") return undefined;
    let cancelled = false;
    adminApi
      .settings()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "Could not load settings." })));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (user?.platformRole !== "SUPER_ADMIN") {
    return (
      <div className="space-y-6">
        <PageHeader title="Platform Settings" />
        <Panel><p className="text-sm text-slate-600">Platform settings are visible to Super Admins only.</p></Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Settings"
        description="The configuration this API is running with. Values come from environment variables, so they are changed by your deployment, not here. Secrets show only whether they are set."
      />
      {error && <PanelError message={error} />}
      {!data && !error && <Panel><PanelLoading /></Panel>}
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="General">
            <dl className="divide-y divide-slate-100">
              <Row label="Environment" value={data.general.environment} />
              <Row label="Web app URL" value={data.general.appUrl} hint="Links in emails point here (APP_URL)" />
              <Row label="API prefix" value={`/${data.general.apiPrefix}/v1`} />
              <Row label="Allowed origins (CORS)" value={data.general.corsOrigins} />
              <Row label="Log level" value={data.general.logLevel} />
            </dl>
          </Panel>
          <Panel title="Authentication & security">
            <dl className="divide-y divide-slate-100">
              <Row label="Password hashing" value={data.authentication.passwordHashing} />
              <Row label="Access token lifetime" value={data.authentication.accessTokenTtl} />
              <Row label="Refresh token lifetime" value={`${data.authentication.refreshTokenTtlDays} days`} />
              <Row label="JWT signing secret" value={data.authentication.jwtSecret} />
              <Row label="Password reset link" value={`${data.authentication.passwordResetLinkMinutes} minutes`} />
              <Row label="Email verification link" value={`${data.authentication.emailVerificationLinkHours} hours`} />
              <Row
                label="Rate limit"
                value={data.authentication.rateLimit.enabled ? `${data.authentication.rateLimit.requestsPerWindow} requests / ${data.authentication.rateLimit.windowSeconds}s per client` : "Disabled"}
              />
            </dl>
          </Panel>
          <Panel title="Email">
            <dl className="divide-y divide-slate-100">
              <Row label="Provider" value={data.email.provider} hint={data.email.provider === "smtp" ? undefined : "Emails are not delivered with this provider"} />
              <Row label="From address" value={data.email.from} />
              <Row label="SMTP host" value={data.email.smtpHost ?? "Not set"} />
              <Row label="SMTP port / TLS" value={`${data.email.smtpPort} · ${data.email.smtpSecure ? "TLS" : "STARTTLS"}`} />
              <Row label="SMTP user" value={data.email.smtpUser} />
              <Row label="SMTP password" value={data.email.smtpPassword} />
            </dl>
          </Panel>
          <Panel title="Not configurable yet">
            <ul className="space-y-3 text-sm">
              {PLANNED.map(([title, why]) => (
                <li key={title}>
                  <p className="font-medium text-slate-800">{title}</p>
                  <p className="text-slate-500">{why}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
