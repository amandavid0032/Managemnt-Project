import React from "react";
import { Link } from "react-router-dom";

/** The white card every dashboard section sits in. */
export const Panel = ({ title, description, action = null, children, className = "", bodyClassName = "p-5" }) => (
  <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
    {(title || action) && (
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {action}
      </header>
    )}
    <div className={bodyClassName}>{children}</div>
  </section>
);

export const PanelLink = ({ to, children }) => (
  <Link to={to} className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">
    {children}
  </Link>
);

export const PanelError = ({ message, onRetry }) => (
  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
    <span>{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-100">
        Try again
      </button>
    )}
  </div>
);

export const PanelLoading = ({ label = "Loading…" }) => (
  <div className="flex items-center gap-3 py-6 text-sm text-slate-500" role="status">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-700" />
    {label}
  </div>
);

export const PanelEmpty = ({ children }) => <p className="py-6 text-center text-sm text-slate-500">{children}</p>;

/** Page heading used by every admin screen. */
export const PageHeader = ({ title, description, actions = null }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export default Panel;
