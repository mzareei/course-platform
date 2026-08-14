// Shapes returned by the existing Gen-2 edge functions. Typed loosely on purpose:
// the backend is the source of truth and predates this app.

export type Role =
  | "platform_owner"
  | "instructor"
  | "teaching_assistant"
  | "student"
  | "observer";

export interface Profile {
  id: string;
  institutional_email: string;
  full_name: string;
  preferred_name?: string | null;
  student_identifier?: string | null;
  status: string;
}

export interface Membership {
  role: Role;
  status: string;
  course_id: string;
}

export interface SectionInfo {
  id: string;
  section_code: string;
  section_name: string;
  role?: Role;
  status?: string;
}

// Flat shape returned by course-auth-context loadVisibleReleases.
// `state` is already the effective state (a scheduled release past opens_at
// reports as released); the raw DB state is `release_state`.
export interface ReleaseItem {
  release_id: string;
  state: string;
  release_state: string;
  opens_at?: string | null;
  closes_at?: string | null;
  content_type: string;
  activity_instance_id?: string | null;
  slug: string;
  title: string;
  summary: string;
  source_kind: string;
  source_ref: string;
  default_points?: number;
  class_session_id?: string | null;
  class_session_title?: string;
  planned_date?: string;
  session_state?: string;
}

// Flat shape returned by course-auth-context loadTeacherSessions.
export interface TeacherSession {
  session_id: string;
  course_id: string;
  section_id: string;
  section_code: string;
  section_name: string;
  sequence_number: number;
  title?: string;
  planned_date?: string | null;
  state: string;
  join_code: string;
  content_item_id: string | null;
  content_slug: string | null;
  content_title: string | null;
  source_kind: string | null;
  source_ref: string | null;
}

export interface StudentSession {
  session_id: string;
  section_id: string;
  section_code: string;
  title: string;
  planned_date: string;
  state: string;
  join_code: string;
  content_item_id: string | null;
  content_slug: string | null;
  content_title: string | null;
  /** The server's own attendance fact: this student scanned into this class. */
  checked_in: boolean;
}

export interface CourseContext {
  user: { id: string; email: string };
  profile: Profile | null;
  memberships: Membership[];
  sections: SectionInfo[];
  releases: ReleaseItem[];
  student_sessions: StudentSession[];
  teacher_sessions?: TeacherSession[];
  roster_status: "missing_profile" | "active" | "not_enrolled";
}

/**
 * One class, one grade — with the arithmetic that produced it, so a student can
 * see the same breakdown the professor sees on the class record.
 *
 * Mirrors StudentClassGrade in supabase/functions/_shared/class-grade.ts.
 */
export interface ClassGrade {
  class_session_id: string;
  sequence_number: number;
  title: string;
  planned_date: string | null;
  pulse_correct: number;
  pulse_total: number;
  pulse_accuracy_percent: number | null;
  pulse_weight_percent: number;
  quiz_correct: number;
  quiz_total: number;
  quiz_accuracy_percent: number | null;
  quiz_weight_percent: number;
  raw_score_percent: number | null;
  mastery_threshold_percent: number;
  scaled_grade: number | null;
  capped: boolean;
  submission_present: boolean;
  /** False when the class never reached its end-of-class phase — no penalty. */
  submission_required: boolean;
  penalty_applied: boolean;
  penalty_percent: number;
  calculated_grade: number | null;
  /** What is actually reported: the posted grade, instructor change included. */
  grade: number | null;
  adjusted: boolean;
  adjustment_reason: string | null;
}

export interface GradingRule {
  pulse_percent: number;
  quiz_percent: number;
  mastery_threshold_percent: number;
  missing_submission_penalty_percent: number;
}

export interface CourseSummary {
  /** Plain average of the class grades so far — never weighted. */
  course_percent: number | null;
  graded_class_count: number;
  class_count: number;
}

export interface StudentProgress {
  profile: Profile;
  sections: SectionInfo[];
  scores: Array<{
    id: string;
    item_title?: string;
    category_name?: string;
    score_final?: number | null;
    max_score?: number;
    status: string;
    updated_at?: string;
  }>;
  attempts: Array<{
    id: string;
    activity_title?: string;
    status: string;
    score_percent?: number | null;
    score_final?: number | null;
    submitted_at?: string | null;
    attempt_number?: number;
  }>;
  class_grades?: ClassGrade[];
  course_summary?: CourseSummary;
  grading_rule?: GradingRule;
  recommendations?: Array<{ title?: string; message?: string; reason?: string }>;
  summary?: Record<string, unknown>;
}

export interface GradebookSummary {
  categories: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  items: Array<{
    id: string;
    title: string;
    category_id: string;
    /** Links a class-grade item to its class; null on legacy items. */
    class_session_id?: string | null;
    max_score: number;
    status: string;
    due_at?: string | null;
  }>;
  sections: SectionInfo[];
  scores: Array<{
    score_id: string;
    gradebook_item_id: string;
    profile_id: string;
    student_name?: string;
    institutional_email?: string;
    section_id?: string;
    score_final?: number | null;
    status: string;
    submitted_at?: string | null;
  }>;
  actions: string[];
}

export interface RosterOverview {
  roster: Array<{
    profile_id: string;
    full_name: string;
    institutional_email: string;
    student_identifier?: string | null;
    claimed?: boolean;
    profile_status?: string;
    course_role?: Role;
    membership_status?: string;
    sections?: Array<{ section_id: string; section_code: string; section_name?: string; role: Role; status: string }>;
  }>;
  external_access: Array<{
    id: string;
    email: string;
    status: string;
    reason?: string;
    created_at?: string;
  }>;
  actions: string[];
  roster_roles: Role[];
  allowed_domains: string[];
}
