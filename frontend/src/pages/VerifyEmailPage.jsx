import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import authApi from "../api/authApi.js";
import { apiErrorMessage } from "../api/apiError.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AuthCard, { Alert } from "../components/auth/AuthCard.jsx";
import useTokenFromHash from "../hooks/useTokenFromHash.js";

/**
 * Opened from the verification email. Works signed in or not: the token is
 * the proof, so a link opened on a phone where the person never signed in
 * still verifies the address.
 */
const VerifyEmailPage = () => {
  const token = useTokenFromHash();
  const { isAuthenticated, refreshUser } = useAuth();
  const [state, setState] = useState(token ? "working" : "missing");
  const [error, setError] = useState(null);
  // A token is single-use: React's development double-invoke of effects must
  // not send it twice, or the second call would report a used link.
  const sent = useRef(false);

  useEffect(() => {
    document.title = "Verify your email · EduHub";
  }, []);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setState("done"))
      .catch((err) => {
        setError(apiErrorMessage(err, { fallback: "Could not verify your email address." }));
        setState("failed");
      });
  }, [token]);

  // Once verified, refresh the signed-in user so the "verify your email"
  // banner disappears everywhere.
  useEffect(() => {
    if (state === "done" && isAuthenticated) refreshUser().catch(() => {});
  }, [state, isAuthenticated, refreshUser]);

  const next = isAuthenticated ? "/profile" : "/login";

  return (
    <AuthCard title="Verify your email">
      {state === "working" && (
        <div className="flex items-center gap-3 text-gray-600" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-700" />
          Checking your link…
        </div>
      )}

      {state === "done" && (
        <>
          <Alert tone="success">Your email address is verified.</Alert>
          <Link
            to={next}
            className="mt-6 block w-full rounded-lg bg-blue-700 py-2.5 text-center font-semibold text-white hover:bg-blue-800"
          >
            {isAuthenticated ? "Go to your profile" : "Sign in"}
          </Link>
        </>
      )}

      {state === "failed" && (
        <>
          <Alert>{error}</Alert>
          <p className="mt-4 text-sm text-gray-600">
            Links work once and expire after 24 hours.{" "}
            {isAuthenticated ? (
              <>
                You can send a new one from{" "}
                <Link to="/profile" className="font-medium text-blue-700 underline">
                  your profile
                </Link>
                .
              </>
            ) : (
              <>
                <Link to="/login" className="font-medium text-blue-700 underline">
                  Sign in
                </Link>{" "}
                to send a new one.
              </>
            )}
          </p>
        </>
      )}

      {state === "missing" && (
        <Alert>The verification link is missing its code. Open it again from the email.</Alert>
      )}
    </AuthCard>
  );
};

export default VerifyEmailPage;
