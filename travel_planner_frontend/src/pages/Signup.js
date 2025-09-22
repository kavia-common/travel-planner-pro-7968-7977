import React, { useState } from "react";
import "../index.css";
import { signup, isValidEmail } from "../auth";

// PUBLIC_INTERFACE
export default function Signup({ onSuccess, goToLogin }) {
  /** Ocean Professional styled Signup page. Validates inputs and saves new users into localStorage. */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [cpw, setCpw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function validate() {
    const errs = [];
    if (!name.trim()) errs.push("Please enter your name.");
    if (!isValidEmail(email)) errs.push("Please enter a valid email.");
    if (!pw || pw.length < 6) errs.push("Password must be at least 6 characters.");
    if (pw !== cpw) errs.push("Passwords do not match.");
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    const errs = validate();
    if (errs.length) {
      setError(errs.join(" "));
      return;
    }
    setBusy(true);
    try {
      const res = signup({ email, password: pw, name });
      if (!res.ok) {
        setError(res.error || "Signup failed.");
      } else {
        setSuccessMsg("Account created successfully. You can now sign in.");
        // Optionally auto-redirect to login after a short delay
        setTimeout(() => goToLogin?.(), 900);
        onSuccess?.(res.user);
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
          <span className="badge">Create account</span>
        </div>
      </nav>

      <main style={{ display: "grid", placeItems: "center", padding: 16, flex: 1 }}>
        <div className="panel" style={{ width: "min(480px, 92vw)" }}>
          <h3 style={{ margin: "0 0 8px" }}>Create your account</h3>
          <p style={{ marginTop: 0, color: "#6B7280" }}>
            Already have an account?{" "}
            <button className="btn ghost" onClick={goToLogin} style={{ padding: "4px 8px" }}>
              Sign in
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
          {successMsg && (
            <div
              className="badge"
              role="status"
              style={{ background: "#ECFDF5", color: "#065F46", borderColor: "#A7F3D0", marginBottom: 8 }}
            >
              {successMsg}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gap: 10 }}>
              <label>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Name</div>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  aria-label="Name"
                />
              </label>
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
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="At least 6 characters"
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
              <label>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Confirm password</div>
                <input
                  className="input"
                  type={show ? "text" : "password"}
                  value={cpw}
                  onChange={(e) => setCpw(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  aria-label="Confirm password"
                />
              </label>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
