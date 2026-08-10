import { callFn } from "./client";
import type { CheckpointQuestion } from "../features/deck/protocol";

export type { CheckpointQuestion } from "../features/deck/protocol";

export type CheckpointCoverage = {
  segment_key: string;
  checkpoint_after_slide: number;
  candidate_count: number;
  difficulties: string[];
};

export type CheckpointBankSummary = {
  bank_id: string;
  content_item_id: string | null;
  title: string;
  content_slug: string | null;
  content_title: string | null;
  content_type: string | null;
  generation_validation_profile: "legacy" | "flexible";
  checkpoint_preparation_state: "none" | "pending_upload" | "ready";
  checkpoint_preparation_updated_at: string | null;
  updated_at: string;
  total: number;
  by_difficulty: { easy: number; medium: number; hard: number };
  checkpoint_metadata_status: "missing" | "valid" | "invalid";
  checkpoint_metadata_present: number;
  checkpoint_metadata_valid: number;
  checkpoint_coverage: CheckpointCoverage[];
  source_pdf_mapping_status: "missing" | "valid";
  source_pdf_pages: number[];
};

export type BankQuestionOption = {
  id: string;
  option_text: string;
  option_text_es: string | null;
  is_correct: boolean;
  position: number;
};

export type BankQuestion = {
  id: string;
  generation_key: string;
  prompt: string;
  prompt_es: string | null;
  explanation: string | null;
  explanation_es: string | null;
  difficulty: "easy" | "medium" | "hard";
  segment_key: string | null;
  source_pdf_pages: number[];
  source_slide_numbers: number[];
  source_slide_start: number | null;
  source_slide_end: number | null;
  checkpoint_after_slide: number | null;
  suggested_slide_hint: number | null;
  suggested_topic: string | null;
  status: string;
  source: string | null;
  updated_at: string;
  question_options: BankQuestionOption[];
};

export function listBanks() {
  return callFn<{ banks: CheckpointBankSummary[] }>("course-question-bank", {
    action: "list_banks"
  });
}

export function listQuestions(questionBankId: string) {
  return callFn<{ bank_id: string; bank_title: string; questions: BankQuestion[] }>(
    "course-question-bank",
    { action: "list_questions", question_bank_id: questionBankId }
  );
}

export function updateQuestion(input: {
  question_bank_id: string;
  question_id: string;
  prompt: string;
  prompt_es?: string | null;
  explanation?: string | null;
  explanation_es?: string | null;
  difficulty: "easy" | "medium" | "hard";
  options: Array<{
    text: string;
    text_es?: string | null;
    is_correct: boolean;
  }>;
}) {
  return callFn<{ question_id: string; bank_id: string; updated: boolean }>(
    "course-question-bank",
    { action: "update_question", ...input }
  );
}

export function deleteQuestion(input: { question_bank_id: string; question_id: string }) {
  return callFn<{ question_id: string; bank_id: string; deleted: boolean }>(
    "course-question-bank",
    { action: "delete_question", ...input }
  );
}

export type BackfillResult = {
  content_item_id: string;
  question_bank_id: string;
  storage_path: string;
  teaching_slide_count: number;
  checkpoint_count: number;
  mapped_question_count: number;
  preparation_state: "ready";
  deck_upgraded: boolean;
};

export function prepareLegacyCheckpoints(
  contentItemId: string
): Promise<BackfillResult> {
  return callFn<BackfillResult>("course-checkpoint-backfill", {
    action: "prepare",
    content_item_id: contentItemId
  });
}

/** Draw only from the exact teaching checkpoint when one is supplied. */
export function drawQuestion(input: {
  content_slug: string;
  difficulty?: "easy" | "medium" | "hard";
  checkpoint_after_slide?: number;
  exclude_keys?: string[];
}) {
  return callFn<{ question: CheckpointQuestion; remaining: number }>(
    "course-question-bank",
    { action: "draw_question", ...input }
  );
}
