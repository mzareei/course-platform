import { callFn } from "./client";
import type { ClassSession } from "./schedule";

export function startClassSession(sessionId: string) {
  return callFn<{ session: ClassSession }>("course-session-management", {
    action: "start_session",
    session_id: sessionId
  });
}

export function createClass(input: {
  section_id: string;
  title: string;
  planned_date: string;
  content_item_id?: string;
}) {
  return callFn<{ session: ClassSession; sessions: ClassSession[] }>(
    "course-session-management",
    { action: "create_session", ...input }
  );
}
