// Why a student cannot sign in, in terms a student can act on.
//
// Supabase answers a room full of simultaneous sign-ins with a 429 and an
// English sentence about rate limits. Printed raw on a phone mid-class it reads
// as "the app is broken", and the student stops trying — which is exactly what
// happened in the first real class. Two distinct limits produce it:
//
//   - the project-wide email ceiling ("email rate limit exceeded"), which is
//     about the whole room and clears on its own
//   - the per-address cooldown ("you can only request this after 27 seconds"),
//     which names its own wait
//
// They need different sentences, so they are classified apart here rather than
// collapsed into one "try again later".

export type SendFailure =
  | { kind: "rateLimited"; seconds: number | null }
  | { kind: "other"; message: string | null };

const RATE_LIMIT_CODES = [
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "over_sms_send_rate_limit"
];

/** "…after 27 seconds." / "…after 1 second." — Supabase writes both. */
const SECONDS_PATTERN = /after (\d+) seconds?/i;

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

export function classifySendFailure(error: unknown): SendFailure {
  if (!error || typeof error !== "object") {
    return { kind: "other", message: null };
  }
  const source = error as Record<string, unknown>;
  const message = readString(source, "message");
  const code = readString(source, "code");
  const status = Number(source.status);

  const seconds = Number(message.match(SECONDS_PATTERN)?.[1] ?? Number.NaN);
  const rateLimited =
    status === 429
    || RATE_LIMIT_CODES.includes(code)
    || RATE_LIMIT_CODES.some((entry) => message.includes(entry))
    || /rate limit/i.test(message)
    || Number.isFinite(seconds);

  if (rateLimited) {
    return { kind: "rateLimited", seconds: Number.isFinite(seconds) ? seconds : null };
  }
  return { kind: "other", message: message || null };
}
