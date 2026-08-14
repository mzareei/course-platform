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
  source_pdf_pages?: number[];
  content_item_id?: string | null;
};

export type QuestionBankReadiness = "legacy" | "pending" | "ready" | "invalid";

export function questionBankReadiness(
  bank: CheckpointBankReadinessInput
): QuestionBankReadiness {
  const profile = bank.generation_validation_profile;
  if (profile === "flexible") {
    if (bank.total <= 0) return "invalid";
    if (bank.source_pdf_mapping_status === "valid") return "ready";
    // An imported bank never had a source PDF — its grounding is the slide
    // hints it was authored with. Judging it by PDF page mappings flagged
    // every imported bank "Needs attention" forever. Only a bank that HAS
    // source pages with a broken mapping is genuinely wrong.
    return (bank.source_pdf_pages?.length ?? 0) === 0 ? "ready" : "invalid";
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

export function questionBankControlCapabilities(
  bank: CheckpointBankReadinessInput,
  instructorCanPrepare: boolean
) {
  const legacy = bank.generation_validation_profile === "legacy";
  const hasDeck = Boolean(bank.content_item_id);
  const readiness = questionBankReadiness(bank);
  return {
    prepare: instructorCanPrepare
      && legacy
      && hasDeck
      && bank.checkpoint_coverage.length === 0
      && readiness === "legacy",
    resume: instructorCanPrepare && legacy && hasDeck && readiness === "pending",
    refresh: instructorCanPrepare && legacy && hasDeck && readiness === "ready"
  };
}
