/** Display helpers shared by the admin screens. Locale comes from the browser. */

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";

export const formatNumber = (value) =>
  typeof value === "number" ? value.toLocaleString() : "—";

let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(undefined, { type: "region" });
} catch {
  regionNames = null;
}

/** ISO-3166 alpha-2 → the browser's own name for it ("IN" → "India"). */
export const countryName = (code) => {
  if (!code) return "—";
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

export const formatBytes = (bytes) => {
  if (typeof bytes !== "number") return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

export const formatDuration = (seconds) => {
  if (typeof seconds !== "number") return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
};

/** Rows → CSV text. Values are quoted so commas and quotes survive. */
export const toCsv = (columns, rows) => {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // A leading = + - @ makes spreadsheets evaluate the cell as a formula.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(","))].join("\r\n");
};

export const downloadText = (filename, text, type = "text/csv;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
