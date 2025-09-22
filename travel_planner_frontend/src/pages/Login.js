import React, { useState } from "react";
import "../index.css";
import { login, isValidEmail } from "../auth";

// PUBLIC_INTERFACE
export default function Login({ onSuccess, goToSignup }) {
  /** Ocean Professional styled Login page. Validates inputs and logs the user in using localStorage. */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function validate() {
    if (!isValidEmail(email)) return "Please enter a valid email.";
    if (!password) return "Please enter your password.";
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      const res = login({ email, password });
      if (!res.ok) {
        setError(res.error || "Login failed.");
      } else {
        onSuccess?.(res.session);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app" style={{ minHeight: "100vh" }}>
      <nav className="navbar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            Travel Planner
            <div style={{ fontSize: 12, color: "#1D4ED8" }}>Ocean Professional</div>
          </div>
        </div>
        <div className="row">
          <span className="badge">Welcome</span>
        </div>
      </nav>

      <main style={{ display: "grid", placeItems: "center", padding: 16, flex: 1 }}>
        <div className="panel" style={{ width: "min(440px, 92vw)" }}>
          <h3 style={{ margin: "0 0 8px" }}>Sign in</h3>
          <p style={{ marginTop: 0, color: "#6B7280" }}>
            Access your travel planner. Don’t have an account?{" "}
            <button className="btn ghost" onClick={goToSignup} style={{ padding: "4px 8px" }}>
              Create one
            </button>
          </p>
          {error && (
            <div
              className="badge"
              role="alert"
              style={{ background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA", marginBottom: 8 }}
            >
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gap: 10 }}>
              <label>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Email</div>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  aria-label="Email"
                />
              </label>
              <label>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Password</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                  <input
                    className="input"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    aria-label="Password"
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
