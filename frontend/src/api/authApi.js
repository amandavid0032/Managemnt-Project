import axiosClient from "./axiosClient.js";

/**
 * Authentication endpoints.
 *
 * Every response is wrapped by the API's `{ success, data }` envelope, so each
 * call unwraps `.data.data` and returns the payload the caller actually wants.
 */
const authApi = {
  /** → { user, accessToken }. Also sets the httpOnly refresh cookie. */
  login: async (email, password) => {
    const res = await axiosClient.post("/auth/login", { email, password });
    return res.data.data;
  },

  /** → { user, memberships } — memberships decide which dashboards to offer. */
  me: async () => {
    const res = await axiosClient.get("/auth/me");
    return res.data.data;
  },

  /** → { accessToken }. Used on page load to restore a session from the cookie. */
  refresh: async () => {
    const res = await axiosClient.post("/auth/refresh");
    return res.data.data;
  },

  /** Ends THIS session only. */
  logout: async () => {
    const res = await axiosClient.post("/auth/logout");
    return res.data.data;
  },

  /** Ends every session on every device by bumping the user's tokenVersion. */
  logoutAll: async () => {
    const res = await axiosClient.post("/auth/logout-all");
    return res.data.data;
  },

  /** Creates a USER account and emails a verification link. Does not sign in. */
  register: async ({ email, password, fullName }) => {
    const res = await axiosClient.post("/auth/register", { email, password, fullName });
    return res.data.data;
  },

  /** Same answer whether or not the address is registered — by design. */
  forgotPassword: async (email) => {
    const res = await axiosClient.post("/auth/password/forgot", { email });
    return res.data.data;
  },

  /** Ends every session for the account, including this browser's. */
  resetPassword: async (token, password) => {
    const res = await axiosClient.post("/auth/password/reset", { token, password });
    return res.data.data;
  },

  verifyEmail: async (token) => {
    const res = await axiosClient.post("/auth/email/verify", { token });
    return res.data.data;
  },

  /** Signed-in only: a new link to the caller's own address. */
  resendVerification: async () => {
    const res = await axiosClient.post("/auth/email/resend");
    return res.data.data;
  },
};

export default authApi;
