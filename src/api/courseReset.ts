// Course reset: clear a rehearsal so the real semester starts from zero.
import { callFn } from "./client";

export interface ResetStudent {
  profile_id: string;
  name: string;
  student_identifier: string | null;
  email: string | null;
  enrolled_active: boolean;
  /** False for anyone who teaches the course. The database refuses those too. */
  removable: boolean;
  check_ins: number;
  pulse_answers: number;
  quiz_attempts: number;
  reflections: number;
}

export interface ResetPreview {
  course_id: string;
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

export function previewCourseReset() {
  return callFn<ResetPreview>("course-reset", { action: "preview" });
}

export function executeCourseReset(input: { confirm: string; remove_profile_ids: string[] }) {
  return callFn<ResetResult>("course-reset", { action: "execute", ...input });
}
