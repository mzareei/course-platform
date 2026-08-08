import { callFn, ApiError } from "./client";
import type { StringKey } from "../i18n/strings";

export type PlanCheckpointState = "planned" | "sent" | "skipped";

export type PlanCheckpoint = {
  id: string;
  position: number;
  topic: string;
  slide_hint: number | null;
  notes: string | null;
  state: PlanCheckpointState;
  candidate_question_ids: string[];
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ClassQuestionPlan = {
  id: string;
  class_session_id: string;
  question_bank_id: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  checkpoints: PlanCheckpoint[];
};

export type SaveCheckpointDraftInput = {
  topic: string;
  slide_hint?: number | null;
  notes?: string | null;
};

async function unwrapPlan(
  request: Promise<{ plan: ClassQuestionPlan | null }>
): Promise<ClassQuestionPlan | null> {
  const payload = await request;
  return payload.plan;
}

export function getClassQuestionPlan(classSessionId: string) {
  return unwrapPlan(
    callFn<{ plan: ClassQuestionPlan | null }>("course-class-question-plan", {
      action: "get",
      class_session_id: classSessionId
    })
  );
}

export function createClassQuestionPlan(input: {
  class_session_id: string;
  question_bank_id: string;
}) {
  return unwrapPlan(
    callFn<{ plan: ClassQuestionPlan }>("course-class-question-plan", {
      action: "create",
      ...input
    })
  ) as Promise<ClassQuestionPlan>;
}

export function addClassQuestionPlanCheckpoint(input: {
  plan_id: string;
  topic: string;
  slide_hint?: number | null;
  notes?: string | null;
}) {
  return unwrapPlan(
    callFn<{ plan: ClassQuestionPlan }>("course-class-question-plan", {
      action: "add_checkpoint",
      ...input
    })
  ) as Promise<ClassQuestionPlan>;
}

export function updateClassQuestionPlanCheckpoint(input: {
  checkpoint_id: string;
  topic: string;
  slide_hint?: number | null;
  notes?: string | null;
}) {
  return unwrapPlan(
    callFn<{ plan: ClassQuestionPlan }>("course-class-question-plan", {
      action: "update_checkpoint",
      ...input
    })
  ) as Promise<ClassQuestionPlan>;
}

export function removeClassQuestionPlanCheckpoint(checkpointId: string) {
  return unwrapPlan(
    callFn<{ plan: ClassQuestionPlan }>("course-class-question-plan", {
      action: "remove_checkpoint",
      checkpoint_id: checkpointId
    })
  ) as Promise<ClassQuestionPlan>;
}

export function saveCheckpointCandidates(input: {
  checkpoint_id: string;
  question_ids: string[];
}) {
  return unwrapPlan(
    callFn<{ plan: ClassQuestionPlan }>("course-class-question-plan", {
      action: "set_candidates",
      ...input
    })
  ) as Promise<ClassQuestionPlan>;
}

export function markClassQuestionPlanCheckpointSkipped(checkpointId: string) {
  return unwrapPlan(
    callFn<{ plan: ClassQuestionPlan }>("course-class-question-plan", {
      action: "mark_skipped",
      checkpoint_id: checkpointId
    })
  ) as Promise<ClassQuestionPlan>;
}

const PLAN_ERROR_KEYS = new Set([
  "class_question_plan_exists",
  "class_question_plan_failed",
  "class_question_plan_question_bank_not_active",
  "class_question_plan_question_ids_duplicate",
  "class_question_plan_question_ids_invalid",
  "class_question_plan_question_not_candidate",
  "class_question_plan_question_not_in_bank",
  "class_question_plan_question_unavailable",
  "class_question_plan_session_state_invalid",
  "class_question_plan_checkpoint_locked",
  "class_question_plan_payload_invalid",
  "class_question_plan_slide_hint_invalid",
  "class_question_plan_topic_required"
]);

export function classQuestionPlanErrorKey(code?: string | null): StringKey | null {
  const next = String(code || "").trim();
  return PLAN_ERROR_KEYS.has(next) ? (`run.plan.${next}` as StringKey) : null;
}

export function classQuestionPlanErrorMessage(cause: unknown): StringKey | null {
  if (cause instanceof ApiError) {
    const key = classQuestionPlanErrorKey(cause.code);
    if (key) return key;
  }
  return null;
}
