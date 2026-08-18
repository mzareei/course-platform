// Course reset: clear a rehearsal so the real semester starts from zero.
//
// Every call names its scope. `sectionId` clears one group; `null` means every
// group in the course and is sent as an explicit `all_groups` flag — the server
// refuses a call that names neither, so a dropped field can never widen the
// blast radius from one group to the whole course.
import { callFn } from "./client";

export interface ResetStudent {
  profile_id: string;
  name: string;
  student_identifier: string | null;
  email: string | null;
  enrolled_active: boolean;
  /** False for anyone who teaches the course. The database refuses those too. */
  removable: boolean;
  /** True when removing them here only takes them out of this group. */
  in_other_groups: boolean;
  check_ins: number;
  pulse_answers: number;
  quiz_attempts: number;
  reflections: number;
}

export interface ResetPreview {
  course_id: string;
  /** "group" clears one group; "course" clears every group. */
  scope: "group" | "course";
  section_id: string | null;
  group_name: string;
  group_count: number;
  counts: {
    pulse_rounds: number;
    pulse_answers: number;
    class_attendance: number;
    student_attempts: number;
    student_responses: number;
    activity_instances: number;
    exit_tickets: number;
    portfolio_entries: number;
    class_grade_overrides: number;
    gradebook_items: number;
    gradebook_scores: number;
    participation_events: number;
    class_student_notes: number;
    class_presentation_state: number;
    class_sessions_rewound: number;
  };
  legacy_counts: {
    quiz_sessions: number;
    quiz_attempts: number;
    course_exit_tickets: number;
    course_portfolio_submissions: number;
  };
  kept: { class_sessions: number; sections: number };
  students: ResetStudent[];
}

export interface ResetResult {
  counts: Record<string, number>;
  removed: number;
  refused: Array<{ profile_id: string; reason: string }>;
}

/** null = every group, and it travels as its own flag rather than an absence. */
function scopeBody(sectionId: string | null) {
  return sectionId ? { section_id: sectionId } : { all_groups: true };
}

export function previewCourseReset(sectionId: string | null) {
  return callFn<ResetPreview>("course-reset", { action: "preview", ...scopeBody(sectionId) });
}

export function executeCourseReset(input: {
  sectionId: string | null;
  confirm: string;
  remove_profile_ids: string[];
}) {
  const { sectionId, ...rest } = input;
  return callFn<ResetResult>("course-reset", {
    action: "execute",
    ...scopeBody(sectionId),
    ...rest
  });
}
