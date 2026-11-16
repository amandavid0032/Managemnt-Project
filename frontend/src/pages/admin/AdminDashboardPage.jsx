import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaChalkboardTeacher,
  FaCheckCircle,
  FaClipboardCheck,
  FaUniversity,
  FaUserGraduate,
  FaUserShield,
  FaUserSlash,
  FaUsers,
} from "react-icons/fa";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import KpiCard from "../../components/admin/KpiCard.jsx";
import { GeographyPanel, InstitutionBreakdown } from "../../components/admin/DistributionPanels.jsx";
import { PageHeader, Panel, PanelEmpty, PanelError, PanelLink, PanelLoading } from "../../components/admin/Panel.jsx";
import RegistrationsPanel from "../../components/admin/RegistrationsPanel.jsx";
import StatusChangeDialog from "../../components/admin/StatusChangeDialog.jsx";
import { describeAudit } from "../../components/admin/auditText.js";
import { InstitutionStatusBadge, PlatformRoleBadge, UserStatusBadge, humanise } from "../../components/ui/Badge.jsx";
import { countryName, formatDate, formatDateTime } from "../../utils/format.js";

/**
 * Loads one endpoint into { data, error, loading, reload }. Each dashboard
 * section has its own, so one failing query degrades one panel, not the page.
 */
