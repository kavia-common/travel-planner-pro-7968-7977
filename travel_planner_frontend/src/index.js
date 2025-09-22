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
