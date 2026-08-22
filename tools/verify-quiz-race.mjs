// The piñata race, the carry-over timer, and the 40-word exit ticket.
// Pure modules are imported and executed; wiring is grepped. Sections are
// appended task by task — see docs/superpowers/plans/2026-08-19-end-of-class-quiz-pinata-race.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backendPath, backendUrl, skipWithoutBackend } from "./lib/backend-root.mjs";

if (skipWithoutBackend("verify-quiz-race")) process.exit(0);

const fn = (name) => backendPath(`supabase/functions/${name}`);
const backend = (name) => backendUrl(`supabase/functions/${name}`);
const frontend = (rel) => new URL(`../${rel}`, import.meta.url);

// ------------------------------------------------- exit ticket: 40 words
{
  const migration = readFileSync(backendPath("supabase/migrations/0055_reflection_min_words_40.sql"), "utf8");
  assert.match(migration, /set default 40/, "the column default must become 40");
  assert.match(migration, /reflection_min_words = 40/, "open sessions must be moved to 40");
  assert.match(migration, /not in \('closed', 'cancelled'\)/, "closed sessions keep their historical minimum");

  const exitTicket = readFileSync(fn("course-exit-ticket/index.ts"), "utf8");
  assert.match(exitTicket, /defaultReflectionMinWords = 40/, "course-exit-ticket default must be 40");

  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(pulse, /reflection_min_words \?\? 40/, "course-pulse fallback must be 40");
}

// ------------------------------------------------- racer names
{
  const { ANIMALS, ADJECTIVES, pickRacerName } = await import(backend("_shared/racer-names.ts").href);
  assert.ok(ANIMALS.length * ADJECTIVES.length >= 900, "at least 900 combinations");
  const names = new Set(ANIMALS.map((a) => a.name));
  assert.equal(names.size, ANIMALS.length, "animal names are unique");
  for (const a of ANIMALS) assert.ok(a.emoji && a.emoji.length > 0, `${a.name} has an emoji`);
  assert.equal(new Set(ADJECTIVES).size, ADJECTIVES.length, "adjectives are unique");

  // Exhaustion-safe and never repeats: draw 500 names, all distinct, none reused.
  const used = [];
  for (let i = 0; i < 500; i++) {
    const pick = pickRacerName(used);
    assert.ok(pick, `pick ${i} succeeded`);
    assert.ok(!used.includes(pick.name), "never returns a used name");
    assert.match(pick.name, /^\S+ \S+$/, "name is Animal Adjective");
    used.push(pick.name);
  }
  // A fully-used pool returns null rather than looping forever.
  const all = [];
  for (const a of ANIMALS) for (const adj of ADJECTIVES) all.push(`${a.name} ${adj}`);
  assert.equal(pickRacerName(all), null, "an exhausted pool yields null");
}

// ------------------------------------------------- piñata maths
{
  const { BURST_PERCENT, pinataState } = await import(backend("_shared/pinata.ts").href);
  assert.equal(BURST_PERCENT, 70, "the piñata bursts at 70% of answers correct");

  assert.equal(pinataState({ correct: 0, started: 0, questionCount: 10 }).percent, 0, "nobody started → 0%");
  assert.equal(pinataState({ correct: 130, started: 26, questionCount: 10 }).percent, 50, "130 of 260 → 50%");
  assert.equal(pinataState({ correct: 500, started: 26, questionCount: 10 }).percent, 100, "clamped to 100");
  assert.equal(pinataState({ correct: 182, started: 26, questionCount: 10 }).burst, true, "70% bursts");
  assert.equal(pinataState({ correct: 179, started: 26, questionCount: 10 }).burst, false, "68% does not");
  assert.equal(pinataState({ correct: 130, started: 26, questionCount: 10 }).total, 260, "the denominator is started × questions");
  assert.equal(
    pinataState({ correct: 10, started: 26, questionCount: 10, closedReason: "everyone" }).burst,
    true,
    "a room where everyone finished broke it, whatever the percent"
  );
  assert.equal(
    pinataState({ correct: 179, started: 26, questionCount: 10, closedReason: "time" }).burst,
    false,
    "closing by time does not burst below the threshold"
  );
}

