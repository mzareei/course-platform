// The end-of-class reflection: one paragraph, a professor-set word range
// (50-100 by default). Enforced server-side; the client mirrors the bounds so
// the counter is accurate before submitting.
import { callFn } from "./client";

export function submitReflection(input: { class_session_id: string; one_thing: string }) {
  // section_id is optional — the server defaults to the student's own section.
  return callFn<{ ticket: { id: string; word_count: number } }>("course-exit-ticket", { action: "submit_ticket", ...input });
}

export interface ClassReflection {
  profile_id: string;
  name: string;
  student_identifier: string | null;
  one_thing: string;
  created_at: string;
}

export function classReflections(classSessionId: string) {
  return callFn<{ reflections: ClassReflection[] }>("course-class-quiz", { action: "reflections", class_session_id: classSessionId });
}
