import { useEffect, useState } from "react";

const readToken = () => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
};

/**
 * Reads `#token=…` from the URL once, then removes it from the address bar.
 *
 * Emailed links carry the token in the fragment rather than the query string:
 * browsers never send the fragment to a server or put it in a Referer header.
 * Removing it afterwards also keeps it out of browser history, screenshots and
 * anything the person copies from the address bar.
 *
 * Reading happens in the state initialiser (pure); removal happens in an
 * effect. Doing both in the initialiser breaks under React StrictMode, which
 * calls initialisers twice — the second call would find the hash gone.
 */
export default function useTokenFromHash() {
  const [token] = useState(readToken);

  useEffect(() => {
    if (token && window.location.hash) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [token]);

  return token;
}
