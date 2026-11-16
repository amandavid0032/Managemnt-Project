import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ProtectedRoute, RoleRoute } from "./auth/ProtectedRoute.jsx";
import { PLATFORM_ADMIN_ROLES } from "./auth/landing.js";
import HomePage from "./components/layout/HomePage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";
import MyProfilePage from "./pages/profile/MyProfilePage.jsx";
import PublicProfilePage from "./pages/profile/PublicProfilePage.jsx";
import SchoolDashboardPage from "./pages/school/SchoolDashboardPage.jsx";
import SchoolPickerPage from "./pages/school/SchoolPickerPage.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage.jsx";
import InstitutionsListPage from "./pages/admin/InstitutionsListPage.jsx";
import InstitutionFormPage from "./pages/admin/InstitutionFormPage.jsx";
import UsersListPage from "./pages/admin/UsersListPage.jsx";
import UserDetailPage from "./pages/admin/UserDetailPage.jsx";
import ApprovalsPage from "./pages/admin/ApprovalsPage.jsx";
import AuditLogsPage from "./pages/admin/AuditLogsPage.jsx";
import RolesPage from "./pages/admin/RolesPage.jsx";
import AnalyticsPage from "./pages/admin/AnalyticsPage.jsx";
import CountriesPage from "./pages/admin/CountriesPage.jsx";
import SystemHealthPage from "./pages/admin/SystemHealthPage.jsx";
import SettingsPage from "./pages/admin/SettingsPage.jsx";
import SearchPage from "./pages/admin/SearchPage.jsx";
import PlannedModulePage from "./pages/admin/PlannedModulePage.jsx";
import DbSchemaPage from "./pages/admin/DbSchemaPage.jsx"; // TEMPORARY

/**
 * AuthProvider sits inside BrowserRouter because it is consumed by components
 * that use router hooks, and outside Routes because the session must be
 * restored once for the whole app rather than per route.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          {/* Opened from emails. Public: the token in the link is the proof. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {/* Public route; the API decides from the profile's visibility. */}
          <Route path="/u/:userId" element={<PublicProfilePage />} />

          {/* Any signed-in user. The school pages check the membership role
              themselves, and the API re-checks it on every request. */}
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<MyProfilePage />} />
            <Route path="/school" element={<SchoolPickerPage />} />
            <Route path="/school/:slug" element={<SchoolDashboardPage />} />
          </Route>

          {/*
            Platform administration. RoleRoute keeps the screens out of sight
            for everyone else; the API independently refuses the requests
            behind them, so this is presentation, not the security boundary.
          */}
          <Route element={<RoleRoute roles={PLATFORM_ADMIN_ROLES} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="institutions" element={<InstitutionsListPage />} />
              {/* 'new' before ':id' so the literal path is not read as an id. */}
              <Route path="institutions/new" element={<InstitutionFormPage />} />
              <Route path="institutions/:id" element={<InstitutionFormPage />} />
              <Route path="users" element={<UsersListPage />} />
              <Route path="users/:id" element={<UserDetailPage />} />
              <Route path="roles" element={<RolesPage />} />
              <Route path="countries" element={<CountriesPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              {/* The API refuses settings to anyone but SUPER_ADMIN; the page
                  also says so rather than showing an error. */}
              <Route path="settings" element={<SettingsPage />} />
              <Route path="system" element={<SystemHealthPage />} />
              <Route path="search" element={<SearchPage />} />
              {/* TEMPORARY: schema viewer */}
              <Route path="db-schema" element={<DbSchemaPage />} />
              {/* Planned modules: an honest plan page, no working-looking UI. */}
              <Route path="academic" element={<PlannedModulePage module="academic" />} />
              <Route path="moderation" element={<PlannedModulePage module="moderation" />} />
              <Route path="admissions" element={<PlannedModulePage module="admissions" />} />
              <Route path="notifications" element={<PlannedModulePage module="notifications" />} />
            </Route>
          </Route>

          {/* Unknown paths go home rather than showing a blank screen. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
