const AUTH_RETURN_KEY = "cp.auth-return";
const SAFE_JOIN_PATH = /^\/join\/[A-Z0-9]{4,12}$/;

export function normalizeReturnPath(path: string): string | null {
  const normalized = String(path || "").trim();
  return SAFE_JOIN_PATH.test(normalized) ? normalized : null;
}

export function saveAuthReturnPath(path: string): void {
  const normalized = normalizeReturnPath(path);
  try {
    if (normalized) {
      localStorage.setItem(AUTH_RETURN_KEY, normalized);
    } else {
      localStorage.removeItem(AUTH_RETURN_KEY);
    }
  } catch {
    // If storage is unavailable, sign-in still works without a return route.
  }
}

export function consumeAuthReturnPath(): string | null {
  try {
    const stored = localStorage.getItem(AUTH_RETURN_KEY);
    localStorage.removeItem(AUTH_RETURN_KEY);
    return normalizeReturnPath(stored || "");
  } catch {
    return null;
  }
}
