import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthContext from "../auth/AuthContext.jsx";
import { ProtectedRoute, RoleRoute } from "../auth/ProtectedRoute.jsx";
import { PLATFORM_ADMIN_ROLES } from "../auth/landing.js";
import SchoolDashboardPage from "../pages/school/SchoolDashboardPage.jsx";
import MembersPanel from "../components/members/MembersPanel.jsx";
import schoolApi from "../api/schoolApi.js";

// The real modules import axios, which CRA's Jest cannot parse as ESM. They
// are replaced wholesale; these tests are about what the UI shows and hides.
jest.mock("../api/axiosClient.js", () => ({
  __esModule: true,
  default: {},
  setAccessToken: jest.fn(),
  refreshAccessToken: jest.fn(),
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock("../api/authApi.js", () => ({ __esModule: true, default: { resendVerification: jest.fn() } }));
jest.mock("../api/schoolApi.js", () => ({
  __esModule: true,
  default: {
    overview: jest.fn(),
    members: { list: jest.fn(), lookup: jest.fn(), add: jest.fn(), update: jest.fn(), changeStatus: jest.fn() },
  },
}));

const session = (overrides = {}) => ({
  status: "authed",
  isAuthenticated: true,
  isLoading: false,
  user: { id: "u1", fullName: "Test Person", email: "t@example.com", emailVerifiedAt: "2026-01-01", platformRole: "USER" },
  platformRole: "USER",
  memberships: [],
  login: jest.fn(),
  logout: jest.fn(),
  logoutEverywhere: jest.fn(),
  refreshUser: jest.fn().mockResolvedValue(null),
  ...overrides,
});

const renderAt = (path, auth) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>home page</p>} />
          <Route path="/login" element={<p>login page</p>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<p>profile page</p>} />
            <Route path="/school/:slug" element={<SchoolDashboardPage />} />
          </Route>
          <Route element={<RoleRoute roles={PLATFORM_ADMIN_ROLES} />}>
            <Route path="/admin" element={<p>admin page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

beforeEach(() => jest.clearAllMocks());

describe("route guards", () => {
  it("sends an anonymous visitor from /profile to sign in", () => {
    renderAt("/profile", session({ status: "anon", isAuthenticated: false, user: null, platformRole: null }));
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("decides nothing while the session is still being restored", () => {
    renderAt("/profile", session({ status: "loading", isLoading: true, isAuthenticated: false }));
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("keeps a school administrator (platform USER) out of /admin", () => {
    renderAt(
      "/admin",
      session({ memberships: [{ institutionId: "i1", slug: "north", name: "North", role: "INSTITUTION_ADMIN" }] }),
    );
    expect(screen.getByText("home page")).toBeInTheDocument();
  });
});

describe("school dashboard access", () => {
  it("shows no dashboard — and makes no API call — for a student of that school", () => {
    renderAt(
      "/school/north",
      session({ memberships: [{ institutionId: "i1", slug: "north", name: "North", role: "STUDENT" }] }),
    );
    expect(screen.getByText("No dashboard here")).toBeInTheDocument();
    expect(schoolApi.overview).not.toHaveBeenCalled();
  });

  it("shows no dashboard for a school the person does not belong to", () => {
    renderAt(
      "/school/south",
      session({ memberships: [{ institutionId: "i1", slug: "north", name: "North", role: "INSTITUTION_ADMIN" }] }),
    );
    expect(screen.getByText("No dashboard here")).toBeInTheDocument();
    expect(schoolApi.overview).not.toHaveBeenCalled();
  });

  it("loads the overview using the id from the person's own membership", async () => {
    schoolApi.overview.mockResolvedValue({
      institution: { id: "i1", name: "North School", category: "SCHOOL", status: "PUBLISHED", countryCode: "GB", createdAt: "2026-01-01" },
      members: { active: { students: 7, teachers: 2, staff: 1, administrators: 1, total: 11 }, pending: 0, suspended: 0, former: 3 },
      viewer: { role: "STAFF", canManage: false, platformOverride: false, membership: null },
    });
    schoolApi.members.list.mockResolvedValue({ rows: [], pagination: null });

    renderAt(
      "/school/north",
      session({ memberships: [{ institutionId: "i1", slug: "north", name: "North", role: "STAFF" }] }),
    );

    expect(await screen.findByRole("heading", { name: "North School" })).toBeInTheDocument();
    expect(schoolApi.overview).toHaveBeenCalledWith("i1");
    // Counts come from the API response, verbatim.
    expect(screen.getByText("7")).toBeInTheDocument();
    // Staff get no management controls.
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
  });
});

describe("MembersPanel", () => {
  const member = {
    id: "m1",
    role: "STUDENT",
    status: "ACTIVE",
    institutionMemberId: "S-1",
    joinedAt: "2025-09-01",
    leftAt: null,
    user: { id: "u2", fullName: "Sue Student", email: "sue@example.com" },
  };

  const renderPanel = (canManage) =>
    render(
      <MemoryRouter>
        <MembersPanel institutionId="i1" canManage={canManage} />
      </MemoryRouter>,
    );

  it("read-only viewers see members but no actions", async () => {
    schoolApi.members.list.mockResolvedValue({ rows: [member], pagination: null });
    renderPanel(false);
    expect(await screen.findByText("Sue Student")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End" })).not.toBeInTheDocument();
  });

  it("administrators get add, role change, suspend and end", async () => {
    schoolApi.members.list.mockResolvedValue({ rows: [member], pagination: null });
    renderPanel(true);
    expect(await screen.findByText("Sue Student")).toBeInTheDocument();
    for (const name of ["Add member", "Change role", "Suspend", "End"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("an ended membership is shown as history with no actions", async () => {
    schoolApi.members.list.mockResolvedValue({
      rows: [{ ...member, status: "LEFT", leftAt: "2026-06-30" }],
      pagination: null,
    });
    renderPanel(true);
    expect(await screen.findByText("Sue Student")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change role" })).not.toBeInTheDocument();
  });

  it("shows a load failure with a retry instead of an empty table", async () => {
    schoolApi.members.list.mockRejectedValue({ response: { status: 500, data: {} } });
    renderPanel(true);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not load members/i));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
