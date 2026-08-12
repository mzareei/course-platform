// Pausing is how a class that ran out of time survives to the next session
// without being concluded: no review release, no grade, no "this class is over"
// on thirty phones. These assertions hold the rules that make it safe — it must
// not strand an open question, it must have a way back, and it must not be
// dressed as heavily as the irreversible action beside it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("src/api/session.ts", "utf8");
const runClass = readFileSync("src/screens/instructor/RunClass.tsx", "utf8");
const strings = readFileSync("src/i18n/strings.ts", "utf8");

assert.match(
  api,
  /next_state: "paused"/,
  "pausing must ask the server for the paused state"
);
assert.match(
  api,
  /export function resumeClassSession/,
  "a paused class must have a way back — every state needs one (pitfall #16)"
);
assert.match(
  api,
  /export function pauseClassSession/,
  "pausing must be its own call, not a flag on ending"
);

assert.match(
  runClass,
  /const isPaused = session\?\.state === "paused"/,
  "Run Class must distinguish a paused session from one that never started"
);
assert.match(
  runClass,
  /await closePulse\(activeRound\.round_id\)/,
  "pausing must not leave a question open on thirty phones nobody will ever reveal"
);
assert.match(
  runClass,
  /t\("run\.pause"\)/,
  "the pause control must be translated"
);
assert.match(
  runClass,
  /t\("run\.resume"\)/,
  "the resume control must be translated"
);

// Pause is reversible in one click and creates nothing. End class posts every
// grade and publishes the lecture. Dressing them the same pushes the professor
// toward the irreversible one, which is how a half-taught class gets graded.
assert.match(
  runClass,
  /class="btn danger"[\s\S]{0,240}onClick=\{onEndClass\}/,
  "End class must remain the dangerous-looking action"
);
assert.doesNotMatch(
  runClass,
  /class="btn danger"[\s\S]{0,240}onPauseClass/,
  "pause must not be styled as destructive — it destroys nothing"
);
assert.doesNotMatch(
  runClass,
  /pauseConfirming/,
  "pause must not carry a confirm step; that weight belongs to ending"
);

// Every string in EN + ES, and the paused copy must promise what pausing
// actually does: nothing graded, nothing published, students keep the class.
for (const key of ["run.pause", "run.resume", "run.paused", "run.pausedBody", "run.pauseFailed", "run.resumeFailed"]) {
  assert.match(
    strings,
    new RegExp(`"${key.replace(".", "\\.")}"`),
    `${key} must exist in the bilingual dictionary`
  );
}

console.log("verify-pause-resume: OK");
