import React from "react";
import { render, screen } from "@testing-library/react";
import useTokenFromHash from "../hooks/useTokenFromHash.js";

const Probe = () => <p>token:{useTokenFromHash() ?? "none"}</p>;

describe("useTokenFromHash", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("reads the token from the fragment and then removes it from the address bar", () => {
    window.history.replaceState(null, "", "/reset-password#token=abc_DEF-123");
    render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>,
    );
    // Survives StrictMode's double-invoked initialiser.
    expect(screen.getByText("token:abc_DEF-123")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/reset-password");
  });

  it("ignores a token in the query string — only the fragment is accepted", () => {
    window.history.replaceState(null, "", "/reset-password?token=leaky");
    render(<Probe />);
    expect(screen.getByText("token:none")).toBeInTheDocument();
  });
});
