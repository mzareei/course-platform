// Revealing shows the class the answer. Retiring the question is a separate
// act, and until now the only automatic one came from a deck message that
// imported lectures cannot send — so the cockpit held the last question
// forever while every student's phone had already moved on. These are the
// conditions under which the cockpit lets go by itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADVANCES_BEFORE_REVEAL,
  REVEAL_DISPLAY_MS,
  autoContinueReason
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

// -------------------------------------- the phones' own window, matched exactly
assert.equal(
  REVEAL_DISPLAY_MS,
  3 * 60 * 1000,
  "the cockpit must use the same three minutes course-pulse serves students"
);
assert.equal(
  autoContinueReason({ ...revealed, nowMs: revealedAtMs + REVEAL_DISPLAY_MS - 1 }),
  null,
  "inside the window the cockpit must still show what the phones show"
);
assert.equal(
  autoContinueReason({ ...revealed, nowMs: revealedAtMs + REVEAL_DISPLAY_MS }),
  "displayWindowElapsed",
  "when the phones drop the question the cockpit must drop it too"
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

console.log("verify-auto-continue: OK");
