// Platform-owner admin. Every action is gated server-side on an active
// platform_owner membership — the UI hiding the tab is a courtesy, not the
// control.
//
// Shapes below were read off the actual `return json({...})` in
// supabase/functions/course-admin/index.ts, not inferred. See pitfalls #3.
import { callFn } from "./client";

export interface AdminCourse {
  id: string;
  code: string;
  title: string;
  term_label: string;
  status: string;
  created_at?: string;
}

export interface AdminProfessor {
  membership_id: string;
  course_id: string;
  role: string;
  membership_status: string;
  profile_id: string;
  email: string | null;
  full_name: string | null;
  profile_status: string | null;
}

export function listCourses() {
  return callFn<{ courses: AdminCourse[] }>("course-admin", { action: "list_courses" });
}

export function createCourse(input: {
  id: string;
  code: string;
  title: string;
  term_label: string;
}) {
  return callFn<{ course: AdminCourse }>("course-admin", { action: "create_course", ...input });
}

/** Omit course_id to list teaching staff across every course. */
export function listProfessors(courseId?: string) {
  return callFn<{ professors: AdminProfessor[] }>("course-admin", {
    action: "list_professors",
    ...(courseId ? { course_id: courseId } : {})
  });
}

export function inviteProfessor(input: {
  course_id: string;
  email: string;
  full_name?: string;
  role: "instructor" | "teaching_assistant";
}) {
  return callFn<{ membership: { id: string; course_id: string; role: string; status: string }; profile_id: string }>(
    "course-admin",
    { action: "invite_professor", ...input }
  );
}

export function deactivateMembership(membershipId: string) {
  return callFn<{ membership: { id: string; status: string } }>("course-admin", {
    action: "deactivate",
    membership_id: membershipId
  });
}
