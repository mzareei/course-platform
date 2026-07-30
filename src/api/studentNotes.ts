import { callFn } from "./client";

export interface ClassStudentNote {
  id: string;
  class_session_id: string;
  profile_id: string;
  student_name: string;
  session_title: string;
  planned_date: string;
  author_name: string | null;
  note_text: string;
  needs_follow_up: boolean;
  resolved_at: string | null;
  created_at: string;
}

export function listSessionNotes(classSessionId: string) {
  return callFn<{ notes: ClassStudentNote[] }>("course-student-notes", {
    action: "list_session",
    class_session_id: classSessionId
  });
}

export function listStudentNotes(profileId: string) {
  return callFn<{ notes: ClassStudentNote[] }>("course-student-notes", {
    action: "list_student",
    profile_id: profileId
  });
}

export function createStudentNote(input: {
  class_session_id: string;
  profile_id: string;
  note_text: string;
  needs_follow_up: boolean;
}) {
  return callFn<{ notes: ClassStudentNote[] }>("course-student-notes", {
    action: "create",
    ...input
  });
}

export function resolveStudentNote(noteId: string) {
  return callFn<{ notes: ClassStudentNote[] }>("course-student-notes", {
    action: "resolve",
    note_id: noteId
  });
}
