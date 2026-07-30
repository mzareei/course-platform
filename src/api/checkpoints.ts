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
  content_item_id: string;
  title: string;
  content_slug: string;
  content_title: string;
  content_type: string;
  updated_at: string;
  total: number;
  by_difficulty: { easy: number; medium: number; hard: number };
  checkpoint_metadata_status: "missing" | "valid" | "invalid";
  checkpoint_metadata_present: number;
  checkpoint_metadata_valid: number;
  checkpoint_coverage: CheckpointCoverage[];
};

export function listBanks() {
  return callFn<{ banks: CheckpointBankSummary[] }>("course-question-bank", {
    action: "list_banks"
  });
}

export type BackfillResult = {
  content_item_id: string;
  question_bank_id: string;
  storage_path: string;
  teaching_slide_count: number;
  checkpoint_count: number;
  mapped_question_count: number;
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
