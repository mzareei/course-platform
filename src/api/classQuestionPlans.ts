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
  question_bank_id: string;
  final_quiz_question_count: number | null;
  notes: string | null;
  copied_from_plan_id: string | null;
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
  return payload.plan ? normalizePlan(payload.plan) : null;
}

function normalizeCheckpoint(checkpoint: PlanCheckpoint): PlanCheckpoint {
  return {
    ...checkpoint,
    notes: typeof checkpoint.notes === "string" ? checkpoint.notes : null,
    slide_hint: typeof checkpoint.slide_hint === "number" ? checkpoint.slide_hint : null,
    candidate_question_ids: Array.isArray(checkpoint.candidate_question_ids)
      ? checkpoint.candidate_question_ids.filter((entry): entry is string => typeof entry === "string")
      : []
  };
}

function normalizePlan(plan: ClassQuestionPlan): ClassQuestionPlan {
  if (typeof plan.question_bank_id !== "string" || !plan.question_bank_id.trim()) {
    throw new Error("class_question_plan_failed");
  }
  return {
    ...plan,
    question_bank_id: plan.question_bank_id,
    final_quiz_question_count: typeof plan.final_quiz_question_count === "number"
      ? plan.final_quiz_question_count
      : null,
    notes: typeof plan.notes === "string" ? plan.notes : null,
    copied_from_plan_id: typeof plan.copied_from_plan_id === "string"
      ? plan.copied_from_plan_id
      : null,
    checkpoints: Array.isArray(plan.checkpoints)
      ? plan.checkpoints.map(normalizeCheckpoint)
      : []
  };
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

const PLAN_ERROR_KEYS = new Set<StringKey>([
  "run.plan.class_question_plan_action_invalid",
  "run.plan.class_question_plan_auth_invalid",
  "run.plan.class_question_plan_auth_required",
  "run.plan.class_question_plan_bank_mismatch",
  "run.plan.class_question_plan_checkpoint_id_invalid",
  "run.plan.class_question_plan_checkpoint_not_found",
  "run.plan.class_question_plan_checkpoint_locked",
  "run.plan.class_question_plan_exists",
  "run.plan.class_question_plan_failed",
  "run.plan.class_question_plan_forbidden",
  "run.plan.class_question_plan_method_not_allowed",
  "run.plan.class_question_plan_not_found",
  "run.plan.class_question_plan_plan_id_invalid",
  "run.plan.class_question_plan_profile_not_found",
  "run.plan.class_question_plan_question_bank_id_invalid",
  "run.plan.class_question_plan_question_bank_not_active",
  "run.plan.class_question_plan_question_ids_duplicate",
  "run.plan.class_question_plan_question_ids_invalid",
  "run.plan.class_question_plan_question_id_invalid",
  "run.plan.class_question_plan_question_not_candidate",
  "run.plan.class_question_plan_question_not_in_bank",
  "run.plan.class_question_plan_question_unavailable",
  "run.plan.class_question_plan_session_id_invalid",
  "run.plan.class_question_plan_session_not_found",
  "run.plan.class_question_plan_session_state_invalid",
  "run.plan.class_question_plan_payload_invalid",
  "run.plan.class_question_plan_slide_hint_invalid",
  "run.plan.class_question_plan_source_plan_id_invalid",
  "run.plan.class_question_plan_source_plan_not_found",
  "run.plan.class_question_plan_topic_required"
]);

export function classQuestionPlanErrorKey(code?: string | null): StringKey | null {
  const next = `run.plan.${String(code || "").trim()}` as StringKey;
  return PLAN_ERROR_KEYS.has(next) ? next : null;
}

export function classQuestionPlanErrorMessage(cause: unknown): StringKey | null {
  if (cause instanceof ApiError) {
    const key = classQuestionPlanErrorKey(cause.code);
    if (key) return key;
  }
  return null;
}
