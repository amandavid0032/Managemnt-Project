import React, { useEffect } from "react";
import { PageHeader, Panel } from "../../components/admin/Panel.jsx";

/**
 * Modules on the roadmap. Each page states what the module will do and what
 * must exist first — no tables of sample rows, no buttons that do nothing.
 */
const PLANS = {
  academic: {
    title: "Academic Structure",
    summary: "Configurable education levels, programmes, courses, subjects, academic years, terms and departments — per country, because systems differ (semesters vs terms, grades vs forms).",
    needs: [
      "Tables: education_levels (per country), programs and courses (per institution), subjects, academic_years and terms (per institution), departments.",
      "Institution admins manage their own structure; platform staff manage the country-level level lists.",
      "Enrollments (Phase 3) then link a membership to a programme and year, which is what makes the structure useful.",
    ],
    phase: "Phase 3 (Programs & Enrollment)",
  },
  moderation: {
    title: "Content Moderation",
    summary: "A queue of reported content — institution descriptions, posts, reviews, comments — with reason, author, reviewer and action history.",
    needs: [
      "Content to moderate. Today the only user-written content is profile bios and institution descriptions; there are no posts, reviews or comments.",
      "A reports table (content type, content id, reporter, reason, status, reviewer, decision) and a 'Report' action where content is shown.",
      "Moderation decisions recorded in the audit log (already in place).",
    ],
    phase: "With the Reviews / social features",
  },
  admissions: {
    title: "Admissions & Jobs",
    summary: "Platform oversight of course admissions, student applications, institution vacancies and teacher recruitment.",
    needs: [
      "Programs (Phase 3) — admissions are applications to a programme.",
      "Applications and vacancies tables, owned by the institution, with the applicant as a user.",
      "File storage for application documents (CVs, transcripts).",
    ],
    phase: "After Phase 3",
  },
  notifications: {
    title: "Notifications",
    summary: "Platform announcements targeted by audience, country or institution, with scheduling and delivery status.",
    needs: [
      "A notifications table and an in-app inbox for users (so there is somewhere for a notification to arrive).",
      "A background job runner for scheduled sends — none exists yet.",
      "A real email provider in production (SMTP is implemented; delivery status needs the provider's webhooks).",
      "Delivery will be shown only when the provider confirms it.",
    ],
    phase: "Not scheduled",
  },
};

const PlannedModulePage = ({ module }) => {
  const plan = PLANS[module];
  useEffect(() => {
    document.title = `${plan.title} · EduHub Admin`;
  }, [plan.title]);

  return (
    <div className="space-y-6">
      <PageHeader title={plan.title} description={plan.summary} />
      <Panel>
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800">Not built yet</span>
          <p className="text-sm text-slate-600">
            This module is planned, not implemented. Nothing on this page reads or changes data. Target: <strong className="text-slate-800">{plan.phase}</strong>.
          </p>
        </div>
        <h2 className="mt-5 text-sm font-semibold text-slate-800">What it needs first</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {plan.needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ol>
      </Panel>
    </div>
  );
};

export default PlannedModulePage;
