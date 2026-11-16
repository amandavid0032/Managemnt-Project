import axiosClient from "./axiosClient.js";

/**
 * Profiles. Write calls never take a user id: "me" is whoever the access
 * token belongs to, decided by the server.
 */
const profileApi = {
  /** → { user, profile, education } — the owner's full view. */
  getMine: async () => {
    const res = await axiosClient.get("/profiles/me");
    return res.data.data;
  },

  /** Send only the fields being changed. null or "" clears a field. */
  updateMine: async (changes) => {
    const res = await axiosClient.patch("/profiles/me", changes);
    return res.data.data;
  },

  /** PUBLIC | MEMBERS | PRIVATE */
  setVisibility: async (visibility) => {
    const res = await axiosClient.patch("/profiles/me/visibility", { visibility });
    return res.data.data;
  },

  /** 404 when the profile does not exist OR the viewer may not see it. */
  getPublic: async (userId) => {
    const res = await axiosClient.get(`/profiles/${userId}`);
    return res.data.data;
  },
};

export default profileApi;
