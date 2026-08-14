// The end-of-class quiz used to give an easy question 20 seconds. A room of
// second-language readers cannot read a prompt, four options and decide in 20
// seconds, so the floor is now 30 and only genuinely long questions get 45.
//
// The rule lives in the backend and is executed here rather than grepped: a
// threshold is a number, and a number that is never run is a number nobody
// checked. The client must hold no copy of it — the two repos deploy
// independently, so a duplicated constant drifts silently.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// readFileSync resolves against the working directory (the repo root, the way
// every other verifier reads src/…). import() resolves against THIS MODULE's
// URL, which is tools/ — one level deeper. Two helpers, deliberately, because
// getting them confused silently imports the wrong folder.
const fn = (name) => `../mzareei.github.io/supabase/functions/${name}`;
const backend = (name) =>
  new URL(`../../mzareei.github.io/supabase/functions/${name}`, import.meta.url);

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

// ------------------------------------------------------------------- the rule
if (!existsSync(fn("_shared"))) {
  console.log("verify-quiz-timing: backend repo not checked out, skipping");
  process.exit(0);
}

const {
  BASE_SECONDS, LONG_SECONDS, LONG_THRESHOLD_CHARS, CUSHION_SECONDS,
  MIN_TOTAL_SECONDS, MAX_TOTAL_SECONDS,
  readingLoad, secondsForQuestion, estimateTotalSeconds
} = await import(backend("_shared/question-timing.ts").href);

const q = (prompt, options = [], extra = {}) => ({
  prompt,
  options: options.map((option_text) => ({ option_text })),
  ...extra
});

// The floor. This is the whole point of the change.
assert.equal(BASE_SECONDS, 30, "no question may be given fewer than 30 seconds");
assert.equal(LONG_SECONDS, 45, "the long-question ceiling is 45 seconds");
assert.equal(
  secondsForQuestion(q("What is a firewall?", ["A wall", "A filter", "A door", "A log"])),
  30,
  "a short question gets the 30-second base"
);
assert.equal(
  secondsForQuestion(q("x".repeat(400), ["a", "b", "c", "d"])),
  45,
  "a question past the reading threshold gets 45 seconds"
);
assert.equal(
  secondsForQuestion(q("x".repeat(100), ["y".repeat(80), "y".repeat(80), "y".repeat(80), "y".repeat(80)])),
  45,
  "options count toward reading load, not just the prompt"
);
assert.equal(
  secondsForQuestion(q("", [])),
  30,
  "an empty question still gets the base, never zero"
);

// Spanish is measured too, and the longer language wins. Spanish renders
// 15-20% longer than English; a borderline question read in Spanish must not
// get less time than the rule intends.
assert.equal(
  secondsForQuestion({
    prompt: "x".repeat(100),
    prompt_es: "y".repeat(400),
    options: []
  }),
  45,
  "a question that is long only in Spanish still gets 45 seconds"
);
assert.equal(
  readingLoad({ prompt: "abc", prompt_es: null, options: [{ option_text: "de" }] }),
  5,
  "reading load is prompt plus every option, in characters"
);

// Missing/odd shapes must not throw — this runs on live class data.
assert.equal(secondsForQuestion({}), 30, "a question with no fields gets the base");
assert.equal(secondsForQuestion({ prompt: null, options: null }), 30, "nulls are tolerated");

// --------------------------------------------------------------- the total
// Worst case, not average. The all-finished trigger means the countdown is a
// backstop, so an over-generous total costs nothing while a tight one cuts a
// student off mid-question. The asymmetry is entirely one-sided.
const shortQ = q("short", ["a", "b"]);
const longQ = q("x".repeat(400), ["a", "b"]);

assert.equal(
  estimateTotalSeconds([shortQ, shortQ, shortQ, shortQ], 4),
  4 * 30 + CUSHION_SECONDS,
  "an all-short quiz totals the base times the count, plus the cushion"
);
assert.equal(
  estimateTotalSeconds([longQ, longQ, longQ, longQ], 4),
  4 * 45 + CUSHION_SECONDS,
  "an all-long quiz totals the ceiling times the count, plus the cushion"
);
assert.equal(
  estimateTotalSeconds([shortQ, shortQ, longQ, longQ], 2),
  2 * 45 + CUSHION_SECONDS,
  "a mixed pool is sized for the student who draws the LONGEST questions"
);
assert.equal(
  estimateTotalSeconds([shortQ, longQ], 5),
  30 + 45 + CUSHION_SECONDS,
  "asking for more questions than the pool holds sizes to the pool"
);
assert.equal(
  estimateTotalSeconds([], 10),
  MIN_TOTAL_SECONDS,
  "an empty pool clamps to the floor rather than returning the bare cushion"
);
assert.equal(
  estimateTotalSeconds(Array.from({ length: 200 }, () => longQ), 200),
  MAX_TOTAL_SECONDS,
  "an absurd quiz clamps to the one-hour ceiling"
);
assert.equal(CUSHION_SECONDS, 120, "the cushion is the professor's two minutes");

// ------------------------------------------------------ no second copy of it
// The server stamps each question with its own `seconds`; the player reads that
// field. A constant table in the client is the drift this prevents.
const player = readFileSync("src/features/quiz/Player.tsx", "utf8");
check(
  !/SECONDS_BY_DIFFICULTY/.test(player),
  "the client must not keep a difficulty-to-seconds table"
);
check(
  !/\b(20|30|45)\s*\*\s*1000/.test(player),
  "the client must not compute a question deadline from a literal number of seconds"
);
check(
  /question\.seconds|current\.seconds|\.seconds\b/.test(player),
  "the player must take each question's time from the server's `seconds` field"
);

// Two effects share one stateRef snapshot per tick, so `busy` (state) cannot
// stop the second from submitting after the first already has. Only a ref
// latches synchronously.
check(
  /const submitting = useRef\(false\)/.test(player)
    && /if \(submitting\.current\) return;/.test(player),
  "submitNow must latch on a ref against re-entry within a single clock tick"
);

// The two callers must both go through the shared rule.
const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
check(
  /question-timing\.ts/.test(classQuiz) && /estimateTotalSeconds/.test(classQuiz),
  "course-class-quiz must size the instance with the shared estimate"
);
check(
  /question-timing\.ts/.test(attempt) && /secondsForQuestion/.test(attempt),
  "course-activity-attempt must stamp each question with the shared rule"
);
check(
  !/defaultTimeLimitSeconds\s*=\s*600/.test(classQuiz),
  "the flat 10-minute default must be gone, not merely unused"
);

if (failures.length) {
  console.error("quiz timing verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-quiz-timing: OK");
