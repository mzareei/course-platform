export function canJoinClassSession(state: string): boolean {
  return !["cancelled", "closed"].includes(state);
}

type StudentSessionRef = {
  session_id: string;
  state: string;
};

function firstLiveSessionId(
  sessions: StudentSessionRef[],
  excludedId?: string | null
): string | null {
  return sessions.find(
    (session) =>
      session.session_id !== excludedId &&
      ["live", "paused"].includes(session.state)
  )?.session_id ?? null;
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