// ------------------------------------------------- migration 0056
{
  const migration = readFileSync(backendPath("supabase/migrations/0056_quiz_pinata_race.sql"), "utf8");
  for (const needle of [
    "racer_name text",
    "racer_emoji text",
    "progress_position int not null default 0",
    "progress_answered int not null default 0",
    "student_attempts_racer_name_key",
    "create table if not exists public.quiz_cheers",
    "alter table public.quiz_cheers enable row level security",
    "revoke all on public.quiz_cheers from anon, authenticated"
  ]) {
    assert.ok(migration.includes(needle), `0056 must contain: ${needle}`);
  }
}

// ------------------------------------------------- course-activity-attempt wiring
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /from "\.\.\/_shared\/racer-names\.ts"/, "imports the racer-name generator");
  assert.match(attempt, /report_progress/, "has the report_progress action");
  assert.match(attempt, /"cheer"/, "has the cheer action");
  assert.match(attempt, /Wait a moment before the next cheer\./, "cheer enforces the cooldown server-side");
  assert.match(attempt, /nobody_left/, "cheer reports an empty room");
  assert.match(attempt, /progress_position: questionCount/, "submit stamps final progress position");
  assert.match(attempt, /racer_name, racer_emoji/, "attempt selects carry the racer identity");
  assert.match(attempt, /\.is\("racer_name", null\)/, "racer assignment cannot overwrite an existing name");
}

// ------------------------------------------------- course-class-quiz race action
{
  const quiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  assert.match(quiz, /case "race":/, "router exposes the race action");
  assert.match(quiz, /from "\.\.\/_shared\/pinata\.ts"/, "race uses the shared piñata formula");
  assert.match(quiz, /finish_place/, "race ranks finishers by submitted_at");
  assert.match(quiz, /🎒 Mochila/, "an unnamed attempt is labelled, never hidden");
}

// ------------------------------------------------- course-pulse my_race
{
  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(pulse, /my_race/, "the student poll carries my_race");
  assert.match(pulse, /from "\.\.\/_shared\/pinata\.ts"/, "the phone and the room share one piñata formula");
}

// ------------------------------------------------- the carry-over budget
{
  const { deadlines, positionAt, rebase, MAX_QUESTION_SECONDS } = await import(frontend("src/features/quiz/budget.ts").href);
  const t0 = 1_000_000;
  const secs = [30, 30, 45, 30];
  // 30/30/45/30: cumulative deadlines, so saved time visibly rolls forward.
  const dl = deadlines(secs, t0);
  assert.deepEqual(dl, [t0 + 30_000, t0 + 60_000, t0 + 105_000, t0 + 135_000], "deadlines are cumulative");
  // Answering Q1 at 25s leaves 35s on Q2 — the spec's example.
  assert.equal(dl[1] - (t0 + 25_000), 35_000, "25s on Q1 leaves 35s for Q2");
  assert.equal(positionAt(dl, t0 + 5_000), 0, "before the first deadline you are on Q1");
  assert.equal(positionAt(dl, t0 + 30_000), 1, "at the deadline you have moved on");
  // A phone asleep through three deadlines lands on the right question in one call.
  assert.equal(positionAt(dl, t0 + 110_000), 3, "skip-forward over missed questions");
  assert.equal(positionAt(dl, t0 + 999_000), 3, "clamped to the final question");

  // The ceiling. Saved seconds roll forward, but no question is ever worth
  // more than sixty — the professor's rule, executed rather than trusted.
  assert.equal(MAX_QUESTION_SECONDS, 60, "the per-question ceiling is sixty seconds");
  // A small saving rebases to the very schedule the cumulative clock already
  // had: 25s on Q1 leaves the standing deadlines untouched.
  assert.deepEqual(rebase(dl, secs, 0, t0 + 25_000), dl, "an under-cap carry keeps the cumulative schedule");
  // An instant answer banks all 30: Q2 is worth exactly 60 — the top, allowed.
  const afterQ1 = rebase(dl, secs, 0, t0);
  assert.equal(afterQ1[1], t0 + 60_000, "30 banked on 30 base sits exactly at the top");
  // Instantly again: 60 banked onto a 45s question would be 105 — capped at 60.
  const afterQ2 = rebase(afterQ1, secs, 1, t0);
  assert.equal(afterQ2[2], t0 + 60_000, "the cap holds: never more than 60 on one question");
  assert.equal(afterQ2[3], t0 + 90_000, "questions behind the capped one line up on their base");
  // The last question has nowhere to carry to.
  assert.deepEqual(rebase(dl, secs, 3, t0 + 5_000), dl, "no next question, no rebase");
}

