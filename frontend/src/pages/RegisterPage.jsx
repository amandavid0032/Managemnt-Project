import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import authApi from "../api/authApi.js";
import { apiErrorMessage } from "../api/apiError.js";
import { useAuth } from "../auth/AuthContext.jsx";
import AuthCard, { Alert, PrimaryButton } from "../components/auth/AuthCard.jsx";
import PasswordRules, { passwordIsValid } from "../components/auth/PasswordRules.jsx";
import { Field, TextInput } from "../components/ui/Field.jsx";

/**
 * Self-service sign-up. Always creates a plain USER — there is no role field
 * here because the API has none either. School roles are granted by a
 * school's administrator; platform roles by nobody through the web at all.
 */
const RegisterPage = () => {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Create an account · EduHub";
  }, []);

  if (!isLoading && isAuthenticated) return <Navigate to="/profile" replace />;

  const canSubmit = fullName.trim().length >= 2 && email.trim() && passwordIsValid(password);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const normalisedEmail = email.trim().toLowerCase();
      await authApi.register({ email: normalisedEmail, password, fullName: fullName.trim() });
      await login(normalisedEmail, password);
      navigate("/profile", { replace: true, state: { justRegistered: true } });
    } catch (err) {
      setError(
        apiErrorMessage(err, {
          fallback: "Could not create your account. Please try again.",
          overrides: { 409: "An account with this email already exists. Try signing in instead." },
        }),
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="One account for discovering institutions and for every school you belong to."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-blue-700 hover:text-blue-900">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}

        <Field id="fullName" label="Full name" required>
          <TextInput
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            disabled={submitting}
          />
        </Field>

        <Field id="email" label="Email address" required hint="We will send a link to confirm it.">
          <TextInput
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            disabled={submitting}
          />
        </Field>

        <Field id="password" label="Password" required>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            disabled={submitting}
            aria-describedby="password-rules"
          />
          <div id="password-rules">
            <PasswordRules password={password} />
          </div>
        </Field>

        <PrimaryButton type="submit" busy={submitting} busyLabel="Creating account…" disabled={!canSubmit}>
          Create account
        </PrimaryButton>
      </form>
    </AuthCard>
  );
};

export default RegisterPage;
