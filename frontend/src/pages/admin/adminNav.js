import {
  FaBell,
  FaBookOpen,
  FaBriefcase,
  FaChartBar,
  FaClipboardCheck,
  FaClipboardList,
  FaCog,
  FaDatabase,
  FaGlobeAmericas,
  FaHeartbeat,
  FaShieldAlt,
  FaThLarge,
  FaUniversity,
  FaUsers,
  FaUserShield,
} from "react-icons/fa";

/**
 * The Super Admin navigation.
 *
 * `planned: true` items open a page that says plainly what the module will
 * do and what it needs first — they never open a screen that pretends to
 * work. `superOnly` items are hidden from PLATFORM_ADMIN; the API refuses
 * them independently.
 */
export const ADMIN_NAV = [
  {
    group: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: FaThLarge, end: true }],
  },
  {
    group: "Platform management",
    items: [
      { to: "/admin/institutions", label: "Institutions", icon: FaUniversity },
      { to: "/admin/users", label: "Users & Accounts", icon: FaUsers },
      { to: "/admin/roles", label: "Roles & Permissions", icon: FaUserShield },
      { to: "/admin/countries", label: "Countries & Regions", icon: FaGlobeAmericas },
      { to: "/admin/academic", label: "Academic Structure", icon: FaBookOpen, planned: true },
      { to: "/admin/approvals", label: "Verification & Approvals", icon: FaClipboardCheck },
      { to: "/admin/moderation", label: "Content Moderation", icon: FaShieldAlt, planned: true },
      { to: "/admin/admissions", label: "Admissions & Jobs", icon: FaBriefcase, planned: true },
    ],
  },
  {
    group: "System & operations",
    items: [
      { to: "/admin/analytics", label: "Analytics & Reports", icon: FaChartBar },
      { to: "/admin/notifications", label: "Notifications", icon: FaBell, planned: true },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: FaClipboardList },
      { to: "/admin/settings", label: "Platform Settings", icon: FaCog, superOnly: true },
      // TEMPORARY: schema viewer (see DbSchemaPage.jsx)
      { to: "/admin/db-schema", label: "Database Schema", icon: FaDatabase, superOnly: true },
      { to: "/admin/system", label: "System Health", icon: FaHeartbeat },
    ],
  },
];

/** Breadcrumb label for a path, from the nav plus the few detail routes. */
export const crumbsFor = (pathname) => {
  const crumbs = [{ to: "/admin", label: "Admin" }];
  const all = ADMIN_NAV.flatMap((g) => g.items);
  const section = all
    .filter((i) => i.to !== "/admin" && pathname.startsWith(i.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (!section) {
    if (pathname.startsWith("/admin/search")) crumbs.push({ to: pathname, label: "Search" });
    else crumbs.push({ to: "/admin", label: "Dashboard" });
    return crumbs;
  }
  crumbs.push({ to: section.to, label: section.label });
  const rest = pathname.slice(section.to.length).replace(/^\//, "");
  if (rest === "new") crumbs.push({ to: pathname, label: "New" });
  else if (rest) crumbs.push({ to: pathname, label: "Details" });
  return crumbs;
};