// ------------------------------------------------- the player
{
  const player = readFileSync(frontend("src/features/quiz/Player.tsx"), "utf8");
  assert.match(player, /from "\.\/budget"/, "the player uses the shared budget module");
  assert.match(player, /rebase\(/, "an early answer rebases the schedule, so the sixty-second cap can bite");
  assert.match(player, /reportProgress\(/, "the player pings progress");
  assert.match(player, /quiz\.letsGo/, "the splash has a Let's go button");
  assert.ok(!/setQuestionDeadline/.test(player), "the per-question deadline state is gone — the budget rules");
}

// ------------------------------------------------- the phone's done card
{
  const card = readFileSync(frontend("src/features/quiz/PinataCard.tsx"), "utf8");
  assert.match(card, /pinata\.cheerButton/, "the card has the cheer button");
  assert.match(card, /cheerRacer\(/, "the button calls the cheer action");
  const live = readFileSync(frontend("src/screens/student/Live.tsx"), "utf8");
  assert.match(live, /myRace=\{/, "Live hands my_race to the player");
}

// ------------------------------------------------- the announcer
{
  const c = await import(frontend("src/features/quiz/commentary.ts").href);
  assert.equal(c.SONG_25, "🎶 Dale, dale, dale…");
  assert.equal(c.SONG_50, "🎶 …no pierdas el tino…");
  assert.equal(c.SONG_75, "🎶 …porque si lo pierdes…");
  assert.equal(c.BURST_LINE, "🎶 …¡pierdes el camino! — ¡SE ROMPIÓ! 🪅💥");

  const racer = (name, emoji, position, finished = false, place = null) =>
    ({ racer_name: name, racer_emoji: emoji, position, answered: position, finished, finish_place: place });
  const snap = (percent, racers, extra = {}) =>
    ({ percent, burst: false, closed_reason: null, state: "live", racers, cheers: [], ...extra });

  const pack = [
    racer("Perezoso Zen", "🦥", 0), racer("Ardilla Turbo", "🐿️", 1), racer("Delfín Zen", "🐬", 2),
    racer("Caballo Épico", "🐴", 4), racer("Pulpo Ninja", "🐙", 5), racer("Rana Viral", "🐸", 5),
    racer("Águila Jedi", "🦅", 6), racer("Abeja Zen", "🐝", 6), racer("Coyote Astral", "🐺", 7),
    racer("Oso Genial", "🐻", 8), racer("Ajolote Veloz", "🦎", 11, true, 1), racer("Jaguar Audaz", "🐆", 11, true, 2)
  ];

  // Milestones fire once each, in order, on crossings.
  let events = c.raceEvents(snap(20, pack), snap(55, pack), "en");
  assert.ok(events.includes(c.SONG_25) && events.includes(c.SONG_50), "crossed milestones sing");
  // A new finisher gets a candy line; a new cheer gets a porra line.
  const before = snap(50, pack);
  const after = snap(52, pack.map((r) => r.racer_name === "Oso Genial" ? { ...r, finished: true, finish_place: 3 } : r),
    { cheers: [{ from_name: "Ajolote Veloz", from_emoji: "🦎", to_name: "Perezoso Zen", to_emoji: "🦥", at: "x" }] });
  events = c.raceEvents(before, after, "en");
  assert.ok(events.some((l) => l.includes("Oso Genial") && l.includes("🍬")), "finisher line");
  assert.ok(events.some((l) => l.includes("cheers for")), "cheer line");
  // Closing by time without a burst is a near-miss, never a defeat-shame.
  events = c.raceEvents(snap(71, pack), snap(71, pack, { state: "closed", closed_reason: "time" }), "en");
  assert.ok(events.some((l) => l.includes("¡Casi!")), "the time close says casi");

  // 10,000 chants: never a banned word, never the same target twice running.
  let seed = 42;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let lastTarget = null;
  for (let i = 0; i < 10000; i++) {
    const chant = c.chantLine(snap(40, pack), lastTarget, rng);
    assert.ok(chant, "a live pack always has someone to cheer");
    for (const word of c.BANNED_WORDS) {
      assert.ok(!chant.line.toLowerCase().includes(word), `banned word "${word}" in: ${chant.line}`);
    }
    assert.notEqual(chant.target, lastTarget, "never the same racer twice in a row");
    lastTarget = chant.target;
  }
  // Every event template is also banned-word-free.
  for (const line of events) {
    for (const word of c.BANNED_WORDS) assert.ok(!line.toLowerCase().includes(word), `banned word in event: ${line}`);
  }
}

// ------------------------------------------------- the room's screen
{
  const layer = readFileSync(frontend("src/features/live/ClassroomPinataLayer.tsx"), "utf8");
  assert.match(layer, /classQuizRace\(/, "the layer polls the race action");
  assert.match(layer, /raceEvents\(/, "poll diffs feed the announcer");
  assert.match(layer, /chantLine\(/, "idle time cheers the back of the pack");
  assert.match(layer, /Escape/, "Escape closes the layer");
  assert.match(layer, /prefers-reduced-motion|reducedMotion/, "candy rain respects reduced motion");
  const endOfClass = readFileSync(frontend("src/screens/instructor/EndOfClass.tsx"), "utf8");
  assert.match(endOfClass, /ClassroomPinataLayer/, "End of Class mounts the layer");
  assert.match(endOfClass, /setShowingPinata\(true\)/, "the layer opens on start/adopt");
}

// ------------------------------------------------- fair shuffle
{
  const { shuffle } = await import(backend("_shared/shuffle.ts").href);

  // A biased shuffle leaves element 0 near the front far more often than 1/4.
  // Over 40k trials on 4 items, each position should hold ~10000 (±5%).
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 40000; i++) {
    const out = shuffle(["a", "b", "c", "d"]);
    counts[out.indexOf("a")] += 1;
  }
  for (const c of counts) {
    assert.ok(Math.abs(c - 10000) < 500, `fair shuffle: position count ${c} is within 5% of 10000`);
  }

  // The old approach must actually fail that bar — otherwise the test proves nothing.
  const biased = [0, 0, 0, 0];
  for (let i = 0; i < 40000; i++) {
    const out = ["a", "b", "c", "d"].sort(() => Math.random() - 0.5);
    biased[out.indexOf("a")] += 1;
  }
  assert.ok(
    biased.some((c) => Math.abs(c - 10000) >= 500),
    "the sort-based shuffle is biased; if this passes the test is not measuring bias"
  );

  assert.deepEqual(shuffle([]).length, 0, "empty input is safe");
  const source = [1, 2, 3, 4, 5];
  const copy = shuffle(source);
  assert.equal(copy.length, 5, "length is preserved");
  assert.deepEqual([...copy].sort(), [1, 2, 3, 4, 5], "membership is preserved");
  assert.deepEqual(source, [1, 2, 3, 4, 5], "the input array is not mutated");
}

// ------------------------------------------------- the 4/3/3 deal
{
  const { dealQuestions, QUOTA } = await import(backend("_shared/shuffle.ts").href);
  assert.deepEqual(QUOTA, { easy: 4, medium: 3, hard: 3 }, "the mix is 4 easy, 3 medium, 3 hard");

  const pool = [];
  for (let i = 0; i < 12; i++) pool.push({ id: `e${i}`, difficulty: "easy" });
  for (let i = 0; i < 12; i++) pool.push({ id: `m${i}`, difficulty: "medium" });
  for (let i = 0; i < 12; i++) pool.push({ id: `h${i}`, difficulty: "hard" });

  const dealt = dealQuestions(pool, QUOTA);
  assert.equal(dealt.length, 10, "ten questions are dealt");
  const byTier = (t) => dealt.filter((q) => q.difficulty === t).length;
  assert.equal(byTier("easy"), 4, "four easy");
  assert.equal(byTier("medium"), 3, "three medium");
  assert.equal(byTier("hard"), 3, "three hard");
  assert.equal(new Set(dealt.map((q) => q.id)).size, 10, "no question is dealt twice");

  // Order is shuffled, not easy-then-medium-then-hard. Over 40 deals the
  // difficulty sequence must not be constant.
  const sequences = new Set();
  for (let i = 0; i < 40; i++) sequences.add(dealQuestions(pool, QUOTA).map((q) => q.difficulty).join(","));
  assert.ok(sequences.size > 5, "two students do not meet the same difficulty order");

  // A short tier backfills rather than serving fewer than ten.
  const shortPool = [
    ...pool.filter((q) => q.difficulty === "easy"),
    ...pool.filter((q) => q.difficulty === "medium"),
    { id: "h0", difficulty: "hard" }
  ];
  const backfilled = dealQuestions(shortPool, QUOTA);
  assert.equal(backfilled.length, 10, "a short hard tier still yields ten questions");
  assert.equal(backfilled.filter((q) => q.difficulty === "hard").length, 1, "it uses the one hard question available");

  // A pool smaller than the quota yields the whole pool, not a crash.
  assert.equal(dealQuestions([{ id: "x", difficulty: "easy" }], QUOTA).length, 1, "a tiny pool yields what exists");
}

// ------------------------------------------------- the deal is wired in
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /dealQuestions\(pool, QUOTA\)/, "the deal uses the 4/3/3 quota");
  assert.match(attempt, /shuffle\(optionsByQuestion\.get/, "options use the fair shuffle");
  assert.doesNotMatch(attempt, /maybeShuffle/, "the biased shuffle is gone");
  assert.doesNotMatch(attempt, /function selectQuestions/, "round-robin selection is gone");
}

// ------------------------------------------------- the room clock
{
  const {
    ANSWER_SECONDS, BREAK_SECONDS, ROUND_SECONDS, GOLDEN_SECONDS,
    CANDY_CORRECT, CANDY_GOLDEN, windowFor, roundAt, candyFor, totalSecondsFor
  } = await import(backend("_shared/rounds.ts").href);

  assert.equal(ANSWER_SECONDS, 40, "forty seconds to answer");
  assert.equal(BREAK_SECONDS, 10, "ten seconds of break");
  assert.equal(ROUND_SECONDS, 50, "a round is fifty seconds");
  assert.equal(GOLDEN_SECONDS, 20, "a golden candy needs an answer inside twenty seconds");

  const T0 = 1_700_000_000_000;

  const first = windowFor(T0, 0, 10);
  assert.equal(first.answerStart, T0, "round 0 answers from the anchor");
  assert.equal(first.answerEnd, T0 + 40_000, "round 0 stops taking answers at 40s");
  assert.equal(first.breakEnd, T0 + 50_000, "round 0 ends at 50s");

  const fifth = windowFor(T0, 4, 10);
  assert.equal(fifth.answerStart, T0 + 200_000, "round 4 starts at 200s");
  assert.equal(fifth.answerEnd, T0 + 240_000, "round 4 stops taking answers at 240s");

  assert.equal(roundAt(T0, T0, 10).index, 0, "at the anchor we are in round 0");
  assert.equal(roundAt(T0, T0, 10).phase, "answering", "and we are answering");
  assert.equal(roundAt(T0, T0 + 39_999, 10).phase, "answering", "still answering at 39.999s");
  assert.equal(roundAt(T0, T0 + 40_000, 10).phase, "break", "the break starts at 40s");
  assert.equal(roundAt(T0, T0 + 49_999, 10).phase, "break", "and runs to 49.999s");
  assert.equal(roundAt(T0, T0 + 50_000, 10).index, 1, "round 1 starts at 50s");
  assert.equal(roundAt(T0, T0 + 50_000, 10).phase, "answering", "answering again");

  // A late joiner lands on the live round, not at the start.
  const late = roundAt(T0, T0 + 265_000, 10);
  assert.equal(late.index, 5, "arriving at 4:25 lands in round 5");
  assert.equal(late.phase, "answering", "with answering still open");

  // Past the end.
  assert.equal(roundAt(T0, T0 + 500_000, 10).phase, "done", "the quiz is done after ten rounds");
  assert.equal(roundAt(T0, T0 + 499_999, 10).phase, "break", "the last break runs to the final millisecond");
  // A clock that is behind the anchor must not produce a negative round.
  assert.equal(roundAt(T0, T0 - 5_000, 10).index, 0, "before the anchor we are in round 0");

  // Candy.
  assert.equal(CANDY_CORRECT, 1, "a correct answer is one candy");
  assert.equal(CANDY_GOLDEN, 2, "correct and fast is two");
  assert.equal(candyFor({ correct: true, msIntoRound: 19_999 }), 2, "inside twenty seconds is golden");
  assert.equal(candyFor({ correct: true, msIntoRound: 20_000 }), 1, "at twenty seconds it is not");
  assert.equal(candyFor({ correct: true, msIntoRound: null }), 1, "no timestamp means no golden candy");
  assert.equal(candyFor({ correct: false, msIntoRound: 500 }), 0, "a fast wrong answer earns nothing");
  assert.equal(candyFor({ correct: false, msIntoRound: null }), 0, "an unanswered question earns nothing");

  // Whole-quiz sizing: ten rounds of fifty seconds plus the existing cushion.
  assert.equal(totalSecondsFor(10), 560, "ten rounds is 8:20 plus a 60s cushion");
  assert.equal(totalSecondsFor(0), 60, "no questions clamps to the floor");
}

{
  const classQuiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  assert.match(classQuiz, /totalSecondsFor\(/, "the instance clock is sized from the round schedule");
  assert.doesNotMatch(classQuiz, /estimateTotalSeconds\(/, "the old per-question estimate no longer sizes the quiz");
}

// ------------------------------------------------- settling a closed round
{
  const { settleAttempt } = await import(backend("_shared/settle.ts").href);
  const T0 = 1_700_000_000_000;
  const questions = [
    { id: "q0", correctOptionId: "a0" },
    { id: "q1", correctOptionId: "a1" },
    { id: "q2", correctOptionId: "a2" },
    { id: "q3", correctOptionId: "a3" }
  ];

  // Round 0 correct at 12s (golden). Round 1 wrong. Round 2 correct but at
  // 25s into its round — past golden, still in time. Round 3 correct at 8s
  // into ITS round (golden) despite being 158s after the quiz started.
  //
  // Round 3 is the point of this fixture: a settleAttempt that measured
  // "fast" from the quiz's startedAt instead of from the round's own
  // answerStart would grade q3 as a slow, non-golden answer (158s in) even
  // though it was in fact answered in the first 8 seconds of its round —
  // caught only by having a golden answer in a round other than round 0.
  // Round 2 supplies the matching case for the other direction: a mutant
  // that pays every correct answer the golden rate would overpay round 2.
  //
  // NB: the brief's draft stamped q2 at +5s, which candyFor (correctly)
  // grades as golden — that draft value contradicted its own "plain 1"
  // assertion below, so it is corrected here to +25s.
  const answers = { q0: "a0", q1: "wrong", q2: "a2", q3: "a3" };
  const answerTimes = {
    q0: T0 + 12_000,
    q1: T0 + 50_000 + 30_000,
    q2: T0 + 100_000 + 25_000,
    q3: T0 + 150_000 + 8_000
  };

  // At 130s: rounds 0 and 1 are closed, round 2 is still answering.
  const mid = settleAttempt({
    startedAt: T0, now: T0 + 130_000, questionCount: 4, questions, answers, answerTimes, settledThrough: -1
  });
  assert.equal(mid.correctCount, 1, "only round 0 was right and only rounds 0-1 are settled");
  assert.equal(mid.candy, 2, "answered correctly inside twenty seconds is a golden candy");
  assert.equal(mid.settledThrough, 1, "rounds 0 and 1 are settled");

  // At 210s every round is closed.
  const end = settleAttempt({
    startedAt: T0, now: T0 + 210_000, questionCount: 4, questions, answers, answerTimes, settledThrough: 1
  });
  assert.equal(end.correctCount, 3, "rounds 0, 2, and 3 were correct");
  assert.equal(end.candy, 5, "golden 2 (round 0) + wrong 0 (round 1) + plain 1 (round 2) + golden 2 (round 3)");
  assert.equal(end.settledThrough, 3, "all four rounds are settled");

  // Idempotent: calling again with the same clock changes nothing.
  const again = settleAttempt({
    startedAt: T0, now: T0 + 210_000, questionCount: 4, questions, answers, answerTimes, settledThrough: 3
  });
  assert.deepEqual(again, end, "settling twice is the same as settling once");

  // An answer that arrived after its round closed earns nothing.
  const late = settleAttempt({
    startedAt: T0, now: T0 + 160_000, questionCount: 4, questions,
    answers: { q0: "a0" }, answerTimes: { q0: T0 + 45_000 }, settledThrough: -1
  });
  assert.equal(late.correctCount, 0, "an answer stamped after the 40s window does not count");
  assert.equal(late.candy, 0, "and earns no candy");

  // Nothing answered at all.
  const nothing = settleAttempt({
    startedAt: T0, now: T0 + 160_000, questionCount: 4, questions, answers: {}, answerTimes: {}, settledThrough: -1
  });
  assert.equal(nothing.correctCount, 0, "no answers, no correctness");
  assert.equal(nothing.candy, 0, "no answers, no candy");
}

// ------------------------------------------------- migration 0058
// NB: the brief named this 0057_quiz_la_subida.sql, but 0057 was already
// taken by 0057_quiz_attempt_resume.sql (the same-day kick-resume hotfix,
// see docs/05-status.md "Deploy shape: migration 0057 before the two
// functions") by the time this task ran. Two files sharing one version
// number would make `supabase db push` skip the second silently, so this
// task's migration is 0058 instead.
{
  const migration = readFileSync(backendPath("supabase/migrations/0058_quiz_la_subida.sql"), "utf8");
  for (const needle of [
    "candy int not null default 0",
    "correct_count int not null default 0",
    "round_answer_times jsonb not null default",
    "settled_through int not null default -1"
  ]) {
    assert.ok(migration.includes(needle), `migration 0058 declares ${needle}`);
  }
}

// ------------------------------------------------- answer-time stamping
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /round_answer_times/, "report_progress stamps answer times");
  assert.match(attempt, /mergedAnswerTimes\[questionId\] === undefined/, "the first answer's timestamp is never overwritten");
  assert.match(attempt, /candy, correct_count, settled_through/, "the attempt row exposes the race columns");
}

console.log("verify-quiz-race passed");
