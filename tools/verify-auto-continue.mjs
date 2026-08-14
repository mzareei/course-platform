// Revealing shows the class the answer. Retiring the question is a separate
// act, and until now the only automatic one came from a deck message that
// imported lectures cannot send — so the cockpit held the last question
// forever while every student's phone had already moved on. These are the
// conditions under which the cockpit lets go by itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADVANCES_BEFORE_REVEAL,
  AUTO_CONTINUE_AFTER_REVEAL_MS,
  REVEAL_DISPLAY_MS,
  autoContinueReason,
  secondsUntilAutoContinue
} from "../src/features/live/autoReveal.ts";

const revealedAtMs = 1_000_000;
const revealed = {
  state: "revealed",
  revealedAtMs,
  nowMs: revealedAtMs + 1000,
  advancesSinceRevealed: 0
};

// ------------------------------------------------ only a revealed round retires
assert.equal(
  autoContinueReason(revealed),
  null,
  "a question just revealed must stay on screen"
);
for (const state of ["open", "closed"]) {
  assert.equal(
    autoContinueReason({ ...revealed, state, nowMs: revealedAtMs + REVEAL_DISPLAY_MS + 1 }),
    null,
    `a ${state} round must never be retired by this rule`
  );
}

// ------------------------------- the answer gets read before the lecture resumes
// Continuing closes the round, and course-pulse stops serving a closed round, so
// this delay is the entire window a student has to read "you were right". Zero
// would take the verdict away in the frame it appeared (pitfall #66).
assert.ok(
  AUTO_CONTINUE_AFTER_REVEAL_MS >= 10_000,
  "the answer must stay up long enough for a phone polling every 3s to show it"
);
assert.ok(
  AUTO_CONTINUE_AFTER_REVEAL_MS < REVEAL_DISPLAY_MS,
  "the cockpit must never hold a question longer than course-pulse serves it"
);
assert.equal(
  REVEAL_DISPLAY_MS,
  3 * 60 * 1000,
  "the outer bound must stay the three minutes course-pulse serves students"
);
assert.equal(
  autoContinueReason({
    ...revealed,
    nowMs: revealedAtMs + AUTO_CONTINUE_AFTER_REVEAL_MS - 1
  }),
  null,
  "inside the reading window the answer must stay on screen"
);
assert.equal(
  autoContinueReason({
    ...revealed,
    nowMs: revealedAtMs + AUTO_CONTINUE_AFTER_REVEAL_MS
  }),
  "answerShown",
  "once the answer has been up long enough the lecture must resume by itself"
);

// ------------------------------------------------------ the countdown it shows
assert.equal(
  secondsUntilAutoContinue({ revealedAtMs, nowMs: revealedAtMs }),
  AUTO_CONTINUE_AFTER_REVEAL_MS / 1000,
  "the countdown must start at the full window"
);
assert.equal(
  secondsUntilAutoContinue({
    revealedAtMs,
    nowMs: revealedAtMs + AUTO_CONTINUE_AFTER_REVEAL_MS + 5_000
  }),
  0,
  "the countdown must never go negative"
);
assert.equal(
  secondsUntilAutoContinue({ revealedAtMs: null, nowMs: revealedAtMs }),
  null,
  "a round with no reveal time has no countdown — autoContinueReason will not fire on the clock for it either, so the panel must not promise one"
);

// ------------------------------------------------ the professor plainly moved on
assert.equal(
  autoContinueReason({ ...revealed, advancesSinceRevealed: ADVANCES_BEFORE_REVEAL - 1 }),
  null,
  "one or two forward presses is teaching, not leaving"
);
assert.equal(
  autoContinueReason({ ...revealed, advancesSinceRevealed: ADVANCES_BEFORE_REVEAL }),
  "movedOn",
  "advancing well past the answered question must retire it"
);

// ------------------------------------------- a round recovered after a reload
assert.equal(
  autoContinueReason({ ...revealed, revealedAtMs: null }),
  null,
  "an unknown reveal time must never retire on the clock — only on moving on"
);
assert.equal(
  autoContinueReason({
    ...revealed,
    revealedAtMs: null,
    advancesSinceRevealed: ADVANCES_BEFORE_REVEAL
  }),
  "movedOn",
  "moving on still works when the reveal time is unknown"
);

// ------------------------------------------------------------------- wiring
const runClass = readFileSync("src/screens/instructor/RunClass.tsx", "utf8");

assert.match(
  runClass,
  /autoContinueReason\(/,
  "Run Class must ask whether a revealed question should retire"
);
assert.match(
  runClass,
  /void continueCheckpoint\(false\)/,
  "retiring must reuse the same path the Continue button uses, so it closes the round server-side"
);
assert.match(
  runClass,
  /checkpointContinueInFlight\.current/,
  "a retire must not fire while a continue is already running"
);
assert.match(
  runClass,
  /advancesSinceRevealed/,
  "Run Class must count slides advanced after the reveal, separately from those before it"
);

// The whole bug was that the only automatic retire depended on a deck message
// imported lectures never send. If the clock trigger is ever keyed on the
// round's checkpoint slide, it reintroduces exactly that: a plan-driven round
// carries no checkpoint_after_slide at all.
assert.match(
  runClass,
  /revealedRoundId/,
  "the retire must key on the revealed round itself, not on a deck checkpoint"
);

// The subtle one. autoRevealReason fires "movedOn" at three advances, so by the
// time a question is revealed that way, advancesSinceAsked is ALREADY at the
// threshold. Sharing that counter would retire the answer in the same second it
// appeared — the class would never see it. The two counters must reset on
// different rounds: one when a question opens, one when it is revealed.
assert.match(
  runClass,
  /setAdvancesSinceAsked\(0\);\s*\n\s*previousRevealSlide\.current = bridge\.slide;\s*\n\s*\}, \[openRoundId\]\)/,
  "the asked counter must reset when a question opens"
);
assert.match(
  runClass,
  /setAdvancesSinceRevealed\(0\);\s*\n\s*previousContinueSlide\.current = bridge\.slide;\s*\n\s*\}, \[revealedRoundId\]\)/,
  "the revealed counter must reset when a question is revealed, not when it opened"
);
assert.doesNotMatch(
  runClass,
  /autoContinueReason\(\{[\s\S]{0,200}advancesSinceAsked/,
  "the retire must never read the pre-reveal counter — it is already at the threshold"
);

// The professor teaches from fullscreen and asked for the answer to hand the
// lecture back without a click. A countdown he cannot see is a screen that
// changes under him, so the panel has to say what is about to happen.
const panel = readFileSync("src/features/live/CheckpointPanel.tsx", "utf8");
assert.match(
  panel,
  /secondsUntilAutoContinue\(/,
  "the panel must show how long the answer stays up before the lecture resumes"
);
assert.match(
  panel,
  /run\.checkpoint\.continuingIn/,
  "the countdown must be a translated string, not a bare number"
);
assert.match(
  panel,
  /state\.type !== "open" && state\.type !== "revealed"/,
  "the one-second tick must run while revealed too, or the countdown never repaints"
);

console.log("verify-auto-continue: OK");
