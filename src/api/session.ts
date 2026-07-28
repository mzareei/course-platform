// Class session lifecycle. The only piece Run Class needs is ending the class:
// closing the session is what stops students being offered "Join class", and it
// stamps actual_end_at, which the reflection grace window is measured from.
import { callFn } from "./client";

export function endClassSession(sessionId: string, reason?: string) {
  return callFn<{ session: { id: string; state: string; actual_end_at?: string | null } }>(
    "course-session-management",
    { action: "update_session_state", session_id: sessionId, next_state: "closed", reason }
  );
}
