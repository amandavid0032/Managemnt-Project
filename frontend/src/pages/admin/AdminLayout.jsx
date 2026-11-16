import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaBars,
  FaChevronDown,
  FaGraduationCap,
  FaSearch,
  FaSignOutAlt,
  FaTimes,
} from "react-icons/fa";
import { useAuth } from "../../auth/AuthContext.jsx";
import { humanise } from "../../components/ui/Badge.jsx";
import Avatar from "../../components/profile/Avatar.jsx";
import { ADMIN_NAV, crumbsFor } from "./adminNav.js";

const COLLAPSE_KEY = "eduhub.admin.sidebarCollapsed";

const readCollapsed = () => {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Shell for the Super Admin surface: navy sidebar with grouped navigation,
 * top bar with breadcrumbs, global search and the account menu.
 *
 * There is no notifications bell: the platform has no notification store, so
 * a bell could only ever be empty or fake. It arrives with that module.
 */
const AdminLayout = () => {
  const { user, logout, logoutEverywhere } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuper = user?.platformRole === "SUPER_ADMIN";

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [query, setQuery] = useState("");
  const menuRef = useRef(null);

  // Close the mobile drawer and account menu on navigation.
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage unavailable — the preference just is not remembered */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleLogout = async (everywhere) => {
    setBusy(everywhere ? "all" : "one");
    try {
      await (everywhere ? logoutEverywhere() : logout());
      navigate("/login", { replace: true });
    } finally {
      setBusy(null);
    }
  };

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/admin/search?q=${encodeURIComponent(q)}`);
  };

  const crumbs = crumbsFor(location.pathname);

  const nav = (compact) => (
    <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-3 py-4">
      {ADMIN_NAV.map((group) => (
        <div key={group.group} className="mb-5">
          {!compact && (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.group}</p>
          )}
          <ul className="space-y-0.5">
            {group.items
              .filter((item) => !item.superOnly || isSuper)
              .map(({ to, label, icon: Icon, end, planned }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    title={compact ? label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? "bg-white/10 font-semibold text-white"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      } ${compact ? "justify-center" : ""}`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!compact && <span className="flex-1 truncate">{label}</span>}
                    {!compact && planned && (
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-300">
                        Planned
                      </span>
                    )}
                    {compact && <span className="sr-only">{label}</span>}
                  </NavLink>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (compact) => (
    <Link to="/" className={`flex items-center gap-2 px-5 py-5 text-lg font-extrabold text-white ${compact ? "justify-center px-0" : ""}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
        <FaGraduationCap aria-hidden="true" />
      </span>
      {!compact && <span>EduHub</span>}
      {!compact && <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">Admin</span>}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-[#0b1736] transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        {brand(collapsed)}
        {nav(collapsed)}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-3 text-xs text-slate-400 hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <FaAngleDoubleRight /> : <><FaAngleDoubleLeft /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-[#0b1736]">
            <div className="flex items-center justify-between pr-3">
              {brand(false)}
              <button type="button" onClick={() => setMobileOpen(false)} className="p-2 text-slate-300 hover:text-white" aria-label="Close menu">
                <FaTimes />
              </button>
            </div>
            {nav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <FaBars />
            </button>

            <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
              <ol className="flex items-center gap-1.5 text-sm text-slate-500">
                {crumbs.map((c, i) => (
                  <li key={`${c.to}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <span aria-hidden="true">/</span>}
                    {i === crumbs.length - 1 ? (
                      <span className="font-medium text-slate-900" aria-current="page">{c.label}</span>
                    ) : (
                      <Link to={c.to} className="hover:text-slate-900">{c.label}</Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <form onSubmit={submitSearch} role="search" className="relative ml-auto w-full max-w-xs">
              <label htmlFor="admin-global-search" className="sr-only">Search users and institutions</label>
              <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
              <input
                id="admin-global-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users, institutions…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </form>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100"
              >
                <Avatar name={user?.fullName} size="sm" />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[10rem] truncate text-sm font-medium text-slate-900">{user?.fullName}</span>
                  <span className="block text-xs text-slate-500">{humanise(user?.platformRole)}</span>
                </span>
                <FaChevronDown className="text-xs text-slate-400" aria-hidden="true" />
              </button>

              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-900">{user?.fullName}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <Link role="menuitem" to="/profile" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">My profile</Link>
                  <Link role="menuitem" to="/" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Public site</Link>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => handleLogout(false)}
                    disabled={busy !== null}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FaSignOutAlt aria-hidden="true" /> {busy === "one" ? "Signing out…" : "Sign out"}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => handleLogout(true)}
                    disabled={busy !== null}
                    title="Revokes every session on every device"
                    className="block w-full px-4 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {busy === "all" ? "Revoking…" : "Sign out on all devices"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
