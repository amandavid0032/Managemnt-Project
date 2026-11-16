import React, { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { FaGraduationCap, FaLock, FaEnvelope } from "react-icons/fa";
import { useAuth } from "../auth/AuthContext.jsx";
import { landingPathFor } from "../auth/landing.js";

/**
 * Turns an axios failure into something a person can act on.
 *
 * The API answers a wrong email and a wrong password identically, so this
 * cannot say which was wrong — and must not try, because that is what makes
 * the endpoint safe from account enumeration.
 */
function messageFor(error) {
  if (error?.response) {
    const { status, data } = error.response;
    if (status === 401) return "Incorrect email or password.";
    if (status === 429) return "Too many attempts. Please wait a minute and try again.";
    if (status === 400) {
      // The API reports class-validator failures as error.details[].
      const details = data?.error?.details;
      if (Array.isArray(details) && details.length > 0) return details[0];
      return data?.error?.message ?? "Please check your details.";
    }
    return "Something went wrong signing you in. Please try again.";
  }
  if (error?.code === "ECONNABORTED") return "The server took too long to respond.";
  return "Cannot reach the server. Is the API running on port 4000?";
}

const LoginPage = () => {
  const { login, isAuthenticated, isLoading, user, memberships } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Sign in · EduHub";
  }, []);

  // Already signed in — never show the form twice.
  if (!isLoading && isAuthenticated) {
    const target = location.state?.from?.pathname ?? landingPathFor(user, memberships);
    return <Navigate to={target} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(email.trim().toLowerCase(), password);
      const target =
        location.state?.from?.pathname ?? landingPathFor(signedIn.user, signedIn.memberships);
      navigate(target, { replace: true });
    } catch (err) {
      setError(messageFor(err));
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-4 py-10">
      <Link
        to="/"
        className="mb-8 flex items-center gap-2 text-3xl font-extrabold text-blue-800"
      >
        <FaGraduationCap />
        EduHub
      </Link>

      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
        <p className="mt-1 text-sm text-gray-600">
          Administrators, staff and students all sign in here.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
          {/*
            role="alert" so a screen reader announces the failure; a visually
            styled box alone leaves non-sighted users with no feedback.
          */}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <div className="relative mt-1">
              <FaEnvelope className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative mt-1">
              <FaLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm sm:flex-row sm:justify-between">
          <Link to="/forgot-password" className="font-medium text-blue-700 hover:text-blue-900">
            Forgot your password?
          </Link>
          <Link to="/register" className="text-gray-600 hover:text-blue-700">
            New here? <span className="font-medium text-blue-700">Create an account</span>
          </Link>
        </div>
      </div>

      <Link to="/" className="mt-6 text-sm text-gray-600 hover:text-blue-700">
        ← Back to institutions
      </Link>
    </div>
  );
};

export default LoginPage;
