import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import adminApi from "../../api/adminApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { PageHeader, Panel, PanelEmpty, PanelError, PanelLink, PanelLoading } from "../../components/admin/Panel.jsx";
import { InstitutionStatusBadge, PlatformRoleBadge, UserStatusBadge, humanise } from "../../components/ui/Badge.jsx";
import { countryName } from "../../utils/format.js";

/** Global search: the same list endpoints the management pages use, side by side. */
const SearchPage = () => {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = `Search: ${q} · EduHub Admin`;
    if (!q) return undefined;
    let cancelled = false;
    setResult(null);
    setError(null);
    Promise.all([adminApi.users.list({ search: q, limit: 10 }), adminApi.institutions.list({ search: q, limit: 10 })])
      .then(([users, institutions]) => !cancelled && setResult({ users, institutions }))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, { fallback: "Search failed." })));
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <div className="space-y-6">
      <PageHeader title={q ? `Results for “${q}”` : "Search"} description="Users by name or email; institutions by name or city." />
      {!q && <Panel><PanelEmpty>Type in the search box at the top of the page.</PanelEmpty></Panel>}
      {error && <PanelError message={error} />}
      {q && !result && !error && <Panel><PanelLoading label="Searching…" /></Panel>}
      {result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title={`Users (${result.users.pagination?.total ?? 0})`}
            action={result.users.pagination?.total > 10 && <PanelLink to={`/admin/users?search=${encodeURIComponent(q)}`}>See all</PanelLink>}
          >
            {result.users.rows.length === 0 ? (
              <PanelEmpty>No users match.</PanelEmpty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {result.users.rows.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <Link to={`/admin/users/${u.id}`} className="font-medium text-slate-900 hover:text-blue-700">{u.fullName}</Link>
                      <span className="block truncate text-xs text-slate-500">{u.email}</span>
                    </span>
                    <span className="flex gap-1.5">
                      {u.platformRole !== "USER" && <PlatformRoleBadge role={u.platformRole} />}
                      <UserStatusBadge status={u.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            title={`Institutions (${result.institutions.pagination?.total ?? 0})`}
            action={result.institutions.pagination?.total > 10 && <PanelLink to={`/admin/institutions?search=${encodeURIComponent(q)}`}>See all</PanelLink>}
          >
            {result.institutions.rows.length === 0 ? (
              <PanelEmpty>No institutions match.</PanelEmpty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {result.institutions.rows.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <Link to={`/admin/institutions/${i.id}`} className="font-medium text-slate-900 hover:text-blue-700">{i.name}</Link>
                      <span className="block truncate text-xs text-slate-500">
                        {humanise(i.category)} · {[i.city, countryName(i.countryCode)].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <InstitutionStatusBadge status={i.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
