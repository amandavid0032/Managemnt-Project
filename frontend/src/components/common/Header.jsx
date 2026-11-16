import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaSearch, FaGraduationCap, FaSignOutAlt } from "react-icons/fa";
import { useAuth } from "../../auth/AuthContext.jsx";
import { landingPathFor } from "../../auth/landing.js";

/**
 * The search box is now wired to the API.
 *
 * It was previously an input with no value, no onChange and no handler — it
 * looked functional and did nothing. Institution search is a core product
 * capability and the v1 API supports it, so it is connected rather than
 * removed.
 */
const Header = ({ searchTerm, onSearchChange }) => {
  const [draft, setDraft] = useState(searchTerm ?? "");
  const { isLoading, isAuthenticated, user, memberships, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();

  const dashboardPath = isAuthenticated ? landingPathFor(user, memberships) : null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      navigate("/", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  // Debounced: one request when typing settles, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== searchTerm) onSearchChange(draft.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [draft, searchTerm, onSearchChange]);

  return (
    <header className="bg-white shadow-md py-4 px-6 flex flex-col sm:flex-row justify-between items-center sticky top-0 z-50 gap-4">
      <h1 className="text-3xl font-extrabold text-blue-800 flex items-center gap-2">
        <FaGraduationCap />
        EduHub
      </h1>

      <form
        role="search"
        className="w-full sm:w-auto sm:flex-1 sm:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          onSearchChange(draft.trim());
        }}
      >
        <label htmlFor="institution-search" className="sr-only">
          Search institutions
        </label>
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="institution-search"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search institutions by name or city…"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </form>

      {/*
        Nothing is rendered while the session is still being restored — showing
        "Sign in" to a user who turns out to be signed in, then swapping it a
        moment later, reads as a bug.
      */}
      {!isLoading && (
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {/* Only offered when there is a real dashboard to open — platform
                  admin or a school role. Everyone else lands on their profile. */}
              {dashboardPath && dashboardPath !== "/profile" && (
                <Link
                  to={dashboardPath}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Dashboard
                </Link>
              )}
              <Link
                to="/profile"
                className="text-sm font-medium text-gray-700 hover:text-blue-700"
                title="My profile"
              >
                {user?.fullName ?? "My profile"}
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <FaSignOutAlt aria-hidden="true" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Sign in
            </Link>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
