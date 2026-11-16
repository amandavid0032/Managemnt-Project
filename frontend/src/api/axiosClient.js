import axios from "axios";

/**
 * The base URL comes from the environment, never from source.
 * Set REACT_APP_API_URL in .env.local for development and in the build
 * environment for deployments.
 */
const baseURL = process.env.REACT_APP_API_URL || "http://localhost:4000/api/v1";

const axiosClient = axios.create({
  baseURL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
  // Required so the httpOnly refresh cookie is sent on auth requests.
  withCredentials: true,
});

/**
 * The access token lives in a module variable — NOT in localStorage or
 * sessionStorage.
 *
 * Anything in web storage is readable by any script on the page, so a single
 * XSS payload can exfiltrate it. A module variable dies with the tab, and the
 * session survives a reload through the httpOnly refresh cookie instead, which
 * JavaScript cannot read at all.
 *
 * It is kept here rather than in React state because the interceptors below
 * are plain functions that run outside the component tree.
 */
let accessToken = null;

/** Called by AuthContext on login, refresh and logout. */
export const setAccessToken = (token) => {
  accessToken = token ?? null;
};

export const getAccessToken = () => accessToken;

/**
 * Notifies the app that the session is unrecoverable, so it can clear its
 * state and route to /login. Set by AuthContext; a module-level callback
 * because interceptors cannot use hooks.
 */
let onSessionExpired = () => {};

export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = typeof handler === "function" ? handler : () => {};
};

/** Endpoints that must never trigger a refresh-and-retry. */
const AUTH_ENDPOINTS = [
  "/auth/login",
  "/auth/refresh",
  "/auth/register",
  "/auth/logout",
  // Anonymous by nature: a 401 here can never be fixed by refreshing a
  // session the person does not have.
  "/auth/password/",
  "/auth/email/verify",
];

const isAuthEndpoint = (url = "") => AUTH_ENDPOINTS.some((path) => url.includes(path));

axiosClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/**
 * One shared refresh promise.
 *
 * Without this, a page that fires five requests at once after the 15-minute
 * access token expires would send five refreshes. Because the API ROTATES
 * refresh tokens and treats a reused one as theft, four of those would be
 * replays — and the whole token family would be revoked, logging the user out
 * for simply loading a page. Every caller awaits the same refresh instead.
 */
let refreshPromise = null;

const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = axiosClient
      .post("/auth/refresh")
      .then((res) => {
        const token = res.data?.data?.accessToken ?? null;
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

export { refreshAccessToken };

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    // Only a 401 is recoverable. A 403 means authenticated but not permitted —
    // refreshing the token would change nothing.
    if (
      response?.status !== 401 ||
      !config ||
      config._retried ||
      isAuthEndpoint(config.url)
    ) {
      return Promise.reject(error);
    }

    config._retried = true;

    try {
      const token = await refreshAccessToken();
      if (!token) throw error;
      config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
      return axiosClient(config);
    } catch (refreshError) {
      // The refresh cookie is gone, expired or revoked: the session is over.
      setAccessToken(null);
      onSessionExpired();
      return Promise.reject(refreshError);
    }
  },
);

export default axiosClient;
