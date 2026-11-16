import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FaGraduationCap } from "react-icons/fa";
import profileApi from "../../api/profileApi.js";
import { apiErrorMessage } from "../../api/apiError.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import Avatar from "../../components/profile/Avatar.jsx";
import EducationList from "../../components/profile/EducationList.jsx";

const VISIBILITY_NOTE = {
  PRIVATE: "Only you can see this profile.",
  MEMBERS: "Signed-in EduHub users can see this profile.",
  PUBLIC: "Anyone with the link can see this profile.",
};

/**
 * Someone's profile as others see it. Readable signed out, because PUBLIC
 * profiles are meant to be shareable. The API decides what may be shown; a
 * private profile and a non-existent one both arrive as the same 404.
 */
const PublicProfilePage = () => {
  const { userId } = useParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    // Wait for the session: a MEMBERS-only profile depends on whether the
    // viewer is signed in, and asking too early would show a false 404.
    if (isLoading) return undefined;
    let cancelled = false;
    setState("loading");
    profileApi
      .getPublic(userId)
      .then((result) => {
        if (cancelled) return;
        setProfile(result);
        setState("ready");
        document.title = `${result.fullName} · EduHub`;
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        setState(status === 404 || status === 400 ? "hidden" : "error");
        setError(apiErrorMessage(err, { fallback: "Could not load this profile." }));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isLoading]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-xl font-extrabold text-blue-800">
            <FaGraduationCap aria-hidden="true" />
            EduHub
          </Link>
          {!isLoading && (
            <Link
              to={isAuthenticated ? "/profile" : "/login"}
              className="text-sm font-medium text-blue-700 hover:text-blue-900"
            >
              {isAuthenticated ? "My profile" : "Sign in"}
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {state === "loading" && (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-500" role="status">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-700" />
            Loading profile…
          </div>
        )}

        {state === "hidden" && (
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-gray-900">This profile is not available</h1>
            <p className="mt-2 text-sm text-gray-600">
              It may be private, or the link may be wrong.
              {!isAuthenticated && " Some profiles are only visible to signed-in users."}
            </p>
            {!isAuthenticated && (
              <Link
                to="/login"
                className="mt-5 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Sign in
              </Link>
            )}
          </div>
        )}

        {state === "error" && (
          <div role="alert" className="rounded-xl bg-white p-8 text-center text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {state === "ready" && profile && (
          <div className="space-y-6">
            {profile.isOwner && (
              <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  This is how others see you. {VISIBILITY_NOTE[profile.visibility]}
                </span>
                <Link to="/profile" className="font-medium underline">
                  Edit profile
                </Link>
              </div>
            )}

            <section className="rounded-xl bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row">
                <Avatar name={profile.fullName} />
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900">{profile.fullName}</h1>
                  {profile.headline && <p className="text-gray-700">{profile.headline}</p>}
                  {profile.location && <p className="text-sm text-gray-500">{profile.location}</p>}
                  <p className="mt-1 text-xs text-gray-400">
                    On EduHub since{" "}
                    {new Date(profile.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
              {profile.bio && <p className="mt-5 whitespace-pre-line text-gray-700">{profile.bio}</p>}
            </section>

            <section className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Education</h2>
              <p className="mb-2 text-sm text-gray-500">Confirmed by each institution.</p>
              <EducationList entries={profile.education} emptyText="No education history to show." />
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicProfilePage;
