// A live question that is never revealed leaves every phone saying "recorded"
// and never "you were right". These are the rules that end a question on the
// professor's behalf, and the ones that must never end it early.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADVANCES_BEFORE_REVEAL,
  autoRevealReason,
  countAdvance,
  EVERYONE_ANSWERED_FLOOR_MS
} from "../src/features/live/autoReveal.ts";

const NOW = 1_760_000_000_000;
const open = {
  state: "open",
  endsAt: new Date(NOW + 30_000).toISOString(),
  openedAtMs: NOW - 20_000,
  nowMs: NOW,
  answered: 3,
  present: 10,
  advancesSinceAsked: 0
};

assert.equal(autoRevealReason(open), null, "a question mid-flight must stay open");

// ---------------------------------------------------------------- time is up
assert.equal(
  autoRevealReason({ ...open, endsAt: new Date(NOW).toISOString() }),
  "timeUp",
  "reaching the deadline must reveal"
);
assert.equal(
  autoRevealReason({ ...open, endsAt: new Date(NOW - 1).toISOString() }),
  "timeUp",
  "a deadline already passed must reveal"
);
assert.equal(
  autoRevealReason({ ...open, endsAt: null }),
  null,
  "a round with no deadline must not be revealed by the clock"
);

// ------------------------------------------------------- everyone has answered
assert.equal(
  autoRevealReason({ ...open, answered: 10, present: 10 }),
  "everyoneAnswered",
  "once every student in the room has answered there is nothing left to wait for"
);
assert.equal(
  autoRevealReason({ ...open, answered: 12, present: 10 }),
  "everyoneAnswered",
  "a late check-in must not strand the reveal above the target"
);
assert.equal(
  autoRevealReason({ ...open, answered: 9, present: 10 }),
  null,
  "one student still thinking keeps the question open"
);
assert.equal(
  autoRevealReason({ ...open, answered: 28, present: 0 }),
  null,
  "an empty room must never satisfy 'everyone answered'"
);
assert.equal(
  autoRevealReason({
    ...open,
    answered: 1,
    present: 1,
    openedAtMs: NOW - (EVERYONE_ANSWERED_FLOOR_MS - 1)
  }),
  null,
  "one fast tap must not end the question before the room has read it"
);
assert.equal(
  autoRevealReason({
    ...open,
    answered: 1,
    present: 1,
    openedAtMs: NOW - EVERYONE_ANSWERED_FLOOR_MS
  }),
  "everyoneAnswered",
  "past the floor, a fully-answered question may reveal"
);

// ------------------------------------------------------------- moved on
assert.equal(ADVANCES_BEFORE_REVEAL, 3);
for (let advances = 0; advances < ADVANCES_BEFORE_REVEAL; advances++) {
  assert.equal(
    autoRevealReason({ ...open, advancesSinceAsked: advances }),
    null,
    `${advances} advance(s) is a slip on a clicker, not a decision`
  );
}
assert.equal(
  autoRevealReason({ ...open, advancesSinceAsked: ADVANCES_BEFORE_REVEAL }),
  "movedOn",
  "three deliberate advances mean the class has left the question behind"
);

// ------------------------------------------------- only an open round reveals
for (const state of ["revealed", "closed"]) {
  assert.equal(
    autoRevealReason({ ...open, state, answered: 10, advancesSinceAsked: 9 }),
    null,
    `a ${state} round must never be revealed again`
  );
}

// -------------------------------------------------------- counting advances
assert.equal(countAdvance(0, 22, 23), 1, "moving forward counts");
assert.equal(countAdvance(1, 23, 22), 1, "paging back to re-explain does not count");
assert.equal(countAdvance(1, 22, 22), 1, "standing still does not count");
assert.equal(countAdvance(2, 22, 40), 3, "a jump forward counts once, not by distance");
assert.equal(countAdvance(1, null, 23), 1, "an unknown previous position cannot be a move");
assert.equal(countAdvance(1, 22, null), 1, "an unknown next position cannot be a move");

// A professor who pages back and forth over the question must not trip it.
{
  let advances = 0;
  const walk = [22, 23, 22, 23, 22, 21, 22];
  for (let i = 1; i < walk.length; i++) {
    advances = countAdvance(advances, walk[i - 1], walk[i]);
  }
  assert.equal(
    autoRevealReason({ ...open, advancesSinceAsked: advances }),
    "movedOn",
    "three net forward steps still count, even taken among back-steps"
  );
  assert.equal(advances, 3, "only the forward steps are counted");
}

// ------------------------------------------------------------------- wiring
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runClass = readFileSync(
  path.join(root, "src/screens/instructor/RunClass.tsx"),
  "utf8"
);
assert.match(
  runClass,
  /autoRevealReason\(/,
  "Run Class must consult the shared rule rather than re-deriving it"
);
assert.match(
  runClass,
  /countAdvance\(/,
  "Run Class must count only forward movement past the question"
);
assert.doesNotMatch(
  runClass,
  /autoRevealReason\([\s\S]{0,600}?\)\s*\)\s*\{[\s\S]{0,200}?closePulse/,
  "auto-reveal must never close the round — closing hides the answer from every phone"
);
assert.match(
  runClass,
  /present:\s*/,
  "the reveal decision must be fed the checked-in count, not the roster"
);

console.log("verify-auto-reveal: OK");
