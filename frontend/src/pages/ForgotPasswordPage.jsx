import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import authApi from "../api/authApi.js";
import { apiErrorMessage } from "../api/apiError.js";
import AuthCard, { Alert, PrimaryButton } from "../components/auth/AuthCard.jsx";
import { Field, TextInput } from "../components/ui/Field.jsx";

/**
 * The confirmation is the same whether or not the address has an account.
 * Saying "no account with that email" would turn this page into a tool for
 * finding out who uses EduHub.
 */
const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Reset your password · EduHub";
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const normalised = email.trim().toLowerCase();
      await authApi.forgotPassword(normalised);
      setSentTo(normalised);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: "Could not send the email. Please try again." }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email address you sign in with."
      footer={
        <Link to="/login" className="font-medium text-blue-700 hover:text-blue-900">
          ← Back to sign in
        </Link>
      }
    >
      {sentTo ? (
        <div className="space-y-4">
          <Alert tone="success">
            If an EduHub account uses <strong>{sentTo}</strong>, we have sent it a link to choose a new
            password. The link works once and expires in 30 minutes.
          </Alert>
          <p className="text-sm text-gray-600">
            Nothing arrived? Check your spam folder, or{" "}
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="font-medium text-blue-700 underline hover:text-blue-900"
            >
              try another address
            </button>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field id="email" label="Email address" required>
            <TextInput
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </Field>
          <PrimaryButton type="submit" busy={submitting} busyLabel="Sending…" disabled={!email.trim()}>
            Send reset link
          </PrimaryButton>
        </form>
      )}
    </AuthCard>
  );
};

export default ForgotPasswordPage;
