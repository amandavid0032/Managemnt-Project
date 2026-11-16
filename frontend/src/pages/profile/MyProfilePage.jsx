import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import profileApi from "../../api/profileApi.js";
import { apiErrorDetails, apiErrorMessage } from "../../api/apiError.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import AccountLayout from "../../components/layout/AccountLayout.jsx";
import Avatar from "../../components/profile/Avatar.jsx";
import EducationList from "../../components/profile/EducationList.jsx";
import { Field, TextArea, TextInput } from "../../components/ui/Field.jsx";

const VISIBILITY_OPTIONS = [
  {
    value: "PRIVATE",
    label: "Only me",
    description: "Nobody else can open your profile. Schools you belong to still see your name and email.",
  },
  {
    value: "MEMBERS",
    label: "Signed-in EduHub users",
    description: "Anyone with an EduHub account can see your profile. Your email is never shown.",
  },
  {
    value: "PUBLIC",
    label: "Everyone",
    description: "Anyone with the link can see your profile, even without an account. Your email is never shown.",
  },
];

const LIMITS = { fullName: 200, headline: 160, bio: 2000, location: 120 };

const toForm = (data) => ({
  fullName: data.user.fullName ?? "",
  headline: data.profile.headline ?? "",
  bio: data.profile.bio ?? "",
  location: data.profile.location ?? "",
});

