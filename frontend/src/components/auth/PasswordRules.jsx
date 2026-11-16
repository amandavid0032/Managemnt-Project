import React from "react";

/**
 * Mirrors IsNewPassword in api/src/auth/dto/password.rules.ts. Showing the
 * rules as the person types beats discovering them one 400 at a time. The
 * API re-checks every rule, so a drift here produces a clear error, never a
 * weak password.
 */
export const PASSWORD_RULES = [
  { id: "length", label: "At least 12 characters", test: (p) => p.length >= 12 && p.length <= 128 },
  { id: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "A number", test: (p) => /[0-9]/.test(p) },
];

export const passwordIsValid = (password) => PASSWORD_RULES.every((rule) => rule.test(password));

const PasswordRules = ({ password }) => (
  <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
    {PASSWORD_RULES.map((rule) => {
      const met = rule.test(password);
      return (
        <li key={rule.id} className={met ? "text-green-700" : "text-gray-500"}>
          <span aria-hidden="true">{met ? "✓" : "○"}</span> {rule.label}
          <span className="sr-only">{met ? " (met)" : " (not met yet)"}</span>
        </li>
      );
    })}
  </ul>
);

export default PasswordRules;
