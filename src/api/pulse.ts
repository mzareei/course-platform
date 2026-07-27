// Live pulse questions. Every call goes through course-pulse, which re-checks
// role, enrollment and timing on the server.
import { callFn } from "./client";

export interface PulseOption {
  key: string;
  text: string;
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
  options: PulseOption[];
  /** Null until the instructor reveals — the server strips it. */
  correct_key: string | null;
}

export interface PulseResults {
  round_id: string;
  state: string;
  answered: number;
  correct: number;
  enrolled: number;
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
  my_answer: {
    option_key: string;
    answered_at: string;
    is_correct: boolean | null;
    points_awarded: number | null;
  } | null;
  results: PulseResults | null;
}

export function pushPulse(input: {
  class_session_id: string;
  question: { text: string; options: PulseOption[]; correct_key: string };
  time_limit_seconds?: number;
  points?: number;
}) {
  return callFn<{ round: PulseRound }>("course-pulse", { action: "push", ...input });
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
