import type { PulseResults, PulseRound } from "../../api/pulse";
import type { CheckpointQuestion } from "../deck/protocol";

export type CheckpointUiState =
  | { type: "idle"; nextCheckpoint?: number }
  | { type: "loading"; checkpoint: number }
  | { type: "ready"; question: CheckpointQuestion }
  | { type: "open"; round: PulseRound; results: PulseResults | null }
  | { type: "revealed"; round: PulseRound; results: PulseResults }
  | { type: "error"; checkpoint: number; message: string };

export type ActiveCheckpoint = {
  key: string;
  afterSlide: number;
};

export function checkpointQuestionMatches(
  checkpoint: ActiveCheckpoint,
  question: CheckpointQuestion
) {
  const questionKey = question.segment_key;
  const authoredKey =
    checkpoint.key === questionKey
    || checkpoint.key === `${questionKey}-${checkpoint.afterSlide}`;
  return (
    authoredKey
    && checkpoint.afterSlide === question.checkpoint_after_slide
  );
}

/**
 * Space is an intent from the deck, never an instruction. The parent cockpit
 * resolves it against its current server-backed UI state.
 */
export function spaceIntentForCheckpoint(
  state: CheckpointUiState
): "send" | "reveal" | null {
  if (state.type === "ready") return "send";
  if (state.type === "open") return "reveal";
  return null;
}

export function resolveCheckpointActionSequence(
  handledSequence: number,
  action: { key: string; sequence: number } | null
) {
  if (!action) return { sequence: 0, shouldHandle: false };
  return {
    sequence: Math.max(handledSequence, action.sequence),
    shouldHandle: action.sequence > handledSequence
  };
}

export function isCheckpointOperationCurrent(
  startedAtSequence: number,
  currentSequence: number
) {
  return startedAtSequence === currentSequence;
}
