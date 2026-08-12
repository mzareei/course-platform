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

export function clearJoinedClassSession(): void {
  try {
    localStorage.removeItem(JOINED_SESSION_KEY);
  } catch {
    // Without storage there is no persisted session to clear.
  }
}

export function endClassSession(sessionId: string, reason?: string) {
  return callFn<{ session: { id: string; state: string; actual_end_at?: string | null } }>(
    "course-session-management",
    { action: "update_session_state", session_id: sessionId, next_state: "closed", reason }
  );
}

/**
 * Ending a class is one click and easy to do by accident — or a rehearsal ends
 * and the real class is still to come. The server already allows a closed
 * session to be continued, so the only thing missing was a way to say so.
 *
 * Two hops on purpose: `closed` may only go to `continued`, and `continued` to
 * `live`. The reason is required by the server on the first hop and lands in
 * the audit log, so a reopened class is never a silent edit.
 */
export async function reopenClassSession(sessionId: string, reason: string) {
  await callFn<{ session: { id: string; state: string } }>(
    "course-session-management",
    {
      action: "update_session_state",
      session_id: sessionId,
      next_state: "continued",
      reason
    }
  );
  return callFn<{ session: { id: string; state: string } }>(
    "course-session-management",
    { action: "update_session_state", session_id: sessionId, next_state: "live" }
  );
}

/**
 * Stop for today without concluding the class.
 *
 * The difference that matters is what pausing does *not* do: closing runs
 * `close_class_session_with_review`, which publishes the lecture to Review and
 * posts every student's grade for the day. A class that ran out of time has
 * earned neither. Pausing leaves the session standing so the same class — same
 * polls, same lecture, same single grade — can be finished next session.
 */
export function pauseClassSession(sessionId: string) {
  return callFn<{ session: { id: string; state: string } }>(
    "course-session-management",
    { action: "update_session_state", session_id: sessionId, next_state: "paused" }
  );
}

/** Back to live. One hop: the server allows paused → live directly. */
export function resumeClassSession(sessionId: string) {
  return callFn<{ session: { id: string; state: string } }>(
    "course-session-management",
    { action: "update_session_state", session_id: sessionId, next_state: "live" }
  );
}

/** What a reset destroyed, so the professor is told rather than reassured. */
export interface ClassResetSummary {
  pulse_rounds: number;
  pulse_answers: number;
  plan_checkpoints_reset: number;
  quiz_instances: number;
  quiz_attempts: number;
  reflections: number;
  participation_events: number;
  class_scores: number;
  grade_overrides: number;
  attendance: number;
}

/**
 * Clears one class day's activity and leaves the class itself standing: same
 * date, same section, same lecture, same planned polls — all back to unasked.
 * Not a delete, and refused while the class is live.
 */
export function resetClassSession(sessionId: string) {
  return callFn<{ reset: true; removed: ClassResetSummary }>(
    "course-session-management",
    { action: "reset_session", session_id: sessionId }
  );
}
