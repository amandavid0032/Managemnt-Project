import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import authApi from "../api/authApi.js";
import {
  refreshAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from "../api/axiosClient.js";

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};

/**
 * Session state for the whole app.
 *
 * `status` is three-valued on purpose. A boolean `isLoggedIn` cannot express
 * "we have not asked the server yet", and routes that guess during that gap
 * bounce a signed-in user to /login on every page refresh.
 *
 *   "loading"  — restoring from the refresh cookie, decide nothing yet
 *   "authed"   — user is known
 *   "anon"     — definitively not signed in
 */
export const AuthProvider = ({ children }) => {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setMemberships([]);
    setStatus("anon");
  }, []);

  // Kept in a ref so the axios interceptor always calls the current function
  // without the handler being re-registered on every render.
  const clearSessionRef = useRef(clearSession);
  clearSessionRef.current = clearSession;

  useEffect(() => {
    setSessionExpiredHandler(() => clearSessionRef.current());
    return () => setSessionExpiredHandler(null);
  }, []);

  /**
   * Restore the session on page load.
   *
   * The access token was lost with the previous page (it only ever lived in
   * memory), but the refresh cookie survives — so one /auth/refresh followed
   * by /auth/me rebuilds the session without the user retyping a password.
   * A failure here is the normal path for a visitor who is simply not signed
   * in, so it is not an error.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await refreshAccessToken();
        if (!token) throw new Error("No session");
        const profile = await authApi.me();
        if (cancelled) return;
        setUser(profile.user);
        setMemberships(profile.memberships ?? []);
        setStatus("authed");
      } catch {
        if (!cancelled) clearSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const { user: loggedIn, accessToken } = await authApi.login(email, password);
    setAccessToken(accessToken);

    // Fetch memberships straight away: login does not return them, and the
    // router needs them to pick a landing route.
    let profile = { user: loggedIn, memberships: [] };
    try {
      profile = await authApi.me();
    } catch {
      // Non-fatal — the user is signed in, they just have no tenant links yet.
    }

    const signedIn = { user: profile.user ?? loggedIn, memberships: profile.memberships ?? [] };
    setUser(signedIn.user);
    setMemberships(signedIn.memberships);
    setStatus("authed");
    // Both, so the caller can route a school administrator to their school
    // without waiting for the state update to land.
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The server may already consider the session gone. Either way the
      // local state must be cleared, so this failure is deliberately ignored.
    }
    clearSession();
  }, [clearSession]);

  /**
   * Re-reads /auth/me. Called after something changes the account server-side
   * — a new name, a verified email address — so the header and banners stop
   * showing stale values without a full page reload.
   */
  const refreshUser = useCallback(async () => {
    const profile = await authApi.me();
    setUser(profile.user);
    setMemberships(profile.memberships ?? []);
    return profile.user;
  }, []);

  const logoutEverywhere = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } catch {
      // Same reasoning as logout().
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      status,
      user,
      memberships,
      isAuthenticated: status === "authed",
      isLoading: status === "loading",
      platformRole: user?.platformRole ?? null,
      login,
      logout,
      logoutEverywhere,
      refreshUser,
    }),
    [status, user, memberships, login, logout, logoutEverywhere, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
