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

/** Stable identity for "this checkpoint, in this class". */
export function checkpointIdentity(checkpoint: ActiveCheckpoint) {
  return `${checkpoint.key}@${checkpoint.afterSlide}`;
}

/**
 * Auto-send exists for the professor who lectures from the deck itself: landing
 * on an authored checkpoint slide should put the question on student phones
 * without leaving fullscreen for the cockpit.
 *
 * It fires only for a draw the deck itself asked for, and only while the deck
 * is still standing on that checkpoint. A manual draw, a "draw again", a
 * superseded draw, or a professor who has already walked past the slide must
 * never push a question at the class by surprise.
 */
export function shouldAutoSendCheckpointQuestion(input: {
  enabled: boolean;
  isLive: boolean;
  /** False for manual checkpoint selection and for "draw again". */
  drawnFromDeckArrival: boolean;
  /** False once a newer draw has replaced this one. */
  drawIsCurrent: boolean;
  /** Where the deck is standing right now, not where it was when we drew. */
  deckCheckpoint: ActiveCheckpoint | null;
  checkpoint: ActiveCheckpoint;
  /** At most one automatic push per checkpoint per class. */
  alreadyAutoSent: boolean;
}): boolean {
  if (!input.enabled || !input.isLive) return false;
  if (!input.drawnFromDeckArrival || !input.drawIsCurrent) return false;
  if (input.alreadyAutoSent) return false;
  const deck = input.deckCheckpoint;
  return Boolean(
    deck
    && deck.key === input.checkpoint.key
    && deck.afterSlide === input.checkpoint.afterSlide
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
