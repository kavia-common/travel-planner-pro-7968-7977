//
// Simple client-side authentication utilities using localStorage as a "JSON file".
// PUBLIC_INTERFACE
export const AuthKeys = {
  USERS: "auth_users",
  SESSION: "auth_session",
};

/**
 * Load all users from localStorage.
 * Returns an array of user objects: { id, email, passwordHash, name, createdAt }
 */
export function loadUsers() {
  try {
    const raw = localStorage.getItem(AuthKeys.USERS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Save users array back to localStorage.
 */
function saveUsers(users) {
  try {
    localStorage.setItem(AuthKeys.USERS, JSON.stringify(users));
  } catch {
    // ignore quota issues
  }
}

/**
 * Very light hash substitute to avoid storing plain text.
 * NOT SECURE. For demo only; do NOT use in production.
 */
function pseudoHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
}

// PUBLIC_INTERFACE
export function isValidEmail(email) {
  /** Basic email validation pattern. */
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").toLowerCase());
}

// PUBLIC_INTERFACE
export function getCurrentSession() {
  /** Get current session object: { userId, email, name, loginAt } or null. */
  try {
    const raw = localStorage.getItem(AuthKeys.SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// PUBLIC_INTERFACE
export function logout() {
  /** Clear current session. */
  try {
    localStorage.removeItem(AuthKeys.SESSION);
  } catch {
    // ignore
  }
}

// PUBLIC_INTERFACE
export function signup({ email, password, name }) {
  /**
   * Create a new user and persist to localStorage.
   * - Validates email format and password length >= 6.
   * - Prevents duplicate email.
   * Returns { ok: true, user } on success; { ok: false, error } on failure.
   */
  const errors = [];
  if (!isValidEmail(email)) errors.push("Please enter a valid email address.");
  if (!password || String(password).length < 6)
    errors.push("Password must be at least 6 characters.");
  if (!name || !name.trim()) errors.push("Please enter your name.");

  if (errors.length) return { ok: false, error: errors.join(" ") };

  const users = loadUsers();
  const exists = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return { ok: false, error: "An account with this email already exists." };

  const user = {
    id: `u_${Date.now()}`,
    email: email.trim(),
    passwordHash: pseudoHash(password),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  saveUsers(users);
  return { ok: true, user };
}

// PUBLIC_INTERFACE
export function login({ email, password }) {
  /**
   * Validate credentials against stored users.
   * On success, writes session to localStorage and returns { ok: true, session }.
   * On error, returns { ok: false, error }.
   */
  if (!isValidEmail(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { ok: false, error: "No account found for this email." };

  const hash = pseudoHash(password || "");
  if (user.passwordHash !== hash) {
    return { ok: false, error: "Incorrect password. Please try again." };
  }

  const session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    loginAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(AuthKeys.SESSION, JSON.stringify(session));
  } catch {
    // ignore
  }
  return { ok: true, session };
}
