import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { FaGraduationCap, FaSignOutAlt } from "react-icons/fa";
import authApi from "../../api/authApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { PLATFORM_ADMIN_ROLES, dashboardMemberships } from "../../auth/landing.js";

/**
 * Nudges an unverified user to confirm their address, with a working resend.
 * It matters: a school cannot enrol an account whose address is unverified.
 */
const VerifyEmailBanner = ({ email }) => {
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState(null);

  const resend = async () => {
    setState("sending");
    setMessage(null);
    try {
      await authApi.resendVerification();
      setState("sent");
    } catch (err) {
      setState("idle");
      setMessage(apiErrorMessage(err, { fallback: "Could not send the email." }));
    }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>Verify your email address.</strong> We sent a link to {email}. Schools can only add you
          once it is verified.
        </p>
        <div className="flex items-center gap-3">
          {message && <span className="text-red-700" role="alert">{message}</span>}
          {state === "sent" ? (
            <span role="status" className="font-medium text-green-800">New link sent.</span>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={state === "sending"}
              className="whitespace-nowrap rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {state === "sending" ? "Sending…" : "Resend link"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const navClass = ({ isActive }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive ? "bg-blue-50 text-blue-800" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
  }`;

/**
 * Frame for signed-in, non-admin pages: profile and school dashboards.
 * Every nav item leads to a screen that exists for this user — schools only
 * appear when the person has a dashboard role there.
 */
const AccountLayout = ({ children }) => {
  const { user, memberships, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const schools = dashboardMemberships(memberships);
  const isPlatformStaff = PLATFORM_ADMIN_ROLES.includes(user?.platformRole);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      navigate("/", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <header className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-extrabold text-blue-800">
            <FaGraduationCap aria-hidden="true" />
            EduHub
          </Link>

          <nav className="flex flex-wrap items-center gap-1" aria-label="Account">
            <NavLink to="/" end className={navClass}>
              Institutions
            </NavLink>
            <NavLink to="/profile" className={navClass}>
              My profile
            </NavLink>
            {schools.length === 1 && (
              <NavLink to={`/school/${schools[0].slug}`} className={navClass}>
                {schools[0].name}
              </NavLink>
            )}
            {schools.length > 1 && (
              <NavLink to="/school" className={navClass}>
                My institutions
              </NavLink>
            )}
            {isPlatformStaff && (
              <NavLink to="/admin" className={navClass}>
                Admin
              </NavLink>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="ml-1 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <FaSignOutAlt aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </nav>
        </div>
      </header>

      {user && !user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
};

export default AccountLayout;
