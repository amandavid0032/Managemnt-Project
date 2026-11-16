import React, { useEffect, useState } from "react";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { GeographyPanel, InstitutionBreakdown } from "../../components/admin/DistributionPanels.jsx";
import { PageHeader, Panel, PanelError, PanelLoading } from "../../components/admin/Panel.jsx";
import RegistrationsPanel from "../../components/admin/RegistrationsPanel.jsx";
import { humanise } from "../../components/ui/Badge.jsx";
import { countryName, downloadText, toCsv } from "../../utils/format.js";

const AnalyticsPage = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    document.title = "Analytics & Reports · EduHub Admin";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .distribution()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "Could not load distributions." })));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const exportCountries = () =>
    downloadText(
      "eduhub-institutions-by-country.csv",
      toCsv(
        [
          { label: "country_code", value: (r) => r.countryCode },
          { label: "country", value: (r) => countryName(r.countryCode) },
          { label: "institutions", value: (r) => r.total },
          { label: "published", value: (r) => r.published },
        ],
        data.institutions.byCountry,
      ),
    );

  const exportCategories = () =>
    downloadText(
      "eduhub-institutions-by-type.csv",
      toCsv(
        [
          { label: "category", value: (r) => r.category },
          { label: "total", value: (r) => r.total },
          ...["PUBLISHED", "PENDING_REVIEW", "DRAFT", "SUSPENDED"].map((s) => ({ label: s.toLowerCase(), value: (r) => r.byStatus[s] ?? 0 })),
        ],
        data.institutions.byCategory,
      ),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Reports"
        description="Growth and distribution from live data. Exports contain exactly what is on screen. Not yet available: active-user metrics (no activity tracking beyond last sign-in) and users by country (accounts have no country)."
      />
      <RegistrationsPanel />
      {error && <PanelError message={error} onRetry={() => setReload((n) => n + 1)} />}
      {!data && !error && <Panel><PanelLoading /></Panel>}
      {data && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <InstitutionBreakdown data={data} />
            <GeographyPanel data={data} limit={20} />
          </div>
          <Panel
            title="Institution types by status"
            action={
              <div className="flex gap-2">
                <button type="button" onClick={exportCategories} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Export types CSV</button>
                <button type="button" onClick={exportCountries} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Export countries CSV</button>
              </div>
            }
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Type</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5 text-right">Published</th>
                    <th className="px-3 py-2.5 text-right">Pending</th>
                    <th className="px-3 py-2.5 text-right">Draft</th>
                    <th className="px-5 py-2.5 text-right">Suspended</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {data.institutions.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td className="px-5 py-2.5 text-slate-800">{humanise(c.category)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{c.total}</td>
                      <td className="px-3 py-2.5 text-right">{c.byStatus.PUBLISHED ?? 0}</td>
                      <td className="px-3 py-2.5 text-right">{c.byStatus.PENDING_REVIEW ?? 0}</td>
                      <td className="px-3 py-2.5 text-right">{c.byStatus.DRAFT ?? 0}</td>
                      <td className="px-5 py-2.5 text-right">{c.byStatus.SUSPENDED ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;
