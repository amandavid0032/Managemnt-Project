import React from "react";
import { useNavigate } from "react-router-dom";
import { humanise } from "../ui/Badge.jsx";
import { countryName } from "../../utils/format.js";
import { BarList, StackedBar } from "./Charts.jsx";
import { Panel, PanelEmpty } from "./Panel.jsx";

/** Institution status, category and country breakdowns. Clicking opens the filtered list. */
export const InstitutionBreakdown = ({ data }) => {
  const navigate = useNavigate();
  const s = data.institutions.byStatus;
  return (
    <Panel title="Institutions by status and type" description="Live records; archived institutions are excluded.">
      <StackedBar
        segments={[
          { label: "Published", value: s.PUBLISHED ?? 0, colour: "bg-emerald-500" },
          { label: "Pending review", value: s.PENDING_REVIEW ?? 0, colour: "bg-amber-400" },
          { label: "Draft", value: s.DRAFT ?? 0, colour: "bg-slate-400" },
          { label: "Suspended", value: s.SUSPENDED ?? 0, colour: "bg-rose-500" },
        ]}
      />
      <h3 className="mb-3 mt-6 text-sm font-semibold text-slate-700">By type</h3>
      {data.institutions.byCategory.length === 0 ? (
        <PanelEmpty>No institutions yet.</PanelEmpty>
      ) : (
        <BarList
          items={data.institutions.byCategory.map((c) => ({
            label: humanise(c.category),
            category: c.category,
            value: c.total,
            published: c.byStatus.PUBLISHED ?? 0,
          }))}
          secondaryKey="published"
          secondaryLabel="published"
          onSelect={(item) => navigate(`/admin/institutions?category=${item.category}`)}
        />
      )}
    </Panel>
  );
};

export const GeographyPanel = ({ data, limit = 8 }) => {
  const navigate = useNavigate();
  const countries = data.institutions.byCountry;
  return (
    <Panel title="Geographic distribution" description={`Institutions by country${countries.length > limit ? ` (top ${limit} of ${countries.length})` : ""}.`}>
      {countries.length === 0 ? (
        <PanelEmpty>No institutions yet.</PanelEmpty>
      ) : (
        <BarList
          items={countries.slice(0, limit).map((c) => ({
            label: `${countryName(c.countryCode)} (${c.countryCode})`,
            countryCode: c.countryCode,
            value: c.total,
            published: c.published,
          }))}
          secondaryKey="published"
          secondaryLabel="published"
          onSelect={(item) => navigate(`/admin/institutions?countryCode=${item.countryCode}`)}
        />
      )}
      <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <strong className="font-semibold text-slate-700">Users by country: not available.</strong>{" "}
        {data.users.byCountryUnavailableReason}
      </p>
    </Panel>
  );
};
