export type CheckpointQuestion = {
  question_id: string;
  generation_key: string;
  difficulty: "easy" | "medium" | "hard";
  segment_key: string;
  source_slide_numbers: number[];
  source_slide_start: number;
  source_slide_end: number;
  checkpoint_after_slide: number;
  prompt: string;
  prompt_es: string | null;
  explanation: string | null;
  explanation_es: string | null;
  options: Array<{
    key: string;
    text: string;
    text_es: string | null;
    is_correct: boolean;
  }>;
};

type CheckpointQuestionMetadata = Pick<
  CheckpointQuestion,
  | "segment_key"
  | "source_slide_numbers"
  | "source_slide_start"
  | "source_slide_end"
  | "checkpoint_after_slide"
>;

export function validateCheckpointQuestion(
  value: Partial<CheckpointQuestionMetadata>
): string[] {
  const problems: string[] = [];
  const sourceSlides = Array.isArray(value.source_slide_numbers)
    ? value.source_slide_numbers
    : [];

  if (!sourceSlides.length) {
    problems.push("At least one source slide is required.");
  }
  if (
    Number.isInteger(value.source_slide_end)
    && Number.isInteger(value.checkpoint_after_slide)
    && value.source_slide_end! > value.checkpoint_after_slide!
  ) {
    problems.push("The source slide range ends after its checkpoint.");
  }
  if (!String(value.segment_key || "").trim()) {
    problems.push("A segment key is required.");
  }

  const start = value.source_slide_start;
  const end = value.source_slide_end;
  if (!Number.isInteger(start) || start! < 1) {
    problems.push("The source slide start must be a positive integer.");
  }
  if (!Number.isInteger(end) || end! < 1) {
    problems.push("The source slide end must be a positive integer.");
  } else if (Number.isInteger(start) && end! < start!) {
    problems.push("The source slide end must not precede its start.");
  }

  if (
    sourceSlides.some((slide) =>
      !Number.isInteger(slide)
      || slide < 1
      || (Number.isInteger(value.checkpoint_after_slide)
        && slide > value.checkpoint_after_slide!)
    )
  ) {
    problems.push("Every cited source slide must be at or before its checkpoint.");
  }

  if (sourceSlides.length && Number.isInteger(start) && Math.min(...sourceSlides) !== start) {
    problems.push("The source slide start must match the first cited slide.");
  }
  if (sourceSlides.length && Number.isInteger(end) && Math.max(...sourceSlides) !== end) {
    problems.push("The source slide end must match the last cited slide.");
  }

  return problems;
}
