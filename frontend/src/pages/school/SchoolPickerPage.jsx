import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.jsx";
import { dashboardMemberships } from "../../auth/landing.js";
import AccountLayout from "../../components/layout/AccountLayout.jsx";
import { humanise } from "../../components/ui/Badge.jsx";

/**
 * For someone with dashboard access at more than one institution. Choosing is
 * explicit: guessing which school a person meant is how a staff member ends
 * up editing the wrong institution's members.
 */
const SchoolPickerPage = () => {
  const { memberships } = useAuth();
  const schools = dashboardMemberships(memberships);
  const others = memberships.filter((m) => !schools.some((s) => s.institutionId === m.institutionId));

  useEffect(() => {
    document.title = "My institutions · EduHub";
  }, []);

  return (
    <AccountLayout>
      <h1 className="text-2xl font-bold text-gray-900">My institutions</h1>
      <p className="mt-1 text-sm text-gray-600">Choose the institution you want to work in.</p>

      {schools.length === 0 ? (
        <div className="mt-6 rounded-xl bg-white p-6 text-sm text-gray-600 shadow-sm">
          You are not an administrator or staff member at any institution, so there is no dashboard to open.
          Your memberships are listed on <Link to="/profile" className="font-medium text-blue-700 underline">your profile</Link>.
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {schools.map((school) => (
            <li key={school.institutionId}>
              <Link
                to={`/school/${school.slug}`}
                className="block rounded-xl bg-white p-5 shadow-sm ring-1 ring-transparent transition hover:ring-blue-500"
              >
                <p className="font-semibold text-gray-900">{school.name}</p>
                <p className="mt-1 text-sm text-gray-600">You are {humanise(school.role).toLowerCase()} here</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <p className="mt-6 text-sm text-gray-500">
          You are also a member of {others.map((m) => `${m.name} (${humanise(m.role).toLowerCase()})`).join(", ")}.
          Those memberships appear in your education history but do not come with a dashboard.
        </p>
      )}
    </AccountLayout>
  );
};

export default SchoolPickerPage;
