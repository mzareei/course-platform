export function canJoinClassSession(state: string): boolean {
  return !["cancelled", "closed"].includes(state);
}

type StudentSessionRef = {
  session_id: string;
  state: string;
};

/**
 * One day can hold two classes the student belongs to: last week's lecture
 * being finished, and a brand-new one. Sessions arrive in planned-date order,
 * so the paused older class comes first — and a plain live-or-paused match
 * would put the whole room in the wrong class. A class actually running always
 * wins; paused is what is left when nothing is.
 */
function firstLiveSessionId(
  sessions: StudentSessionRef[],
  excludedId?: string | null
): string | null {
  const eligible = sessions.filter((session) => session.session_id !== excludedId);
  return (
    eligible.find((session) => session.state === "live")?.session_id
    ?? eligible.find((session) => session.state === "paused")?.session_id
    ?? null
  );
}

export function selectLiveSessionId(
  sessions: StudentSessionRef[],
  joinedSessionId: string | null
): string | null {
  return joinedSessionId || firstLiveSessionId(sessions);
}

export function fallbackLiveSessionId(
  sessions: StudentSessionRef[],
  staleSessionId: string
): string | null {
  return firstLiveSessionId(sessions, staleSessionId);
}
