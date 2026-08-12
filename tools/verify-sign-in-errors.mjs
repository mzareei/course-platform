// Thirty students pressing Send inside one minute is the normal shape of a
// class, and Supabase's answer to it is a 429 whose English message a student
// cannot act on. These are the shapes that must be recognised as "too many at
// once" rather than passed through raw.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifySendFailure } from "../src/features/auth/signInErrors.ts";

// Supabase AuthApiError carries status and code as own properties.
function authError(message, extra = {}) {
  return Object.assign(new Error(message), extra);
}

// ----------------------------------------------------- the project-wide limit
assert.deepEqual(
  classifySendFailure(authError("email rate limit exceeded", { status: 429 })),
  { kind: "rateLimited", seconds: null },
  "a 429 must be recognised as too many sign-ins at once"
);
assert.deepEqual(
  classifySendFailure(
    authError("over_email_send_rate_limit", { code: "over_email_send_rate_limit" })
  ),
  { kind: "rateLimited", seconds: null },
  "the documented rate-limit code must be recognised without a status"
);
assert.deepEqual(
  classifySendFailure(authError("Email rate limit exceeded")),
  { kind: "rateLimited", seconds: null },
  "the message alone must be enough when neither status nor code arrives"
);

// -------------------------------------------------- the per-address cooldown
assert.deepEqual(
  classifySendFailure(
    authError("For security purposes, you can only request this after 27 seconds.")
  ),
  { kind: "rateLimited", seconds: 27 },
  "the per-address cooldown must surface the number of seconds to wait"
);
assert.deepEqual(
  classifySendFailure(
    authError("For security purposes, you can only request this after 1 second.")
  ),
  { kind: "rateLimited", seconds: 1 },
  "a one-second wait is singular in Supabase's own text and must still parse"
);

// ------------------------------------------------------- everything that is not
assert.deepEqual(
  classifySendFailure(authError("Unable to validate email address: invalid format")),
  { kind: "other", message: "Unable to validate email address: invalid format" },
  "an unrelated failure must pass its own message through"
);
assert.deepEqual(
  classifySendFailure(authError("Signups not allowed for otp", { status: 422 })),
  { kind: "other", message: "Signups not allowed for otp" },
  "a non-429 status must not be treated as a rate limit"
);
assert.deepEqual(
  classifySendFailure(null),
  { kind: "other", message: null },
  "a thrown non-error must not crash the sign-in screen"
);
assert.deepEqual(
  classifySendFailure({ status: 429 }),
  { kind: "rateLimited", seconds: null },
  "a plain object from a network layer must classify on status alone"
);

// ------------------------------------------------------------------- wiring
const signIn = readFileSync("src/screens/SignIn.tsx", "utf8");
assert.match(
  signIn,
  /classifySendFailure\(/,
  "the sign-in screen must classify a send failure rather than print it raw"
);
assert.match(
  signIn,
  /t\("signIn\.rateLimitedWait"/,
  "a countdown must be offered when the server named the seconds"
);
assert.match(
  signIn,
  /t\("signIn\.rateLimitedBusy"/,
  "a class-wide limit with no number must still explain itself"
);
assert.match(
  signIn,
  /setSent\(true\)/,
  "a rate-limited send must still reveal the code box, so a student whose email did arrive is not blocked behind a classmate's failure"
);

console.log("verify-sign-in-errors: OK");
