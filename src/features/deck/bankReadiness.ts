type CheckpointCoverageInput = {
  candidate_count: number;
};

type CheckpointBankReadinessInput = {
  total: number;
  by_difficulty: { easy: number; medium: number; hard: number };
  generation_validation_profile: "legacy" | "flexible";
  checkpoint_preparation_state: "none" | "pending_upload" | "ready";
  checkpoint_metadata_status: "missing" | "valid" | "invalid";
  checkpoint_coverage: CheckpointCoverageInput[];
  source_pdf_mapping_status: "missing" | "valid";
};

export type QuestionBankReadiness = "legacy" | "pending" | "ready" | "invalid";

export function questionBankReadiness(
  bank: CheckpointBankReadinessInput
): QuestionBankReadiness {
  const profile = bank.generation_validation_profile;
  if (profile === "flexible") {
    return bank.total > 0 && bank.source_pdf_mapping_status === "valid"
      ? "ready"
      : "invalid";
  }
  const balanced = bank.total === 18
    && bank.by_difficulty.easy === 6
    && bank.by_difficulty.medium === 6
    && bank.by_difficulty.hard === 6;
  const validCoverage = bank.checkpoint_coverage.length >= 3
    && bank.checkpoint_coverage.length <= 5
    && bank.checkpoint_coverage.every((checkpoint) => checkpoint.candidate_count >= 2);
  const valid = bank.checkpoint_metadata_status === "valid"
    && balanced
    && validCoverage;

  if (bank.checkpoint_preparation_state === "pending_upload") {
    return valid ? "pending" : "invalid";
  }
  if (bank.checkpoint_preparation_state === "ready") {
    return valid ? "ready" : "invalid";
  }
  if (bank.checkpoint_metadata_status === "missing") {
    return "legacy";
  }

  return valid ? "ready" : "invalid";
}

export function canPrepareCheckpoints(
  bank: CheckpointBankReadinessInput
): boolean {
  return questionBankReadiness(bank) === "legacy";
}

export function canResumeCheckpointPreparation(
  bank: CheckpointBankReadinessInput
): boolean {
  return questionBankReadiness(bank) === "pending";
}
