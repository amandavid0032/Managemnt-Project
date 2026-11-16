import React from "react";
import { Link } from "react-router-dom";
import { formatNumber } from "../../utils/format.js";

/**
 * One headline figure. `trend` is shown only when the API supplied one — the
 * API supplies one only where the data has history to compare against.
 */
const KpiCard = ({ label, value, icon: Icon, tone = "blue", to, trend, hint, loading }) => {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-700",
  };

  let trendText = null;
  if (trend) {
    const diff = trend.current - trend.previous;
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
    const colour = diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-slate-500";
    trendText = (
      <p className="mt-2 text-xs text-slate-500">
        <span className={`font-semibold ${colour}`}>
          {arrow} {formatNumber(trend.current)} new
        </span>{" "}
        in last {trend.windowDays} days · {formatNumber(trend.previous)} in the {trend.windowDays} before
      </p>
    );
  }

  return (
    <Link
      to={to}
      className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`} aria-hidden="true">
            <Icon />
          </span>
        )}
      </div>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
        {loading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-slate-100" /> : formatNumber(value)}
      </p>
      {trendText}
      {!trend && hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
      <p className="mt-3 text-xs font-medium text-blue-700 opacity-0 transition group-hover:opacity-100">View list →</p>
    </Link>
  );
};

export default KpiCard;
