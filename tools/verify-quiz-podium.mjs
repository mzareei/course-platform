// After the quiz closes, every student sees their place and the top three go
// on the professor's podium by student ID.
//
// The rule that matters most here is the one about names: a student's real
// name is WITHHELD BY THE SERVER unless they opted in. Sending the name and
// hiding it in the client would put every classmate's name in a response any
// student's phone can read.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// readFileSync resolves against the working directory; import() resolves
// against this module's URL in tools/, one level deeper. Two helpers on
// purpose — confusing them silently imports the wrong folder.
const fn = (name) => `../mzareei.github.io/supabase/functions/${name}`;
const backend = (name) =>
  new URL(`../../mzareei.github.io/supabase/functions/${name}`, import.meta.url);

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

if (!existsSync(fn("_shared"))) {
  console.log("verify-quiz-podium: backend repo not checked out, skipping");
  process.exit(0);
}

const { PODIUM_PLACES, rankAttempts, podiumCut, rankOf } =
  await import(backend("_shared/quiz-rank.ts").href);

const a = (profile_id, score_final, submitted_at, status = "submitted") =>
  ({ profile_id, score_final, submitted_at, status });

const T = (m) => `2026-08-14T18:${String(m).padStart(2, "0")}:00.000Z`;

// ------------------------------------------------------------------ ordering
const ranked = rankAttempts([
  a("c", 70, T(3)),
  a("a", 95, T(5)),
  a("b", 88, T(2))
]);
assert.deepEqual(
  ranked.map((r) => [r.profile_id, r.rank]),
  [["a", 1], ["b", 2], ["c", 3]],
  "highest score_final first, regardless of who submitted earliest"
);

// score_final already folds in the speed bonus, so faster-and-correct wins on
// its own. submitted_at only orders WITHIN a shared place.
const tied = rankAttempts([a("late", 90, T(9)), a("early", 90, T(1)), a("third", 50, T(2))]);
assert.deepEqual(
  tied.map((r) => [r.profile_id, r.rank]),
  [["early", 1], ["late", 1], ["third", 3]],
  "equal scores share a place, and the next student's number skips past them"
);

// --------------------------------------------------------- who gets ranked
const mixed = rankAttempts([
  a("finished", 80, T(4)),
  a("abandoned", null, null, "started"),
  a("was_late", 60, T(9), "late")
]);
assert.deepEqual(
  mixed.map((r) => r.profile_id),
  ["finished", "was_late"],
  "only submitted and late attempts are ranked"
);
assert.equal(
  mixed.length,
  2,
  "a student who opened the quiz and abandoned it is not ranked last, they are not ranked"
);
assert.deepEqual(
  rankAttempts([a("x", null, T(1))]).map((r) => r.rank),
  [1],
  "a submitted attempt with no score yet still holds a place"
);
assert.deepEqual(rankAttempts([]), [], "no submissions rank nobody");

// ------------------------------------------------------------------- podium
assert.equal(PODIUM_PLACES, 3, "the podium is a top three");
assert.deepEqual(
  podiumCut(rankAttempts([a("a", 90, T(1)), a("b", 80, T(1)), a("c", 70, T(1)), a("d", 60, T(1))]))
    .map((r) => r.profile_id),
  ["a", "b", "c"],
  "the podium takes the first three places"
);
assert.deepEqual(
  podiumCut(rankAttempts([a("a", 90, T(1)), a("b", 80, T(1))])).map((r) => r.profile_id),
  ["a", "b"],
  "two submissions make a two-place podium, not an empty slot"
);
assert.deepEqual(podiumCut(rankAttempts([])), [], "an empty quiz has an empty podium");

// A tie spanning third place shows everyone holding it. Truncating to exactly
// three would drop a student who earned the same score as the one shown.
assert.deepEqual(
  podiumCut(rankAttempts([
    a("a", 90, T(1)), a("b", 80, T(1)), a("c", 70, T(1)), a("d", 70, T(2)), a("e", 60, T(1))
  ])).map((r) => r.profile_id),
  ["a", "b", "c", "d"],
  "a tie for third puts four students on the podium"
);

// -------------------------------------------------------------- one student
const board = rankAttempts([a("a", 90, T(1)), a("b", 80, T(1)), a("c", 70, T(1)), a("d", 60, T(1))]);
assert.deepEqual(
  rankOf(board, "c"),
  { rank: 3, of: 4, is_top3: true },
  "a student's own place counts only the students who finished"
);
assert.deepEqual(
  rankOf(board, "d"),
  { rank: 4, of: 4, is_top3: false },
  "fourth place is not on the podium"
);
assert.equal(rankOf(board, "nobody"), null, "a student who did not submit has no place");

// ------------------------------------------------- the server withholds names
const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");

check(
  /quiz-rank\.ts/.test(classQuiz) && /podiumCut/.test(classQuiz),
  "the podium action must use the shared ranking rule"
);
check(
  /quiz-rank\.ts/.test(pulse) && /rankOf/.test(pulse),
  "the student's own place must use the same rule, not a second one"
);
check(
  /name_revealed\s*\?/.test(classQuiz) || /name_revealed[\s\S]{0,120}:\s*null/.test(classQuiz),
  "the podium must send a name ONLY when that student opted in"
);
check(
  /set_name_reveal/.test(attempt),
  "students need an action to opt in"
);
// Deliberately not a bare token match. `/podiumCut|top 3|PODIUM_PLACES/` would
// pass on an unused import or a stray comment while the actual refusal was
// missing — and the thing being gated is a privacy control: without it any
// student can flip their own name onto the screen at the front of the room.
// Match the refusal itself, following a real podiumCut call.
check(
  /podiumCut\([\s\S]{0,400}?throw new Error\("Only the top three can be named on the podium\./.test(attempt),
  "set_name_reveal must REFUSE a caller who is not on the podium, after a real podiumCut — not merely mention one"
);
check(
  /throw new Error\("The quiz is still running\./.test(attempt),
  "set_name_reveal must refuse while the quiz is still running"
);
// ...but ONLY in the reveal direction. Rankings move after the close — a
// submission landing inside the sixty-second grace is graded like any other and
// can displace someone who was third when they tapped "show my name". Requiring
// podium membership to withdraw left that student unable to take their name off
// the screen at the front of the room while the banner still said it was up
// there. Consent that cannot be withdrawn is not consent, and hiding a name can
// only ever remove information — there is nothing to protect by refusing.
check(
  /if \(input\.revealed\)\s*\{[\s\S]{0,700}?throw new Error\("Only the top three can be named on the podium\.[\s\S]{0,40}?\}\s*\n\s*\}/.test(attempt),
  "the podium-membership guard must apply to REVEALING only — a student must always be able to withdraw"
);

// The client must not be the thing hiding a name.
const podium = existsSync("src/features/quiz/Podium.tsx")
  ? readFileSync("src/features/quiz/Podium.tsx", "utf8")
  : "";
check(podium.length > 0, "src/features/quiz/Podium.tsx must exist");
check(
  !/full_name|preferred_name/.test(podium),
  "the client must never receive a full name to decide about"
);

if (failures.length) {
  console.error("quiz podium verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-quiz-podium: OK");
