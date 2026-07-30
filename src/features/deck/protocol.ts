export const DECK_PROTOCOL_VERSION = 1;

export type DeckToParentMessage =
  | { version: 1; type: "deck.ready"; slide: number }
  | {
    version: 1;
    type: "deck.slide_changed";
    slide: number;
    teaching_slide: number | null;
  }
  | {
    version: 1;
    type: "deck.checkpoint_entered";
    checkpoint_key: string;
    after_slide: number;
  }
  | {
    version: 1;
    type: "deck.checkpoint_skipped";
    checkpoint_key: string;
  }
  | {
    version: 1;
    type: "deck.checkpoint_action";
    checkpoint_key: string;
  };

export type ParentToDeckMessage =
  | { version: 1; type: "checkpoint.question_ready"; checkpoint_key: string }
  | { version: 1; type: "checkpoint.question_sent"; checkpoint_key: string }
  | { version: 1; type: "checkpoint.answer_revealed"; checkpoint_key: string }
  | { version: 1; type: "checkpoint.resume"; checkpoint_key: string };

type MessageRecord = Record<string, unknown>;

function safeMessageRecord(value: unknown): MessageRecord | null {
  if (!value || typeof value !== "object") return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Object.getOwnPropertySymbols(value).length > 0) return null;

  const keys = Object.keys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const safe = keys.every((key) => {
    const descriptor = descriptors[key];
    return (
      descriptor !== undefined
      && Object.prototype.hasOwnProperty.call(descriptor, "value")
      && typeof descriptor.value !== "function"
    );
  });
  return safe ? value as MessageRecord : null;
}

function hasExactKeys(value: MessageRecord, expectedKeys: string[]): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isCheckpointKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isDeckMessage(
  value: unknown,
  origin: string
): value is DeckToParentMessage {
  if (origin !== location.origin) return false;
  const candidate = safeMessageRecord(value);
  if (!candidate) return false;
  if (candidate.version !== DECK_PROTOCOL_VERSION || typeof candidate.type !== "string") {
    return false;
  }

  switch (candidate.type) {
    case "deck.ready":
      return (
        hasExactKeys(candidate, ["version", "type", "slide"])
        && isPositiveInteger(candidate.slide)
      );
    case "deck.slide_changed":
      return (
        hasExactKeys(candidate, ["version", "type", "slide", "teaching_slide"])
        && isPositiveInteger(candidate.slide)
        && (
          candidate.teaching_slide === null
          || isPositiveInteger(candidate.teaching_slide)
        )
      );
    case "deck.checkpoint_entered":
      return (
        hasExactKeys(candidate, [
          "version",
          "type",
          "checkpoint_key",
          "after_slide"
        ])
        && isCheckpointKey(candidate.checkpoint_key)
        && isPositiveInteger(candidate.after_slide)
      );
    case "deck.checkpoint_skipped":
    case "deck.checkpoint_action":
      return (
        hasExactKeys(candidate, ["version", "type", "checkpoint_key"])
        && isCheckpointKey(candidate.checkpoint_key)
      );
    default:
      return false;
  }
}

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
