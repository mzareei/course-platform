// The class record: attendance and engagement, and per-class grading.
//
// Every number here is computed by course-class-record. This module deliberately
// contains no arithmetic — a second implementation of the grading formula on the
// client is a second thing to keep correct, and the one the professor would be
// looking at when a student disputes a grade.
import { callFn } from "./client";

export type AttendanceStatus = "present" | "late" | "left_early" | "absent";

export interface ClassRecordSession {
  class_session_id: string;
  section_id: string;
  sequence_number: number;
  title: string;
  state: string;
  planned_date: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  late_after_minutes: number;
}

export interface AttendanceRow {
  profile_id: string;
  name: string;
  student_identifier: string | null;
  checked_in_at: string | null;
  check_in_source: "qr" | "instructor" | null;
  check_in_note: string | null;
  /** Every day this student was in the room for this class, ascending. More
   *  than one means the class was paused and finished on another day. */
  attendance_days: string[];
  status: AttendanceStatus;
  pulse_responses: number;
  /** Null when no pulse questions were pushed — not 0. */
  engagement_percent: number | null;
  last_activity_at: string | null;
}

export interface AttendanceTable {
  session: ClassRecordSession;
  pulse_rounds_pushed: number;
  rows: AttendanceRow[];
}

export interface OverrideHistoryEntry {
  grade: number | null;
  calculated_grade: number | null;
  reason: string;
  actor_name: string;
  created_at: string;
}

export interface GradingRow {
  profile_id: string;
  name: string;
  student_identifier: string | null;

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
  submission_at: string | null;
  penalty_applied: boolean;
  penalty_percent: number;

  /** What the formula produced. Never changed by an override. */
  calculated_grade: number | null;
  override_grade: number | null;
  override_reason: string | null;
  override_at: string | null;
  override_by: string | null;
  /** What is actually reported: the override when there is one. */
  final_grade: number | null;
  override_history: OverrideHistoryEntry[];

  quiz_status: string | null;
  quiz_submitted_at: string | null;
}

export interface GradingTable {
  session: ClassRecordSession;
  weights: {
    pulse_percent: number;
    quiz_percent: number;
    mastery_threshold_percent: number;
    missing_submission_penalty_percent: number;
  };
  totals: {
    graded_pulse_questions: number;
    pulse_rounds_pushed: number;
    quiz_questions: number;
    quiz_instance_id: string | null;
  };
  rows: GradingRow[];
}

export function classAttendance(classSessionId: string) {
  return callFn<AttendanceTable>("course-class-record", {
    action: "attendance",
    class_session_id: classSessionId
  });
}

export function classGrading(classSessionId: string) {
  return callFn<GradingTable>("course-class-record", {
    action: "grading",
    class_session_id: classSessionId
  });
}

/** Returns the refreshed attendance table, so the caller never re-fetches. */
export function markPresent(input: { class_session_id: string; profile_id: string; note: string }) {
  return callFn<AttendanceTable>("course-class-record", { action: "mark_present", ...input });
}

/** `grade: null` clears the override; the reason stays required either way. */
export function overrideClassGrade(input: {
  class_session_id: string;
  profile_id: string;
  grade: number | null;
  reason: string;
}) {
  return callFn<GradingTable>("course-class-record", { action: "override", ...input });
}

export function postClassGradesToGradebook(classSessionId: string) {
  return callFn<{ gradebook_item_id: string; posted: number; skipped: number }>(
    "course-class-record",
    { action: "post_to_gradebook", class_session_id: classSessionId }
  );
}
