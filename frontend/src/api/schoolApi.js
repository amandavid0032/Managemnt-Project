import axiosClient from "./axiosClient.js";

/**
 * One institution's own workspace. Every call is authorised by the API from
 * the caller's membership at that institution — the id in the URL is checked,
 * never trusted.
 */
const schoolApi = {
  /** Institution details + real member counts + who the viewer is there. */
  overview: async (institutionId) => {
    const res = await axiosClient.get(`/institutions/${institutionId}/overview`);
    return res.data.data;
  },

  members: {
    /** Filters: role, status, search; plus page and limit. */
    list: async (institutionId, params) => {
      const res = await axiosClient.get(`/institutions/${institutionId}/memberships`, { params });
      return { rows: res.data.data, pagination: res.data.meta?.pagination ?? null };
    },

    /** Exact email only — there is deliberately no fuzzy people search. */
    lookup: async (institutionId, email) => {
      const res = await axiosClient.get(`/institutions/${institutionId}/memberships/lookup`, {
        params: { email },
      });
      return res.data.data;
    },

    add: async (institutionId, { userId, role, institutionMemberId }) => {
      const res = await axiosClient.post(`/institutions/${institutionId}/memberships`, {
        userId,
        role,
        ...(institutionMemberId ? { institutionMemberId } : {}),
      });
      return res.data.data;
    },

    /** Role and/or member id corrections. */
    update: async (institutionId, membershipId, changes) => {
      const res = await axiosClient.patch(
        `/institutions/${institutionId}/memberships/${membershipId}`,
        changes,
      );
      return res.data.data;
    },

    /** ACTIVE | SUSPENDED | LEFT. LEFT is permanent and kept as history. */
    changeStatus: async (institutionId, membershipId, status) => {
      const res = await axiosClient.patch(
        `/institutions/${institutionId}/memberships/${membershipId}/status`,
        { status },
      );
      return res.data.data;
    },
  },
};

export default schoolApi;
