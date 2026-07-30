// Class session lifecycle. The only piece Run Class needs is ending the class:
// closing the session is what stops students being offered "Join class", and it
// stamps actual_end_at, which the reflection grace window is measured from.
import { callFn } from "./client";

const JOINED_SESSION_KEY = "cp.joined-session";

/** Task 3 writes this after an enrolled student resolves a QR join code. */
export function joinedClassSessionId() {
  try {
    return localStorage.getItem(JOINED_SESSION_KEY);
  } catch {
    return null;
  }
}

export function rememberJoinedClassSession(sessionId: string): void {
  try {
    localStorage.setItem(JOINED_SESSION_KEY, sessionId);
  } catch {
    // The refreshed context still carries a live session when storage is blocked.
  }
}

export function endClassSession(sessionId: string, reason?: string) {
  return callFn<{ session: { id: string; state: string; actual_end_at?: string | null } }>(
    "course-session-management",
    { action: "update_session_state", session_id: sessionId, next_state: "closed", reason }
  );
}
