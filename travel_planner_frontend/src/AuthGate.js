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

  if (!hydrated) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <span className="badge">Loading…</span>
      </div>
    );
  }

  if (!session) {
    return view === "signup" ? (
      <Signup
        goToLogin={() => setView("login")}
        onSuccess={() => {
          // stay on signup and let user proceed to login; session is set on login
        }}
      />
    ) : (
      <Login
        goToSignup={() => setView("signup")}
        onSuccess={(sess) => setSession(sess)}
      />
    );
  }

  return (
    <>
      {/* Inject a small user chip and logout into the UI via a portal-like header if children doesn't own it */}
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
```

Explanation: Integrate AuthGate into the root so the main App (planner) is hidden until authentication is complete. Also, update the navbar status badge in App to reflect authentication (remove the "No login required" label).

````edit file="travel-planner-pro-7968-7977/travel_planner_frontend/src/index.js"
<<<<<<< SEARCH
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// PUBLIC_INTERFACE
function Root() {
  /** Root entry point rendering the Travel Planner app. */
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
=======
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AuthGate from './AuthGate';

// PUBLIC_INTERFACE
function Root() {
  /** Root entry point rendering the Travel Planner app with authentication gate. */
  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
>>>>>>> REPLACE
