// Class days and sections — the course setup that everything else hangs off.
//
// Both existed on the backend and neither had a caller: a professor could not
// create a class day or a section from the v2 app at all. That made "tie a
// lecture to a class day" meaningless and blocked onboarding a second
// professor, who would have had nowhere to put their group.
//
// Shapes read off listSessions / createSession in course-session-management and
// listSections / saveSection in course-section-management. See pitfalls #3.
import { callFn } from "./client";

export interface CourseSection {
  id: string;
  course_id: string;
  section_code: string;
  section_name: string;
  meeting_pattern: string | null;
  campus: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export const SECTION_STATUSES = ["planned", "active", "completed", "archived"];

export function listSections() {
  return callFn<{ sections: CourseSection[] }>("course-section-management", {});
}

/** Omit section_id to create; pass it to edit. Every field is rewritten, so
 *  send the whole section back when editing one. */
export function saveSection(input: {
  section_id?: string;
  section_code: string;
  section_name: string;
  meeting_pattern?: string | null;
  campus?: string | null;
  status: string;
}) {
  return callFn<{ section: CourseSection; sections: CourseSection[] }>(
    "course-section-management",
    { action: "save_section", ...input }
  );
}

export interface ClassSession {
  /** listSessions returns `session_id`, not `id` — the two are not the same
   *  field and the compiler cannot tell you. See pitfalls #3. */
  session_id: string;
  course_id: string;
  section_id: string;
  sequence_number: number;
  title: string;
  planned_date: string;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  state: string;
  join_code: string;
  content_item_id: string | null;
  content_slug: string | null;
  content_title: string | null;
  source_kind: string | null;
  source_ref: string | null;
  section_code?: string;
  section_name?: string;
}

export function listSessions() {
  return callFn<{ sessions: ClassSession[] }>("course-session-management", {});
}

/** The sequence number is assigned server-side — `class_sessions` has
 *  `unique (section_id, sequence_number)`, so asking a human for it is a race. */
export function createSession(input: {
  section_id: string;
  title: string;
  /** YYYY-MM-DD. */
  planned_date: string;
  content_item_id?: string;
}) {
  return callFn<{ session: ClassSession; sessions: ClassSession[] }>(
    "course-session-management",
    { action: "create_session", ...input }
  );
}

export function cancelSession(sessionId: string, reason?: string) {
  return callFn<{ session: ClassSession }>("course-session-management", {
    action: "update_session_state",
    session_id: sessionId,
    next_state: "cancelled",
    reason: reason || "Cancelled from the schedule."
  });
}
