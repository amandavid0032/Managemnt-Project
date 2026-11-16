import React from "react";
import { MembershipStatusBadge, humanise } from "../ui/Badge.jsx";

const formatMonth = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null;

const period = (entry) => {
  const start = formatMonth(entry.joinedAt);
  const end = entry.current ? "Present" : formatMonth(entry.leftAt);
  if (!start && !end) return null;
  return `${start ?? "Start date not recorded"} – ${end ?? "end date not recorded"}`;
};

/**
 * Education history, built from institution memberships.
 *
 * Every entry was created by the institution itself, so there is nothing to
 * "add" here — and no button pretending otherwise. `showPrivate` adds the
 * member ID and non-final statuses, for the owner's own view only.
 */
const EducationList = ({ entries, showPrivate = false, emptyText }) => {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText ?? "No education history yet."}</p>;
  }

  return (
    <ol className="divide-y divide-gray-100">
      {entries.map((entry) => {
        const when = period(entry);
        const place = [entry.institution.city, entry.institution.countryCode].filter(Boolean).join(", ");
        return (
          <li key={entry.membershipId} className="flex gap-4 py-4">
            <div
              aria-hidden="true"
              className={`mt-1 h-3 w-3 flex-none rounded-full ${entry.current ? "bg-blue-600" : "bg-gray-300"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* Plain text: the web app has no institution detail page yet,
                    so a link here would lead nowhere useful. */}
                <h3 className="font-semibold text-gray-900">{entry.institution.name}</h3>
                {(showPrivate || entry.status !== "ACTIVE") && entry.status !== "LEFT" && (
                  <MembershipStatusBadge status={entry.status} />
                )}
              </div>
              <p className="text-sm text-gray-700">
                {humanise(entry.role)}
                {place && <span className="text-gray-500"> · {place}</span>}
              </p>
              {when && <p className="text-sm text-gray-500">{when}</p>}
              {showPrivate && entry.institutionMemberId && (
                <p className="mt-1 text-xs text-gray-500">
                  Member ID {entry.institutionMemberId}{" "}
                  <span className="text-gray-400">(only you can see this)</span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default EducationList;
