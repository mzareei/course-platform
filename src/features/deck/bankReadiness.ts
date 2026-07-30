type CheckpointCoverageInput = {
  candidate_count: number;
};

type CheckpointBankReadinessInput = {
  total: number;
  by_difficulty: { easy: number; medium: number; hard: number };
  checkpoint_metadata_status: "missing" | "valid" | "invalid";
  checkpoint_coverage: CheckpointCoverageInput[];
};

export type QuestionBankReadiness = "legacy" | "ready" | "invalid";

export function questionBankReadiness(
  bank: CheckpointBankReadinessInput
): QuestionBankReadiness {
  if (bank.checkpoint_metadata_status === "missing") {
    return "legacy";
  }

  const balanced = bank.total === 18
    && bank.by_difficulty.easy === 6
    && bank.by_difficulty.medium === 6
    && bank.by_difficulty.hard === 6;
  const validCoverage = bank.checkpoint_coverage.length >= 3
    && bank.checkpoint_coverage.length <= 5
    && bank.checkpoint_coverage.every((checkpoint) => checkpoint.candidate_count >= 2);

  return bank.checkpoint_metadata_status === "valid" && balanced && validCoverage
    ? "ready"
    : "invalid";
}

export function canPrepareCheckpoints(
  bank: CheckpointBankReadinessInput
): boolean {
  return questionBankReadiness(bank) === "legacy";
}
