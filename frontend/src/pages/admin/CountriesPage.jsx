import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { PageHeader, Panel, PanelEmpty, PanelError, PanelLoading } from "../../components/admin/Panel.jsx";
import { countryName } from "../../utils/format.js";

/**
 * Coverage that exists today (derived from institutions' ISO country codes),
 * plus the plan for real country configuration. No editable table is shown:
 * nothing would read currency, language or timezone yet, so editing them
 * would change nothing.
 */
const CountriesPage = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    document.title = "Countries & Regions · EduHub Admin";
  }, []);
  useEffect(() => {
    let cancelled = false;
    adminApi
      .distribution()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "Could not load coverage." })));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Countries & Regions"
        description="Where EduHub has institutions today. Countries are ISO-3166 codes stored on each institution; names come from your browser's locale, so nothing here assumes one country."
      />
      <Panel title="Current coverage" bodyClassName="p-0">
        {error && <div className="p-5"><PanelError message={error} onRetry={() => setReload((n) => n + 1)} /></div>}
        {!data && !error && <div className="px-5"><PanelLoading /></div>}
        {data && data.institutions.byCountry.length === 0 && <PanelEmpty>No institutions yet.</PanelEmpty>}
        {data && data.institutions.byCountry.length > 0 && (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Country</th>
                <th className="px-3 py-2.5">ISO code</th>
                <th className="px-3 py-2.5 text-right">Institutions</th>
                <th className="px-5 py-2.5 text-right">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {data.institutions.byCountry.map((c) => (
                <tr key={c.countryCode} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <Link to={`/admin/institutions?countryCode=${c.countryCode}`} className="font-medium text-slate-900 hover:text-blue-700">{countryName(c.countryCode)}</Link>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{c.countryCode}</td>
                  <td className="px-3 py-2.5 text-right">{c.total}</td>
                  <td className="px-5 py-2.5 text-right">{c.published}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Planned: country configuration" description="Not built yet. What it needs, in order:">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>A <code>countries</code> table (ISO code as key, currency ISO-4217, default language BCP-47, default IANA timezone, status) seeded from ISO data — not typed in by hand.</li>
          <li>A foreign key from <code>institutions.country_code</code> once every existing code is in the table, so an invalid country cannot be stored.</li>
          <li>Regions: <code>regions</code> (country + ISO-3166-2 subdivision code) replacing today's free-text <code>state</code>, migrated by matching existing values and leaving unmatched ones for review.</li>
          <li>Something that reads it — fees in local currency, timezone-correct admissions deadlines — before an edit screen is added, so edits have an effect.</li>
        </ol>
      </Panel>
    </div>
  );
};

export default CountriesPage;
