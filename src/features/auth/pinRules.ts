// The rules a student's PIN has to satisfy, and what each server refusal is
// called in the dictionary.
//
// Kept free of any import so a verifier can load it directly — the same reason
// autoReveal.ts and planAutoAsk.ts are shaped this way. Anything that reaches
// the Supabase client belongs in api/pinAuth.ts, not here.

export type PinFailure =
  | "pin_invalid"
  | "pin_locked"
  | "pin_not_set"
  | "pin_already_set"
  | "pin_format"
  | "join_invalid"
  | "join_not_live"
  | "student_unknown"
  | "not_in_this_class"
  | "pin_unavailable";

export type PinFailureKey = `pin.error.${PinFailure}`;

const KNOWN_FAILURES: PinFailure[] = [
  "pin_invalid",
  "pin_locked",
  "pin_not_set",
  "pin_already_set",
  "pin_format",
  "join_invalid",
  "join_not_live",
  "student_unknown",
  "not_in_this_class"
];

/** Six digits, and nothing else. Matches the server's own check exactly. */
export function isValidPin(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin.trim());
}

/**
 * The bilingual string key for a failure the server named.
 *
 * Typed as the literal union rather than `string` so `t()` still checks it: a
 * server code with no matching string would otherwise compile and render a raw
 * key on a student's phone mid-class. An unrecognised code falls back to the
 * generic message instead.
 */
export function pinFailureKey(code: string | undefined): PinFailureKey {
  const match = KNOWN_FAILURES.find((known) => known === code);
  return match ? `pin.error.${match}` : "pin.error.pin_unavailable";
}
