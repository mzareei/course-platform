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
}

export interface CourseContext {
  user: { id: string; email: string };
  profile: Profile | null;
  memberships: Membership[];
  sections: SectionInfo[];
  releases: ReleaseItem[];
  teacher_sessions?: TeacherSession[];
  roster_status: "missing_profile" | "active" | "not_enrolled";
}

export interface WeightedSummary {
  weighted_course_percent?: number;
  configured_weight_percent?: number;
  category_summaries?: Array<{
    category_id: string;
    category_name: string;
    category_weight_percent: number;
    category_average_percent?: number | null;
    score_count?: number;
    kept_score_count?: number;
    dropped_score_count?: number;
  }>;
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
  weighted_summary?: WeightedSummary;
  recommendations?: Array<{ title?: string; message?: string; reason?: string }>;
  summary?: Record<string, unknown>;
}

export interface GradebookSummary {
  categories: Array<{
    id: string;
    name: string;
    weight_percent: number;
    drop_lowest_count: number;
    status: string;
  }>;
  items: Array<{
    id: string;
    title: string;
    category_id: string;
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
  weighted_summary?: unknown;
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
