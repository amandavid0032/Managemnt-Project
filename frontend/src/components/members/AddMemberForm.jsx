import React, { useState } from "react";
import schoolApi from "../../api/schoolApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { humanise } from "../ui/Badge.jsx";
import { Field, Select, TextInput } from "../ui/Field.jsx";

export const MEMBERSHIP_ROLES = ["STUDENT", "TEACHER", "STAFF", "INSTITUTION_ADMIN"];

const ROLE_HINT = {
  STUDENT: "Appears in their education history.",
  TEACHER: "Appears in their education history.",
  STAFF: "Can view this dashboard and the member list, but cannot change anything.",
  INSTITUTION_ADMIN: "Full control of this institution's members. Grants nothing outside this institution.",
};

/**
 * Two steps on purpose: find the person by their exact address, SEE who that
 * is, then add them. Adding straight from a typed address would enrol the
 * wrong account on a single typo.
 */
const AddMemberForm = ({ institutionId, onAdded, onCancel }) => {
  const [email, setEmail] = useState("");
  const [found, setFound] = useState(null);
  const [role, setRole] = useState("STUDENT");
  const [memberId, setMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const lookup = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await schoolApi.members.lookup(institutionId, email.trim().toLowerCase()));
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: "Could not look that address up." }));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await schoolApi.members.add(institutionId, {
        userId: found.id,
        role,
        institutionMemberId: memberId.trim() || undefined,
      });
      onAdded(created);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: "Could not add this member." }));
    } finally {
      setBusy(false);
    }
  };

  const heldRoles = new Set((found?.currentMemberships ?? []).map((m) => m.role));
  const blocked = found && (!found.emailVerified || !found.accountActive);

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
      <h3 className="text-sm font-semibold text-gray-900">Add a member</h3>
      <p className="mb-3 text-xs text-gray-600">
        Enter the exact email address the person uses for EduHub. They must have an account with a verified email.
      </p>

      <form onSubmit={lookup} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1">
          <label htmlFor="member-email" className="sr-only">
            Email address
          </label>
          <TextInput
            id="member-email"
            type="email"
            placeholder="person@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFound(null);
            }}
            disabled={busy}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          {busy && !found ? "Looking up…" : "Find"}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-2 text-sm text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {found && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-medium text-gray-900">{found.fullName}</p>
          <p className="text-sm text-gray-600">{found.email}</p>

          {found.currentMemberships.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Already here as: {found.currentMemberships.map((m) => `${humanise(m.role)} (${humanise(m.status)})`).join(", ")}
            </p>
          )}

          {!found.accountActive && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              This account is not active and cannot be added.
            </p>
          )}
          {found.accountActive && !found.emailVerified && (
            <p role="alert" className="mt-3 text-sm text-amber-800">
              This person has not verified their email address yet, so they cannot be added. Ask them to click the
              link in their verification email (or resend it from their profile), then try again. This protects
              your institution from someone registering with another person's address.
            </p>
          )}

          {!blocked && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="member-role" label="Role" hint={ROLE_HINT[role]}>
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={MEMBERSHIP_ROLES.map((r) => ({
                    value: r,
                    label: heldRoles.has(r) ? `${humanise(r)} (already held)` : humanise(r),
                  }))}
                  disabled={busy}
                />
              </Field>
              <Field id="member-id" label="Member ID" hint="Optional. Roll number or staff ID — an identifier, not a password.">
                <TextInput value={memberId} onChange={(e) => setMemberId(e.target.value)} maxLength={100} disabled={busy} />
              </Field>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={add}
                  disabled={busy || heldRoles.has(role)}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {busy ? "Adding…" : `Add as ${humanise(role)}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddMemberForm;
