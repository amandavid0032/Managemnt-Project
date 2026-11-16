import React from "react";
import { Link } from "react-router-dom";
import { FaGraduationCap } from "react-icons/fa";

/** The centred card shared by sign-in, registration and the email-link pages. */
const AuthCard = ({ title, subtitle, children, footer = null }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 px-4 py-10">
    <Link to="/" className="mb-8 flex items-center gap-2 text-3xl font-extrabold text-blue-800">
      <FaGraduationCap aria-hidden="true" />
      EduHub
    </Link>

    <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>

    {footer && <div className="mt-6 text-sm text-gray-600">{footer}</div>}
  </div>
);

export const Alert = ({ tone = "error", children }) => {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-200 bg-green-50 text-green-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm ${styles[tone]}`}
    >
      {children}
    </div>
  );
};

export const PrimaryButton = ({ children, busy = false, busyLabel = "Working…", ...props }) => (
  <button
    {...props}
    disabled={busy || props.disabled}
    className="w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300"
  >
    {busy ? busyLabel : children}
  </button>
);

export default AuthCard;
