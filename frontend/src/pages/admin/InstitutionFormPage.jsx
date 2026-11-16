import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import adminApi from "../../api/adminApi.js";
import { apiErrorDetails, apiErrorMessage } from "../../api/apiError.js";
import { InstitutionStatusBadge, humanise } from "../../components/ui/Badge.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import { Field, Select, TextArea, TextInput } from "../../components/ui/Field.jsx";
import MembersPanel from "../../components/members/MembersPanel.jsx";
import InstitutionRecordPanels from "../../components/admin/InstitutionRecordPanels.jsx";
import StatusChangeDialog, { transitionLabel } from "../../components/admin/StatusChangeDialog.jsx";
import {
  INSTITUTION_CATEGORIES,
  INSTITUTION_STATUS_TRANSITIONS,
  asOptions,
} from "./enums.js";

/**
 * Text fields the API accepts. Coordinates are handled separately because they
 * are numbers and because the API's transform drops null, so they cannot be
 * cleared once set — see `buildPayload`.
 */
const TEXT_FIELDS = [
  "name",
  "legalName",
  "typeLabel",
  "description",
  "email",
  "phone",
  "website",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "countryCode",
];

const EMPTY = Object.fromEntries(
  [...TEXT_FIELDS, "latitude", "longitude"].map((key) => [key, ""]),
);

const toForm = (institution) => ({
  ...EMPTY,
  ...Object.fromEntries(
    Object.entries(institution)
      .filter(([key]) => key in EMPTY)
      .map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)]),
  ),
  category: institution.category ?? "",
});

/**
 * Builds the request body.
 *
 * On CREATE, an empty field is simply left out: sending `email: ""` fails
 * @IsEmail, and "" is not the same as "not provided".
 *
 * On EDIT, a field the user *cleared* is sent as `null` so it is actually
 * erased — omitting it would silently keep the old value, and a save button
 * that quietly ignores a deletion is worse than one that errors. `null` is
 * only ever sent for columns that are nullable in the schema; `name`,
 * `category` and `countryCode` are required by the form.
 */
function buildPayload(form, original) {
  const payload = {};
  const isEdit = original !== null;

  for (const key of TEXT_FIELDS) {
    const value = form[key].trim();
    if (value !== "") {
      payload[key] = value;
      continue;
    }
    const hadValue = isEdit && original[key] !== null && original[key] !== undefined;
    if (hadValue && !["name", "countryCode"].includes(key)) payload[key] = null;
  }

  if (form.category) payload.category = form.category;

  for (const key of ["latitude", "longitude"]) {
    const value = form[key].trim();
    if (value !== "") payload[key] = Number(value);
    // Deliberately no `null` branch: the API's transform maps null to
    // undefined for these two, so a cleared coordinate cannot be saved.
    // Flagged rather than faked — the form warns the user instead.
  }

  return payload;
}

const InstitutionFormPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState([]);
  const [saved, setSaved] = useState(false);

  const [action, setAction] = useState(null);
  const [statusAction, setStatusAction] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    if (!isEdit) return;
    setLoading(true);
    setLoadError(null);
    adminApi.institutions
      .get(id)
      .then((institution) => {
        setOriginal(institution);
        setForm(toForm(institution));
      })
      .catch((err) =>
        setLoadError(apiErrorMessage(err, { fallback: "Could not load this institution." })),
      )
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  useEffect(load, [load]);

  const set = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setSaved(false);
  };

  const coordinateCleared = useMemo(() => {
    if (!original) return false;
    return ["latitude", "longitude"].some(
      (key) => original[key] !== null && form[key].trim() === "",
    );
  }, [original, form]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setFieldErrors([]);
    setSaved(false);

    try {
      const payload = buildPayload(form, original);
      if (isEdit) {
        const updated = await adminApi.institutions.update(id, payload);
        setOriginal(updated);
        setForm(toForm(updated));
        setSaved(true);
        setHistoryKey((n) => n + 1);
      } else {
        const created = await adminApi.institutions.create(payload);
        // Straight to the edit screen: a new record is a DRAFT, and publishing
        // it is the next thing anyone wants to do.
        navigate(`/admin/institutions/${created.id}`, { replace: true });
      }
    } catch (err) {
      setSaveError(apiErrorMessage(err, { fallback: "The institution could not be saved." }));
      setFieldErrors(apiErrorDetails(err));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await adminApi.institutions.remove(id);
      navigate("/admin/institutions", { replace: true });
    } catch (err) {
      setActionError(apiErrorMessage(err, { fallback: "The change could not be saved." }));
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-500" role="status">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-700" />
        Loading institution…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-red-700">
          {loadError}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Try again
          </button>
          <Link
            to="/admin/institutions"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  const transitions = original ? (INSTITUTION_STATUS_TRANSITIONS[original.status] ?? []) : [];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/institutions" className="text-sm text-gray-600 hover:text-blue-700">
          ← Institutions
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? original.name : "New institution"}
          </h1>
          {original && <InstitutionStatusBadge status={original.status} />}
        </div>
        {original && (
          <p className="mt-1 text-sm text-gray-500">
            {original.slug}
            {original.verifiedAt && " · approved once"}
          </p>
        )}
        {!isEdit && (
          <p className="mt-1 text-sm text-gray-600">
            New records are created as a draft. You can publish it on the next screen.
          </p>
        )}
      </div>

      {/* Lifecycle actions sit outside the form: they save immediately and are
          not part of the content being edited. */}
      {original && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow-sm">
          <span className="mr-1 text-sm font-medium text-gray-700">Lifecycle:</span>
          {transitions.length === 0 ? (
            <span className="text-sm text-gray-500">
              An archived institution cannot change status.
            </span>
          ) : (
            transitions.map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => setStatusAction({ institution: original, status: target })}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                {transitionLabel(original.status, target)}
              </button>
            ))
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setAction({ kind: "delete" })}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Archive
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {saveError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <p className="font-medium">{saveError}</p>
            {fieldErrors.length > 1 && (
              <ul className="mt-2 list-inside list-disc space-y-0.5">
                {fieldErrors.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {saved && (
          <div
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            Changes saved.
          </div>
        )}

        <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Identity</h2>

          <Field id="name" label="Name" required>
            <TextInput id="name" value={form.name} onChange={set("name")} maxLength={300} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="category" label="Category" required>
              <Select
                id="category"
                value={form.category}
                placeholder="Choose a category…"
                options={asOptions(INSTITUTION_CATEGORIES, humanise)}
                onChange={set("category")}
              />
            </Field>

            <Field
              id="typeLabel"
              label="Local type label"
              hint="The local term when the category fits poorly — Gymnasium, Lycée, TAFE."
            >
              <TextInput
                id="typeLabel"
                value={form.typeLabel}
                onChange={set("typeLabel")}
                maxLength={120}
              />
            </Field>
          </div>

          <Field id="legalName" label="Legal name">
            <TextInput
              id="legalName"
              value={form.legalName}
              onChange={set("legalName")}
              maxLength={300}
            />
          </Field>

          <Field id="description" label="Description">
            <TextArea
              id="description"
              value={form.description}
              onChange={set("description")}
              maxLength={10000}
            />
          </Field>
        </section>

        <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="email" label="Email">
              <TextInput id="email" type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field id="phone" label="Phone">
              <TextInput id="phone" value={form.phone} onChange={set("phone")} maxLength={50} />
            </Field>
          </div>
          <Field id="website" label="Website" hint="Must include http:// or https://">
            <TextInput
              id="website"
              value={form.website}
              onChange={set("website")}
              placeholder="https://example.edu"
            />
          </Field>
        </section>

        <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Location</h2>

          <Field id="addressLine1" label="Address line 1">
            <TextInput
              id="addressLine1"
              value={form.addressLine1}
              onChange={set("addressLine1")}
              maxLength={300}
            />
          </Field>
          <Field id="addressLine2" label="Address line 2">
            <TextInput
              id="addressLine2"
              value={form.addressLine2}
              onChange={set("addressLine2")}
              maxLength={300}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="city" label="City">
              <TextInput id="city" value={form.city} onChange={set("city")} maxLength={150} />
            </Field>
            <Field id="state" label="State or region">
              <TextInput id="state" value={form.state} onChange={set("state")} maxLength={150} />
            </Field>
            <Field id="postalCode" label="Postal code">
              <TextInput
                id="postalCode"
                value={form.postalCode}
                onChange={set("postalCode")}
                maxLength={30}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id="countryCode"
              label="Country code"
              required
              hint="Two letters, ISO-3166-1 — GB, IN, US."
            >
              <TextInput
                id="countryCode"
                value={form.countryCode}
                onChange={set("countryCode")}
                maxLength={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field id="latitude" label="Latitude">
              <TextInput
                id="latitude"
                type="number"
                step="any"
                value={form.latitude}
                onChange={set("latitude")}
              />
            </Field>
            <Field id="longitude" label="Longitude">
              <TextInput
                id="longitude"
                type="number"
                step="any"
                value={form.longitude}
                onChange={set("longitude")}
              />
            </Field>
          </div>

          {coordinateCleared && (
            <p role="alert" className="text-xs text-amber-800">
              Clearing a coordinate is not supported by the API yet — the saved value will be
              kept. Overwrite it with a new number instead.
            </p>
          )}
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !form.name || !form.category || !form.countryCode}
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create institution"}
          </button>
          <Link
            to="/admin/institutions"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Platform staff manage any institution's members through the API's
          explicit cross-tenant override, so management is enabled here. */}
      {isEdit && original && <InstitutionRecordPanels institution={original} refreshKey={historyKey} />}

      {isEdit && <MembersPanel institutionId={id} canManage onChanged={() => setHistoryKey((n) => n + 1)} />}

      <StatusChangeDialog
        action={statusAction}
        onCancel={() => setStatusAction(null)}
        onDone={(updated) => {
          setOriginal(updated);
          setStatusAction(null);
          setHistoryKey((n) => n + 1);
        }}
      />

      <ConfirmDialog
        open={action !== null}
        busy={actionBusy}
        error={actionError}
        destructive
        title={`Archive ${original?.name}?`}
        description="The record is archived and hidden everywhere, but kept in the database for audit. Its URL slug becomes available for reuse. The archive is recorded in the audit log."
        confirmLabel="Archive"
        onConfirm={runAction}
        onCancel={() => {
          setAction(null);
          setActionError(null);
        }}
      />
    </div>
  );
};

export default InstitutionFormPage;
