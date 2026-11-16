import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

/**
 * Full-page placeholder shown only while the session is being restored from
 * the refresh cookie. Rendering nothing here would flash the login screen to a
 * user who is in fact signed in.
 */
const SessionLoading = () => (
  <div
    className="min-h-screen flex items-center justify-center bg-gray-100"
    role="status"
    aria-live="polite"
  >
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
      <p className="text-gray-600">Checking your session…</p>
    </div>
  </div>
);

/**
 * Requires a signed-in user. Remembers where they were going, so after login
 * they land on the page they asked for rather than a generic dashboard.
 */
export const ProtectedRoute = () => {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) return <SessionLoading />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
};

/**
 * Requires a signed-in user holding one of `roles` (platform roles).
 *
 * Hiding a route is a UX measure, never the protection itself — the server
 * rejects the underlying requests regardless of what the browser renders.
 * Denial routes home rather than to /login: the user IS authenticated, so
 * sending them to a login form would be both wrong and an infinite loop.
 */
export const RoleRoute = ({ roles = [] }) => {
  const { isLoading, isAuthenticated, platformRole } = useAuth();
  const location = useLocation();

  if (isLoading) return <SessionLoading />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!roles.includes(platformRole)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
};

export default ProtectedRoute;
