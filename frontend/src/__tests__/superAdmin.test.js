import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthContext from "../auth/AuthContext.jsx";
import AdminLayout from "../pages/admin/AdminLayout.jsx";
import AdminDashboardPage from "../pages/admin/AdminDashboardPage.jsx";
import SettingsPage from "../pages/admin/SettingsPage.jsx";
import PlannedModulePage from "../pages/admin/PlannedModulePage.jsx";
import StatusChangeDialog, { transitionLabel } from "../components/admin/StatusChangeDialog.jsx";
import { crumbsFor } from "../pages/admin/adminNav.js";
import { toCsv } from "../utils/format.js";
import adminApi from "../api/adminApi.js";

jest.mock("../api/axiosClient.js", () => ({
  __esModule: true,
  default: {},
  setAccessToken: jest.fn(),
  refreshAccessToken: jest.fn(),
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock("../api/adminApi.js", () => ({
  __esModule: true,
  default: {
    overview: jest.fn(),
    activity: jest.fn(),
    distribution: jest.fn(),
    systemHealth: jest.fn(),
    registrations: jest.fn(),
    settings: jest.fn(),
    institutions: { changeStatus: jest.fn() },
  },
}));

const session = (role = "SUPER_ADMIN") => ({
  status: "authed",
  isAuthenticated: true,
  isLoading: false,
  user: { id: "me", fullName: "Ada Owner", email: "ada@example.test", platformRole: role },
  platformRole: role,
  memberships: [],
  logout: jest.fn(),
  logoutEverywhere: jest.fn(),
  refreshUser: jest.fn(),
});

const renderAdmin = (path, auth, element) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={element ?? <p>dashboard</p>} />
            <Route path="*" element={element ?? <p>page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

const KPIS = {
  generatedAt: "2026-11-14T10:00:00.000Z",
  kpis: {
    totalUsers: { value: 1234, newRegistrations: { windowDays: 30, current: 12, previous: 7 } },
    totalInstitutions: { value: 56, newRegistrations: { windowDays: 30, current: 0, previous: 3 } },
    publishedInstitutions: { value: 40 },
    pendingApprovals: { value: 5 },
    activeStudents: { value: 900 },
    activeTeachers: { value: 80 },
    platformAdmins: { value: 3 },
    suspendedAccounts: { value: 2 },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("admin navigation", () => {
  it("shows every section, marks unbuilt modules as planned, and hides settings from platform admins", () => {
    renderAdmin("/admin", session("PLATFORM_ADMIN"));
    const nav = screen.getAllByRole("navigation", { name: "Admin sections" })[0];
    for (const label of ["Dashboard", "Institutions", "Users & Accounts", "Roles & Permissions", "Verification & Approvals", "Audit Logs", "System Health"]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    expect(within(nav).getByText("Academic Structure").closest("a")).toHaveTextContent("Planned");
    expect(within(nav).queryByText("Platform Settings")).not.toBeInTheDocument();
  });

  it("shows settings to a super admin", () => {
    renderAdmin("/admin", session("SUPER_ADMIN"));
    expect(screen.getAllByText("Platform Settings").length).toBeGreaterThan(0);
  });

  it("has no notifications bell, because there is no notification store", () => {
    renderAdmin("/admin", session());
    expect(screen.queryByRole("button", { name: /notification/i })).not.toBeInTheDocument();
  });

  it("builds breadcrumbs from the route", () => {
    expect(crumbsFor("/admin").map((c) => c.label)).toEqual(["Admin", "Dashboard"]);
    expect(crumbsFor("/admin/institutions/abc").map((c) => c.label)).toEqual(["Admin", "Institutions", "Details"]);
    expect(crumbsFor("/admin/institutions/new").map((c) => c.label)).toEqual(["Admin", "Institutions", "New"]);
    expect(crumbsFor("/admin/audit-logs").map((c) => c.label)).toEqual(["Admin", "Audit Logs"]);
  });
});

describe("dashboard", () => {
  beforeEach(() => {
    adminApi.overview.mockResolvedValue(KPIS);
    adminApi.activity.mockResolvedValue({
      recentUsers: [],
      recentInstitutions: [],
      recentlyPublished: [],
      adminActions: [],
      pendingApprovals: { total: 0, rows: [] },
    });
    adminApi.distribution.mockResolvedValue({
      institutions: { byStatus: { PUBLISHED: 0, PENDING_REVIEW: 0, DRAFT: 0, SUSPENDED: 0 }, byCategory: [], byCountry: [] },
      users: { byCountry: null, byCountryUnavailableReason: "Accounts do not record a country." },
    });
    adminApi.systemHealth.mockResolvedValue({
      api: { status: "up", environment: "test" },
      database: { status: "up", latencyMs: 1.2 },
      errors: { serverErrors: 0, since: "2026-11-14T09:00:00.000Z" },
      mail: { provider: "console", configured: false },
    });
    adminApi.registrations.mockResolvedValue({
      granularity: "day",
      from: "2026-10-15T00:00:00.000Z",
      to: "2026-11-14T00:00:00.000Z",
      totals: { users: 1, institutions: 0 },
      series: [{ bucket: "2026-11-14T00:00:00.000Z", users: 1, institutions: 0 }],
    });
  });

  it("shows all eight real figures, each linking to its filtered list", async () => {
    renderAdmin("/admin", session(), <AdminDashboardPage />);
    await screen.findByText("1,234");
    const expectations = [
      ["Total users", "/admin/users"],
      ["Total institutions", "/admin/institutions"],
      ["Published institutions", "/admin/institutions?status=PUBLISHED"],
      ["Pending approvals", "/admin/approvals"],
      ["Active students", "/admin/users?membershipRole=STUDENT"],
      ["Active teachers", "/admin/users?membershipRole=TEACHER"],
      ["Platform admins", "/admin/roles"],
      ["Suspended accounts", "/admin/users?status=SUSPENDED"],
    ];
    const cards = screen.getByRole("region", { name: "Key figures" });
    for (const [label, href] of expectations) {
      expect(within(cards).getByText(label).closest("a")).toHaveAttribute("href", href);
    }
  });

  it("shows a trend only where the API supplied one", async () => {
    renderAdmin("/admin", session(), <AdminDashboardPage />);
    await screen.findByText("1,234");
    expect(screen.getByText(/12 new/)).toBeInTheDocument();
    // Status-based cards have no history, so no comparison is drawn.
    const published = screen.getByText("Published institutions").closest("a");
    expect(published).not.toHaveTextContent(/new/);
  });

  it("says plainly when nothing has been recorded", async () => {
    renderAdmin("/admin", session(), <AdminDashboardPage />);
    expect(await screen.findByText(/No administrative actions recorded yet/)).toBeInTheDocument();
    expect(await screen.findByText(/Nothing is waiting for review/)).toBeInTheDocument();
    expect(await screen.findByText(/Users by country: not available/)).toBeInTheDocument();
  });

  it("degrades one panel, not the page, when an endpoint fails", async () => {
    adminApi.overview.mockRejectedValue({ response: { data: { error: { message: "Database unavailable" } } } });
    renderAdmin("/admin", session(), <AdminDashboardPage />);
    expect(await screen.findByText(/Database unavailable|Could not load/)).toBeInTheDocument();
    expect(await screen.findByText(/Nothing is waiting for review/)).toBeInTheDocument();
  });
});

describe("institution review dialog", () => {
  const inst = { id: "i1", name: "North High", status: "PENDING_REVIEW" };

  it("labels transitions by what they mean", () => {
    expect(transitionLabel("PENDING_REVIEW", "PUBLISHED")).toBe("Approve & publish");
    expect(transitionLabel("PENDING_REVIEW", "DRAFT")).toBe("Reject");
    expect(transitionLabel("SUSPENDED", "PUBLISHED")).toBe("Reactivate");
    expect(transitionLabel("PUBLISHED", "SUSPENDED")).toBe("Suspend");
  });

  it("will not reject without a reason, and sends the reason it was given", async () => {
    adminApi.institutions.changeStatus.mockResolvedValue({ ...inst, status: "DRAFT" });
    const onDone = jest.fn();
    render(<StatusChangeDialog action={{ institution: inst, status: "DRAFT" }} onDone={onDone} onCancel={jest.fn()} />);

    const reject = screen.getByRole("button", { name: "Reject" });
    expect(reject).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "  Wrong website  " } });
    expect(reject).toBeEnabled();
    fireEvent.click(reject);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(adminApi.institutions.changeStatus).toHaveBeenCalledWith("i1", "DRAFT", "Wrong website");
  });

  it("approves without asking for a reason", async () => {
    adminApi.institutions.changeStatus.mockResolvedValue({ ...inst, status: "PUBLISHED" });
    render(<StatusChangeDialog action={{ institution: inst, status: "PUBLISHED" }} onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByLabelText(/Reason/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve & publish" }));
    await waitFor(() => expect(adminApi.institutions.changeStatus).toHaveBeenCalledWith("i1", "PUBLISHED", undefined));
  });

  it("shows the server's refusal instead of closing", async () => {
    adminApi.institutions.changeStatus.mockRejectedValue({ response: { data: { error: { message: "Cannot go from PENDING_REVIEW to SUSPENDED" } } } });
    const onDone = jest.fn();
    render(<StatusChangeDialog action={{ institution: inst, status: "PUBLISHED" }} onDone={onDone} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve & publish" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("settings and planned modules", () => {
  it("does not even request settings for a platform admin", () => {
    renderAdmin("/admin/settings", session("PLATFORM_ADMIN"), <SettingsPage />);
    expect(screen.getByText(/visible to Super Admins only/)).toBeInTheDocument();
    expect(adminApi.settings).not.toHaveBeenCalled();
  });

  it("planned modules say they are not built and offer no actions", () => {
    renderAdmin("/admin/moderation", session(), <PlannedModulePage module="moderation" />);
    expect(screen.getByText("Not built yet")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("CSV export", () => {
  it("quotes values and neutralises spreadsheet formulas", () => {
    const csv = toCsv(
      [
        { label: "name", value: (r) => r.name },
        { label: "n", value: (r) => r.n },
      ],
      [
        { name: 'Say "hi", world', n: 1 },
        { name: "=HYPERLINK(\"http://evil\")", n: null },
      ],
    );
    expect(csv.split("\r\n")).toEqual([
      '"name","n"',
      '"Say ""hi"", world","1"',
      '"\'=HYPERLINK(""http://evil"")",""',
    ]);
  });
});
