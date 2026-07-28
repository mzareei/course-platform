// End-of-class graded quiz. Reuses the authenticated activity engine
// (course-activity-attempt) for taking/grading; course-class-quiz only
// orchestrates starting/closing an instance for a specific class session.
import { callFn } from "./client";

export interface QuizOption {
  id: string;
  option_text: string;
  option_text_es: string | null;
  position: number;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  prompt_es: string | null;
  question_type: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  options: QuizOption[];
}

export interface QuizAttempt {
  id: string;
  activity_instance_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  attempt_number: number;
}

export interface StartAttemptResponse {
  attempt: QuizAttempt;
  questions: QuizQuestion[];
  activity_instance: { id: string; ends_at: string | null; time_limit_seconds: number | null; question_count: number | null };
}

export interface SubmitAttemptResponse {
  attempt: QuizAttempt;
  score: { raw: number; total: number; percent: number; speed_bonus: number; final: number };
}

export function startQuizAttempt(activityInstanceId: string) {
  return callFn<StartAttemptResponse>("course-activity-attempt", {
    action: "start_attempt",
    activity_instance_id: activityInstanceId
  });
}

export function submitQuizAttempt(input: {
  attempt_id: string;
  responses: Array<{ question_id: string; selected_option_id: string }>;
  integrity?: Record<string, unknown>;
}) {
  return callFn<SubmitAttemptResponse>("course-activity-attempt", { action: "submit_attempt", ...input });
}

// ---------------------------------------------------------------- instructor
export function startClassQuiz(input: { class_session_id: string; content_slug: string; question_count?: number; time_limit_seconds?: number }) {
  return callFn<{ instance_id: string; reused: boolean }>("course-class-quiz", { action: "start", ...input });
}

/** The running quiz (if any) plus the last finished one, kept separate so a
 *  closed quiz never hides the "start" control — a class can run more than one. */
export function currentClassQuiz(input: { class_session_id: string; content_slug: string }) {
  return callFn<{
    instance_id: string | null;
    state: string | null;
    last_closed_instance_id: string | null;
  }>("course-class-quiz", { action: "current", ...input });
}

export function closeClassQuiz(activityInstanceId: string) {
  return callFn<{ instance_id: string; state: string }>("course-class-quiz", { action: "close", activity_instance_id: activityInstanceId });
}

export interface QuizStatus {
  instance_id: string;
  state: string;
  ends_at: string | null;
  question_count: number | null;
  enrolled: number;
  started: number;
  submitted: number;
  average_score: number | null;
}

export function classQuizStatus(activityInstanceId: string) {
  return callFn<QuizStatus>("course-class-quiz", { action: "status", activity_instance_id: activityInstanceId });
}

export interface QuizAttemptSummary {
  profile_id: string;
  name: string;
  student_identifier: string | null;
  status: string;
  score_percent: number | null;
  score_final: number | null;
  submitted_at: string | null;
}

export function classQuizSummary(classSessionId: string) {
  return callFn<{ attempts: QuizAttemptSummary[] }>("course-class-quiz", { action: "summary", class_session_id: classSessionId });
}