const useLoad = (fn) => {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [token, setToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((err) => !cancelled && setState({ data: null, error: apiErrorMessage(err, { fallback: "Could not load this section." }), loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return { ...state, reload: useCallback(() => setToken((n) => n + 1), []) };
};

const ACTIVITY_TABS = [
  { key: "adminActions", label: "Admin actions" },
  { key: "recentUsers", label: "New users" },
  { key: "recentInstitutions", label: "New institutions" },
  { key: "recentlyPublished", label: "First published" },
];

const ActivityList = ({ tab, data }) => {
  const rows = data[tab];
  if (!rows?.length) {
    return (
      <PanelEmpty>
        {tab === "adminActions"
          ? "No administrative actions recorded yet. The audit log starts with the Super Admin release; earlier changes were not recorded."
          : "Nothing here yet."}
      </PanelEmpty>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => {
        if (tab === "adminActions") {
          return (
            <li key={r.id} className="py-3 text-sm">
              <p className="text-slate-800">
                <span className="font-medium">{r.actor?.fullName ?? "System"}</span> {describeAudit(r)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(r.createdAt)}
                {r.metadata?.reason && <> · “{r.metadata.reason}”</>}
              </p>
            </li>
          );
        }
        if (tab === "recentUsers") {
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <Link to={`/admin/users/${r.id}`} className="font-medium text-slate-900 hover:text-blue-700">{r.fullName}</Link>
                <p className="truncate text-xs text-slate-500">{r.email} · joined {formatDate(r.createdAt)}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {r.platformRole !== "USER" && <PlatformRoleBadge role={r.platformRole} />}
                <UserStatusBadge status={r.status} />
              </div>
            </li>
          );
        }
        return (
          <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <Link to={`/admin/institutions/${r.id}`} className="font-medium text-slate-900 hover:text-blue-700">{r.name}</Link>
              <p className="truncate text-xs text-slate-500">
                {humanise(r.category)} · {countryName(r.countryCode)} ·{" "}
                {tab === "recentlyPublished" ? `first published ${formatDate(r.verifiedAt)}` : `added ${formatDate(r.createdAt)}`}
              </p>
            </div>
            <InstitutionStatusBadge status={r.status} />
          </li>
        );
      })}
    </ul>
  );
};

const HealthRow = ({ label, ok, detail }) => (
  <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
    <span className="flex items-center gap-2 text-slate-700">
      <span className={`h-2 w-2 rounded-full ${ok === null ? "bg-slate-300" : ok ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden="true" />
      {label}
    </span>
    <span className="text-right text-xs text-slate-500">{detail}</span>
  </li>
);

const AdminDashboardPage = () => {
  const { user } = useAuth();
  const overview = useLoad(adminApi.overview);
  const distribution = useLoad(adminApi.distribution);
  const activity = useLoad(adminApi.activity);
  const health = useLoad(adminApi.systemHealth);
  const [tab, setTab] = useState("adminActions");
  const [review, setReview] = useState(null);

  useEffect(() => {
    document.title = "Dashboard · EduHub Admin";
  }, []);

  const k = overview.data?.kpis;
  const loading = overview.loading && !k;

  const kpis = [
    { label: "Total users", value: k?.totalUsers.value, trend: k?.totalUsers.newRegistrations, icon: FaUsers, tone: "blue", to: "/admin/users" },
    { label: "Total institutions", value: k?.totalInstitutions.value, trend: k?.totalInstitutions.newRegistrations, icon: FaUniversity, tone: "violet", to: "/admin/institutions" },
    { label: "Published institutions", value: k?.publishedInstitutions.value, hint: "Visible to the public", icon: FaCheckCircle, tone: "green", to: "/admin/institutions?status=PUBLISHED" },
    { label: "Pending approvals", value: k?.pendingApprovals.value, hint: "Waiting for a review decision", icon: FaClipboardCheck, tone: "amber", to: "/admin/approvals" },
    { label: "Active students", value: k?.activeStudents.value, hint: "People with an active student membership", icon: FaUserGraduate, tone: "blue", to: "/admin/users?membershipRole=STUDENT" },
    { label: "Active teachers", value: k?.activeTeachers.value, hint: "People with an active teacher membership", icon: FaChalkboardTeacher, tone: "green", to: "/admin/users?membershipRole=TEACHER" },
    { label: "Platform admins", value: k?.platformAdmins.value, hint: "Platform and super admins", icon: FaUserShield, tone: "violet", to: "/admin/roles" },
    { label: "Suspended accounts", value: k?.suspendedAccounts.value, hint: "Cannot sign in", icon: FaUserSlash, tone: "red", to: "/admin/users?status=SUSPENDED" },
  ];

  const pending = activity.data?.pendingApprovals;
  const h = health.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.fullName?.split(" ")[0] ?? "admin"}`}
        description="Platform-wide figures, straight from the database. Numbers without history (anything based on a current status) show no trend, because there is nothing to compare them with."
        actions={
          overview.data && (
            <span className="text-xs text-slate-500">Updated {formatDateTime(overview.data.generatedAt)}</span>
          )
        }
      />

      {overview.error && <PanelError message={overview.error} onRetry={overview.reload} />}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </section>

      <RegistrationsPanel compact />

      <div className="grid gap-6 lg:grid-cols-2">
        {distribution.error && <PanelError message={distribution.error} onRetry={distribution.reload} />}
        {distribution.loading && !distribution.data && <Panel title="Institutions"><PanelLoading /></Panel>}
        {distribution.data && <InstitutionBreakdown data={distribution.data} />}
        {distribution.data && <GeographyPanel data={distribution.data} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Pending approvals"
          description={pending ? `${pending.total} waiting, oldest first.` : undefined}
          action={<PanelLink to="/admin/approvals">Open queue</PanelLink>}
          bodyClassName="p-0"
        >
          {activity.error && <div className="p-5"><PanelError message={activity.error} onRetry={activity.reload} /></div>}
          {activity.loading && !activity.data && <div className="px-5"><PanelLoading /></div>}
          {pending && pending.rows.length === 0 && <PanelEmpty>Nothing is waiting for review.</PanelEmpty>}
          {pending && pending.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Institution</th>
                    <th className="px-3 py-2.5">Country</th>
                    <th className="px-3 py-2.5">Submitted</th>
                    <th className="px-3 py-2.5">Verified</th>
                    <th className="px-5 py-2.5"><span className="sr-only">Review</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pending.rows.slice(0, 6).map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3">
                        <Link to={`/admin/institutions/${p.id}`} className="font-medium text-slate-900 hover:text-blue-700">{p.name}</Link>
                        <p className="text-xs text-slate-500">{humanise(p.category)}{p.typeLabel ? ` · ${p.typeLabel}` : ""}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{countryName(p.countryCode)}</td>
                      <td className="px-3 py-3 text-slate-700" title={p.submittedAt ? undefined : "Submitted before the audit log existed, or created as pending by an import"}>
                        {p.submittedAt ? formatDate(p.submittedAt) : <span className="text-slate-400">Not recorded</span>}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{p.verifiedAt ? "Previously" : "Never"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setReview({ institution: { ...p, status: "PENDING_REVIEW" }, status: "PUBLISHED" })} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                            Approve
                          </button>
                          <button type="button" onClick={() => setReview({ institution: { ...p, status: "PENDING_REVIEW" }, status: "DRAFT" })} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="System overview" action={<PanelLink to="/admin/system">Details</PanelLink>}>
          {health.error && <PanelError message={health.error} onRetry={health.reload} />}
          {health.loading && !h && <PanelLoading />}
          {h && (
            <ul className="divide-y divide-slate-100">
              <HealthRow label="Backend API" ok={h.api.status === "up"} detail={`Up · ${h.api.environment}`} />
              <HealthRow
                label="Database"
                ok={h.database.status === "up"}
                detail={h.database.status === "up" ? `Up · ${h.database.latencyMs} ms` : "Unreachable"}
              />
              <HealthRow
                label="Server errors (5xx)"
                ok={h.errors.serverErrors === 0}
                detail={`${h.errors.serverErrors} since ${formatDateTime(h.errors.since)}`}
              />
              <HealthRow label="Email" ok={h.mail.configured ? true : null} detail={h.mail.configured ? "SMTP configured" : `Not sending (${h.mail.provider})`} />
              <HealthRow label="Error monitoring" ok={null} detail="Not integrated" />
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Recent activity"
        action={<PanelLink to="/admin/audit-logs">Full audit log</PanelLink>}
      >
        <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-100" role="tablist">
          {ACTIVITY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activity.error && <PanelError message={activity.error} onRetry={activity.reload} />}
        {activity.loading && !activity.data && <PanelLoading />}
        {activity.data && <ActivityList tab={tab} data={activity.data} />}
      </Panel>

      <StatusChangeDialog
        action={review}
        onCancel={() => setReview(null)}
        onDone={() => {
          setReview(null);
          activity.reload();
          overview.reload();
          distribution.reload();
        }}
      />
    </div>
  );
};

export default AdminDashboardPage;
