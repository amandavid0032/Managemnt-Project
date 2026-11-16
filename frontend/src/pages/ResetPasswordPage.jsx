import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import authApi from "../api/authApi.js";
import { apiErrorMessage } from "../api/apiError.js";
import { setAccessToken } from "../api/axiosClient.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AuthCard, { Alert, PrimaryButton } from "../components/auth/AuthCard.jsx";
import PasswordRules, { passwordIsValid } from "../components/auth/PasswordRules.jsx";
import { Field, TextInput } from "../components/ui/Field.jsx";
import useTokenFromHash from "../hooks/useTokenFromHash.js";

const ResetPasswordPage = () => {
  const token = useTokenFromHash();
  const { isAuthenticated, logout } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Choose a new password · EduHub";
  }, []);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = passwordIsValid(password) && confirm === password;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      // The server has just ended every session, this one included. Clear
      // local state to match instead of waiting for the next request to 401.
      setAccessToken(null);
      if (isAuthenticated) await logout();
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: "Could not reset your password. Please try again." }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthCard title="This link is not complete">
        <Alert>
          The reset link is missing its code. Open it again from the email, or request a new one.
        </Alert>
        <p className="mt-4 text-sm">
          <Link to="/forgot-password" className="font-medium text-blue-700 hover:text-blue-900">
            Request a new link
          </Link>
        </p>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <Alert tone="success">
          Your password has been changed and every device has been signed out, including this one.
        </Alert>
        <Link
          to="/login"
          className="mt-6 block w-full rounded-lg bg-blue-700 py-2.5 text-center font-semibold text-white hover:bg-blue-800"
        >
          Sign in with your new password
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="This signs you out on every device.">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <Alert>
            {error}{" "}
            <Link to="/forgot-password" className="font-medium underline">
              Request a new link
            </Link>
          </Alert>
        )}

        <Field id="password" label="New password" required>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            disabled={submitting}
          />
          <PasswordRules password={password} />
        </Field>

        <Field id="confirm" label="Repeat new password" required>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            maxLength={128}
            disabled={submitting}
            aria-invalid={mismatch}
          />
          {mismatch && <p className="mt-1 text-xs text-red-700">The passwords do not match.</p>}
        </Field>

        <PrimaryButton type="submit" busy={submitting} busyLabel="Saving…" disabled={!canSubmit}>
          Change password
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default ResetPasswordPage;
