import React, { useState } from "react";
import { formatNumber } from "../../utils/format.js";

/**
 * Small, dependency-free SVG charts. A charting library would be ~100 KB for
 * two chart types; these render the API's numbers exactly, scale to their
 * container and carry an accessible table of the same data.
 */

const SERIES_COLOURS = ["#1d4ed8", "#0d9488"]; // blue-700, teal-600 — distinguishable in colour-blind palettes

/** Grouped vertical bars over time. `series`: [{ key, label }]. */
export const TimeBarChart = ({ rows, series, formatLabel, height = 220 }) => {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key])));
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const width = Math.max(rows.length * 28, 320);
  const padL = 32;
  const padB = 24;
  const plotH = height - padB - 8;
  const slot = (width - padL) / Math.max(rows.length, 1);
  const barW = Math.max(3, Math.min(14, (slot - 6) / series.length));
  const labelEvery = Math.ceil(rows.length / 10);
  const ticks = [0, niceMax / 2, niceMax].map((t) => Math.round(t));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        {series.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLOURS[i] }} />
            {s.label}
          </span>
        ))}
        {hover !== null && rows[hover] && (
          <span className="ml-auto font-medium text-slate-900">
            {formatLabel(rows[hover].bucket, true)}:{" "}
            {series.map((s) => `${formatNumber(rows[hover][s.key])} ${s.label.toLowerCase()}`).join(" · ")}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[320px]" role="img" aria-label="Registrations over time">
          {ticks.map((t) => {
            const y = 8 + plotH - (t / niceMax) * plotH;
            return (
              <g key={t}>
                <line x1={padL} x2={width} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={t === 0 ? "" : "3 3"} />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b">
                  {t}
                </text>
              </g>
            );
          })}
          {rows.map((r, i) => {
            const x0 = padL + i * slot + (slot - barW * series.length) / 2;
            return (
              <g key={r.bucket} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + i * slot} y={0} width={slot} height={height - padB} fill={hover === i ? "#f1f5f9" : "transparent"} />
                {series.map((s, j) => {
                  const h = (r[s.key] / niceMax) * plotH;
                  return (
                    <rect key={s.key} x={x0 + j * barW} y={8 + plotH - h} width={barW - 1} height={Math.max(h, r[s.key] > 0 ? 1 : 0)} rx="1.5" fill={SERIES_COLOURS[j]} />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="#64748b">
                    {formatLabel(r.bucket, false)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer select-none">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 pr-4 font-medium">Period</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 pr-4 font-medium">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bucket} className="border-t border-slate-100">
                <td className="py-1 pr-4">{formatLabel(r.bucket, true)}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-1 pr-4">{formatNumber(r[s.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};

/** Labelled horizontal bars — categories, countries. */
export const BarList = ({ items, valueKey = "value", labelKey = "label", secondaryKey, secondaryLabel, onSelect }) => {
  const max = Math.max(1, ...items.map((i) => i[valueKey]));
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const pct = (item[valueKey] / max) * 100;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-slate-700">{item[labelKey]}</span>
              <span className="shrink-0 tabular-nums text-slate-900">
                {formatNumber(item[valueKey])}
                {secondaryKey && (
                  <span className="ml-1 text-xs text-slate-500">
                    ({formatNumber(item[secondaryKey])} {secondaryLabel})
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
            </div>
          </>
        );
        return (
          <li key={item[labelKey]}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(item)} className="block w-full rounded text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
};

/** One stacked bar showing the share of each status. */
export const StackedBar = ({ segments }) => {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        {total > 0 &&
          segments.map((s) =>
            s.value > 0 ? <div key={s.label} className={s.colour} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} /> : null,
          )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.colour}`} aria-hidden="true" />
            <span className="text-slate-600">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900">{formatNumber(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
