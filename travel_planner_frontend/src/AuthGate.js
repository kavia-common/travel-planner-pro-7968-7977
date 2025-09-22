import React, { useEffect, useState } from "react";
import { getCurrentSession, logout } from "./auth";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

// PUBLIC_INTERFACE
export default function AuthGate({ children }) {
  /** Gates access to children until a valid session exists. Provides Login/Signup flow. */
  const [session, setSession] = useState(null);
  const [view, setView] = useState("login"); // 'login' | 'signup'
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(getCurrentSession());
    setHydrated(true);
  }, []);

  // While localStorage hydration check is running, render a minimal loader to avoid flashing the app
  if (!hydrated) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <span className="badge">Loading…</span>
      </div>
    );
  }

  // If not authenticated, show login or signup and prevent rendering of children
  if (!session) {
    return view === "signup" ? (
      <Signup
        goToLogin={() => setView("login")}
        onSuccess={() => {
          // After successful signup, prompt user to log in
        }}
      />
    ) : (
      <Login
        goToSignup={() => setView("signup")}
        onSuccess={(sess) => setSession(sess)}
      />
    );
  }

  // Authenticated: render children and a subtle user status/logout chip
  return (
    <>
      <div style={{ position: "fixed", top: 10, right: 10, zIndex: 1001 }}>
        <div className="row">
          <span className="badge" title={session.email}>
            Signed in as {session.name || session.email}
          </span>
          <button
            className="btn ghost"
            onClick={() => {
              logout();
              setSession(null);
              setView("login");
            }}
          >
            Logout
          </button>
        </div>
      </div>
      {children}
    </>
  );
}