const Card = ({ title, description, action = null, children }) => (
  <section className="rounded-xl bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-gray-600">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const MyProfilePage = () => {
  const { refreshUser } = useAuth();
  const location = useLocation();

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState([]);
  const [saved, setSaved] = useState(false);

  const [visibilityDraft, setVisibilityDraft] = useState(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityMessage, setVisibilityMessage] = useState(null);

  useEffect(() => {
    document.title = "My profile · EduHub";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    profileApi
      .getMine()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setVisibilityDraft(result.profile.visibility);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, { fallback: "Could not load your profile." }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const startEditing = () => {
    setForm(toForm(data));
    setSaveErrors([]);
    setSaved(false);
    setEditing(true);
  };

  const setField = useCallback((key) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    const original = toForm(data);
    // Send only what changed: an unchanged field must not be re-validated
    // or overwritten by a concurrent edit in another tab.
    const changes = Object.fromEntries(
      Object.entries(form).filter(([key, value]) => value.trim() !== original[key].trim()),
    );
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    if (changes.fullName !== undefined && changes.fullName.trim().length < 2) {
      setSaveErrors(["Your name must be at least 2 characters."]);
      return;
    }

    setSaving(true);
    setSaveErrors([]);
    try {
      const updated = await profileApi.updateMine(changes);
      setData(updated);
      setEditing(false);
      setSaved(true);
      if (changes.fullName !== undefined) await refreshUser().catch(() => {});
    } catch (err) {
      const details = apiErrorDetails(err);
      setSaveErrors(details.length > 0 ? details : [apiErrorMessage(err, { fallback: "Could not save." })]);
    } finally {
      setSaving(false);
    }
  };

  const handleVisibility = async () => {
    setVisibilityBusy(true);
    setVisibilityMessage(null);
    try {
      const updated = await profileApi.setVisibility(visibilityDraft);
      setData(updated);
      setVisibilityMessage({ tone: "success", text: "Visibility updated." });
    } catch (err) {
      setVisibilityMessage({ tone: "error", text: apiErrorMessage(err, { fallback: "Could not update visibility." }) });
    } finally {
      setVisibilityBusy(false);
    }
  };

  if (loadError) {
    return (
      <AccountLayout>
        <div role="alert" className="rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
            className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Try again
          </button>
        </div>
      </AccountLayout>
    );
  }

  if (!data) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center gap-3 py-20 text-gray-500" role="status">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-700" />
          Loading your profile…
        </div>
      </AccountLayout>
    );
  }

  const { user, profile, education } = data;
  const visibilityChanged = visibilityDraft !== profile.visibility;
  const isEmpty = !profile.headline && !profile.bio && !profile.location;

  return (
    <AccountLayout>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {location.state?.justRegistered && (
            <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
              Welcome to EduHub! Check your inbox for a link to confirm your email address.
            </div>
          )}

          <Card
            title="Profile"
            description="How you appear to others, depending on your visibility setting."
            action={
              !editing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit profile
                </button>
              )
            }
          >
            {saved && !editing && (
              <p role="status" className="mb-4 text-sm text-green-700">
                Profile saved.
              </p>
            )}

            {!editing ? (
              <div className="flex flex-col gap-4 sm:flex-row">
                <Avatar name={user.fullName} />
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900">{user.fullName}</h1>
                  {profile.headline && <p className="text-gray-700">{profile.headline}</p>}
                  {profile.location && <p className="text-sm text-gray-500">{profile.location}</p>}
                  {profile.bio && <p className="mt-3 whitespace-pre-line text-gray-700">{profile.bio}</p>}
                  {isEmpty && (
                    <p className="mt-2 text-sm text-gray-500">
                      Add a headline, a short bio and where you are based, so people know who you are.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4" noValidate>
                {saveErrors.length > 0 && (
                  <ul role="alert" className="list-inside list-disc rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {saveErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}

                <Field id="fullName" label="Full name" required hint="Institutions you belong to also see this name.">
                  <TextInput value={form.fullName} onChange={setField("fullName")} maxLength={LIMITS.fullName} disabled={saving} />
                </Field>
                <Field
                  id="headline"
                  label="Headline"
                  hint={`${form.headline.length}/${LIMITS.headline} — e.g. “Year 12 student, physics and robotics”`}
                >
                  <TextInput value={form.headline} onChange={setField("headline")} maxLength={LIMITS.headline} disabled={saving} />
                </Field>
                <Field id="location" label="Location" hint="Optional. A city or region is plenty.">
                  <TextInput value={form.location} onChange={setField("location")} maxLength={LIMITS.location} disabled={saving} />
                </Field>
                <Field id="bio" label="About you" hint={`${form.bio.length}/${LIMITS.bio}`}>
                  <TextArea rows={5} value={form.bio} onChange={setField("bio")} maxLength={LIMITS.bio} disabled={saving} />
                </Field>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </form>
            )}
          </Card>

          <Card
            title="Education history"
            description="Added by the institutions themselves when they enrol you, so every entry is confirmed by the school."
          >
            <EducationList
              entries={education}
              showPrivate
              emptyText="No institution has added you yet. When a school enrols you, it appears here — including after you leave."
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Who can see your profile">
            <fieldset>
              <legend className="sr-only">Profile visibility</legend>
              <div className="space-y-3">
                {VISIBILITY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                      visibilityDraft === option.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={option.value}
                      checked={visibilityDraft === option.value}
                      onChange={() => {
                        setVisibilityDraft(option.value);
                        setVisibilityMessage(null);
                      }}
                      disabled={visibilityBusy}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                      <span className="block text-xs text-gray-600">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {visibilityMessage && (
              <p
                role={visibilityMessage.tone === "error" ? "alert" : "status"}
                className={`mt-3 text-sm ${visibilityMessage.tone === "error" ? "text-red-700" : "text-green-700"}`}
              >
                {visibilityMessage.text}
              </p>
            )}

            <button
              type="button"
              onClick={handleVisibility}
              disabled={!visibilityChanged || visibilityBusy}
              className="mt-4 w-full rounded-lg bg-blue-700 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {visibilityBusy ? "Saving…" : "Save visibility"}
            </button>

            <Link to={`/u/${user.id}`} className="mt-3 block text-center text-sm font-medium text-blue-700 hover:text-blue-900">
              See your profile as others do →
            </Link>
          </Card>

          <Card title="Account">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="break-all font-medium text-gray-900">{user.email}</dd>
                <dd className={user.emailVerifiedAt ? "text-green-700" : "text-amber-700"}>
                  {user.emailVerifiedAt ? "Verified" : "Not verified yet"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Member since</dt>
                <dd className="text-gray-900">
                  {new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}
                </dd>
              </div>
            </dl>
            <Link to="/forgot-password" className="mt-4 block text-sm font-medium text-blue-700 hover:text-blue-900">
              Change your password
            </Link>
            <p className="mt-1 text-xs text-gray-500">We email you a link. Changing it signs out every device.</p>
          </Card>
        </div>
      </div>
    </AccountLayout>
  );
};

export default MyProfilePage;
