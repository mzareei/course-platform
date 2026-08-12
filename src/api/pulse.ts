// Live pulse questions. Every call goes through course-pulse, which re-checks
// role, enrollment and timing on the server.
import { callFn } from "./client";
import {
  drawQuestion,
  listBanks,
  type CheckpointBankSummary,
  type CheckpointQuestion
} from "./checkpoints";

export interface PulseOption {
  key: string;
  text: string;
  text_es?: string | null;
}

export interface PulseRound {
  round_id: string;
  state: "open" | "revealed" | "closed";
  points: number;
  answer_points?: number;
  time_limit_seconds: number;
  opened_at: string;
  ends_at: string;
  text: string;
  text_es?: string | null;
  options: PulseOption[];
  /** Null until the instructor reveals — the server strips it. */
  correct_key: string | null;
  segment_key?: string | null;
  checkpoint_after_slide?: number | null;
}

export interface PulseResults {
  round_id: string;
  state: string;
  answered: number;
  correct: number;
  /** Everyone on the section roster, present or not. */
  enrolled: number;
  /**
   * Students who actually scanned into this class. Only they can answer, so
   * this — not `enrolled` — is what "everyone has answered" has to measure.
   */
  present: number;
  distribution: Array<{ key: string; text: string; count: number }>;
  correct_key: string | null;
  respondents: Array<{
    profile_id: string;
    name: string;
    student_identifier: string | null;
    option_key: string;
    is_correct: boolean;
    points_awarded: number;
    latency_ms: number | null;
  }>;
}

export interface StudentPulseView {
  session_state: string;
  round: PulseRound | null;
  /**
   * Whether this student scanned the class QR code (or was marked present by
   * the professor). The live screen is gated on this rather than on stored
   * state, so a second device or a cleared browser still works. Always true for
   * teachers — they run the class, they do not attend it.
   */
  checked_in: boolean;
  checked_in_at: string | null;
  my_answer: {
    option_key: string;
    answered_at: string;
    is_correct: boolean | null;
    points_awarded: number | null;
  } | null;
  results: PulseResults | null;
  // Same poll drives the whole live screen: pulse takes priority, then quiz,
  // then reflection — the order a class actually runs in.
  quiz: {
    instance_id: string | null;
    state: string | null;
    ends_at?: string | null;
    question_count?: number | null;
  };
  reflection: {
    submitted: boolean;
    min_words: number;
    max_words: number;
  };
}

export function pushPulse(input: {
  class_session_id: string;
  question: { text: string; options: PulseOption[]; correct_key: string };
  time_limit_seconds?: number;
  points?: number;
}) {
  return callFn<{ round: PulseRound }>("course-pulse", { action: "push", ...input });
}

export function pushBankQuestion(input: {
  class_session_id: string;
  question_id: string;
  checkpoint_after_slide: number;
  time_limit_seconds?: number;
  points?: number;
}) {
  return callFn<{ round: PulseRound }>("course-pulse", {
    action: "push",
    ...input
  });
}

export function pushPlanQuestion(input: {
  class_session_id: string;
  question_id: string;
  plan_checkpoint_id: string;
  time_limit_seconds?: number;
  points?: number;
}) {
  return callFn<{ round: PulseRound }>("course-pulse", {
    action: "push",
    class_session_id: input.class_session_id,
    question_id: input.question_id,
    plan_checkpoint_id: input.plan_checkpoint_id,
    time_limit_seconds: input.time_limit_seconds,
    points: input.points
  });
}

// ---------------------------------------------------------------- question bank
export type BankSummary = CheckpointBankSummary;
export type DrawnQuestion = CheckpointQuestion;
export { drawQuestion, listBanks };

export function drawCheckpointQuestion(input: {
  content_slug: string;
  checkpoint_after_slide: number;
  exclude_keys?: string[];
}) {
  return drawQuestion(input);
}

export function revealPulse(round_id: string) {
  return callFn<{ round: PulseRound } & PulseResults>("course-pulse", { action: "reveal", round_id });
}

export function closePulse(round_id: string) {
  return callFn<{ round: PulseRound } & PulseResults>("course-pulse", { action: "close", round_id });
}

export function pulseResults(round_id: string) {
  return callFn<PulseResults>("course-pulse", { action: "results", round_id });
}

/** One row per question asked during a finished class, in the order asked. */
export interface PulseRoundReview {
  round_id: string;
  state: string;
  opened_at: string;
  points: number;
  text: string;
  correct_key: string | null;
  answered: number;
  correct: number;
  enrolled: number;
  distribution: Array<{ key: string; text: string; count: number }>;
}

export function classPulseRounds(class_session_id: string) {
  return callFn<{ rounds: PulseRoundReview[] }>("course-pulse", { action: "rounds", class_session_id });
}

export function currentPulse(class_session_id: string) {
  return callFn<StudentPulseView>("course-pulse", { action: "current", class_session_id });
}

export function answerPulse(input: { round_id: string; option_key: string; latency_ms?: number }) {
  return callFn<{ recorded: boolean }>("course-pulse", { action: "answer", ...input });
}

/**
 * Per-student option order. Presentation only — the server grades by key, so
 * shuffling here is safe and stops neighbours from calling out "pick number 2".
 * Seeded by round + student so a re-render keeps the same order.
 */
export function shuffleOptions(options: PulseOption[], seed: string): PulseOption[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const random = () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return Math.abs(hash) / 2 ** 31;
  };
  const out = [...options];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
