import axiosClient from "./axiosClient.js";

/**
 * Platform administration endpoints.
 *
 * All of these are restricted to PLATFORM_ADMIN and SUPER_ADMIN by the API.
 * The UI hides them from everyone else as a courtesy; the server is what
 * actually refuses them.
 *
 * List calls return the whole envelope, because callers need `meta.pagination`
 * alongside the rows. Single-record calls return just the record.
 */
const adminApi = {
  institutions: {
    /** Staff see every status; pass `status` to narrow it. */
    list: async (params) => {
      const res = await axiosClient.get("/institutions", { params });
      return { rows: res.data.data, pagination: res.data.meta?.pagination ?? null };
    },

    get: async (idOrSlug) => {
      const res = await axiosClient.get(`/institutions/${idOrSlug}`);
      return res.data.data;
    },

    create: async (payload) => {
      const res = await axiosClient.post("/institutions", payload);
      return res.data.data;
    },

    update: async (id, payload) => {
      const res = await axiosClient.patch(`/institutions/${id}`, payload);
      return res.data.data;
    },

    /**
     * Publication lifecycle — a separate endpoint from the content PATCH.
     * `reason` is required by the API when rejecting (PENDING_REVIEW -> DRAFT).
     */
    changeStatus: async (id, status, reason) => {
      const res = await axiosClient.patch(`/institutions/${id}/status`, {
        status,
        ...(reason ? { reason } : {}),
      });
      return res.data.data;
    },

    /** Soft delete: the row is archived and retained, not erased. */
    remove: async (id) => {
      const res = await axiosClient.delete(`/institutions/${id}`);
      return res.data.data;
    },

    // Members are managed through schoolApi.members, shared with the school
    // dashboard; platform staff reach any institution via the API override.
  },

  users: {
    list: async (params) => {
      const res = await axiosClient.get("/users", { params });
      return { rows: res.data.data, pagination: res.data.meta?.pagination ?? null };
    },

    get: async (id) => {
      const res = await axiosClient.get(`/users/${id}`);
      return res.data.data;
    },

    stats: async () => {
      const res = await axiosClient.get("/users/stats");
      return res.data.data;
    },

    /** Only ACTIVE or SUSPENDED. Suspending ends the account's sessions at once. */
    changeStatus: async (id, status) => {
      const res = await axiosClient.patch(`/users/${id}/status`, { status });
      return res.data.data;
    },

    /** SUPER_ADMIN only; USER or PLATFORM_ADMIN. Ends the person's sessions. */
    changePlatformRole: async (id, platformRole) => {
      const res = await axiosClient.patch(`/users/${id}/platform-role`, { platformRole });
      return res.data.data;
    },
  },

  /** Read-only figures for the dashboard. Every number is a database query. */
  overview: async () => (await axiosClient.get("/admin/overview")).data.data,
  activity: async () => (await axiosClient.get("/admin/activity")).data.data,
  approvals: async () => (await axiosClient.get("/admin/approvals")).data.data,
  registrations: async (params) =>
    (await axiosClient.get("/admin/analytics/registrations", { params })).data.data,
  distribution: async () => (await axiosClient.get("/admin/analytics/distribution")).data.data,
  systemHealth: async () => (await axiosClient.get("/admin/system/health")).data.data,
  /** SUPER_ADMIN only. Secrets come back as "set" / "not set", never values. */
  settings: async () => (await axiosClient.get("/admin/settings")).data.data,

  auditLogs: async (params) => {
    const res = await axiosClient.get("/admin/audit-logs", { params });
    return { rows: res.data.data, pagination: res.data.meta?.pagination ?? null };
  },
};

export default adminApi;
