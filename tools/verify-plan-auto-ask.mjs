// The professor lectures from the deck in fullscreen. A planned poll must send
// itself when its slide comes up — and must never send itself twice, never send
// one he already asked, and never sit silent when the deck cannot report where
// it is. These are the rules that make that safe.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deckCannotReportSlides,
  planCheckpointForSlide,
  shouldAutoAskPlanCheckpoint
} from "../src/features/live/planAutoAsk.ts";

function checkpoint(overrides = {}) {
  return {
    id: "checkpoint-a",
    position: 1,
    topic: "CIA triad",
    slide_hint: 40,
    notes: null,
    state: "planned",
    candidate_question_ids: ["question-a"],
    ...overrides
  };
}

// ------------------------------------------------- matching a slide to a poll
const plan = [
  checkpoint({ id: "poll-1", position: 1, slide_hint: 15 }),
  checkpoint({ id: "poll-6", position: 6, slide_hint: 40 }),
  checkpoint({ id: "poll-7", position: 7, slide_hint: null })
];

assert.equal(
  planCheckpointForSlide(plan, { slide: 40, teachingSlide: null })?.id,
  "poll-6",
  "reaching a planned poll's slide must select that poll"
);
// Measured on the real Week 1 deck: DOM slide 40 reports teaching_slide 37.
// The hint is read off the deck's counter, so only the counter may match — the
// alternative fires the poll three slides early on the deck he actually uses.
assert.equal(
  planCheckpointForSlide(plan, { slide: 37, teachingSlide: 34 }),
  null,
  "a slide whose teaching number happens to equal a later hint must not fire"
);
assert.equal(
  planCheckpointForSlide(plan, { slide: 40, teachingSlide: 37 })?.id,
  "poll-6",
  "the counter the professor reads is what a hint of 40 means"
);
assert.equal(
  planCheckpointForSlide(plan, { slide: null, teachingSlide: 40 })?.id,
  "poll-6",
  "the teaching number is a fallback only when there is no counter value"
);
assert.equal(
  planCheckpointForSlide(plan, { slide: 41, teachingSlide: 39 }),
  null,
  "a slide with no planned poll must select nothing"
);
assert.equal(
  planCheckpointForSlide(plan, { slide: null, teachingSlide: null }),
  null,
  "a deck that has not reported a position must select nothing"
);
assert.equal(
  planCheckpointForSlide(
    [checkpoint({ id: "already", state: "sent", slide_hint: 40 })],
    { slide: 40, teachingSlide: null }
  ),
  null,
  "paging back over an already-asked poll must not select it again"
);
assert.equal(
  planCheckpointForSlide(
    [checkpoint({ id: "skipped", state: "skipped", slide_hint: 40 })],
    { slide: 40, teachingSlide: null }
  ),
  null,
  "a poll the professor deliberately skipped must stay skipped"
);
assert.equal(
  planCheckpointForSlide(
    [
      checkpoint({ id: "later", position: 9, slide_hint: 40 }),
      checkpoint({ id: "earlier", position: 2, slide_hint: 40 })
    ],
    { slide: 40, teachingSlide: null }
  )?.id,
  "earlier",
  "two polls on one slide must resolve by plan order, not array order"
);
assert.equal(
  planCheckpointForSlide(plan, { slide: 0, teachingSlide: null }),
  null,
  "slide zero must not match a null hint through falsy comparison"
);

// ------------------------------------------------------- the send decision
const armed = {
  enabled: true,
  isLive: true,
  questionId: "question-a",
  alreadyAsked: false
};
assert.equal(
  shouldAutoAskPlanCheckpoint(armed),
  true,
  "an armed, live, candidate-backed poll must send itself"
);
for (const [reason, override] of [
  ["the professor turned auto-send off", { enabled: false }],
  ["the class is not live", { isLive: false }],
  ["the checkpoint has no candidate question chosen", { questionId: "" }],
  ["this poll already sent itself once", { alreadyAsked: true }]
]) {
  assert.equal(
    shouldAutoAskPlanCheckpoint({ ...armed, ...override }),
    false,
    `auto-ask must fail closed when ${reason}`
  );
}

// --------------------------------------------- a deck that cannot report at all
assert.equal(
  deckCannotReportSlides({
    enabled: true,
    deckReady: false,
    position: { slide: null, teachingSlide: null },
    checkpoints: plan
  }),
  true,
  "a slide-keyed plan behind a silent deck must be called out, not left waiting"
);
assert.equal(
  deckCannotReportSlides({
    enabled: true,
    deckReady: true,
    position: { slide: 12, teachingSlide: null },
    checkpoints: plan
  }),
  false,
  "a deck that reports its position is working"
);
assert.equal(
  deckCannotReportSlides({
    enabled: true,
    deckReady: false,
    position: { slide: null, teachingSlide: null },
    checkpoints: [checkpoint({ slide_hint: null })]
  }),
  false,
  "a plan with no slide hints is not waiting on the deck for anything"
);
assert.equal(
  deckCannotReportSlides({
    enabled: false,
    deckReady: false,
    position: { slide: null, teachingSlide: null },
    checkpoints: plan
  }),
  false,
  "nothing is broken when the professor sends by hand on purpose"
);

// ------------------------------------- walking a lecture the way a class runs
//
// Replays the board's latch-then-push sequence over a realistic slide walk,
// including the two moves that break naive implementations: paging back over a
// poll already asked, and re-entering a slide after the plan says "sent".
{
  const lecture = [
    { id: "poll-1", position: 1, slide_hint: 15, state: "planned", candidate_question_ids: ["q1"], topic: "CIA", notes: null },
    { id: "poll-6", position: 6, slide_hint: 40, state: "planned", candidate_question_ids: ["q6"], topic: "Policy", notes: null }
  ];
  const asked = [];
  const latch = new Set();

  // The board pushes, then the server marks the checkpoint sent and the plan
  // refreshes. Model both, or the test proves less than the real thing.
  function arriveAt(slide) {
    const checkpoint = planCheckpointForSlide(lecture, { slide, teachingSlide: null });
    if (!checkpoint) return;
    const questionId = checkpoint.candidate_question_ids[0] || "";
    if (!shouldAutoAskPlanCheckpoint({
      enabled: true,
      isLive: true,
      questionId,
      alreadyAsked: latch.has(checkpoint.id)
    })) return;
    latch.add(checkpoint.id);
    asked.push({ id: checkpoint.id, questionId, slide });
    const sent = lecture.find((entry) => entry.id === checkpoint.id);
    sent.state = "sent";
  }

  // 14 → 15 (poll 1 fires) → 16 (checkpoint slide) → back to 15 → forward again
  // → 39 → 40 (poll 6 fires) → back to 40 once more.
  [14, 15, 16, 15, 16, 39, 40, 41, 40].forEach(arriveAt);

  assert.deepEqual(
    asked,
    [
      { id: "poll-1", questionId: "q1", slide: 15 },
      { id: "poll-6", questionId: "q6", slide: 40 }
    ],
    "each planned poll must send itself exactly once, on its own slide, in order"
  );
  assert.equal(
    asked.filter((entry) => entry.id === "poll-1").length,
    1,
    "paging back over a poll already asked must not ask it a second time"
  );
}

// ------------------------------------------------------------------- wiring
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const boardSource = readFileSync(
  path.join(root, "src/components/ClassQuestionPlanBoard.tsx"),
  "utf8"
);
assert.match(
  boardSource,
  /autoAskedCheckpoints\.current\.add\(checkpoint\.id\)/,
  "the board must latch a poll before awaiting its push, so a re-render cannot double-send"
);
assert.match(
  boardSource,
  /planCheckpointForSlide\(/,
  "the board must resolve the poll from the deck's reported slide"
);
assert.match(
  boardSource,
  /void handleAskNow\(/,
  "an automatic ask must go through the same path as the Ask now button"
);
assert.match(
  boardSource,
  /t\("run\.plan\.deckSilent"\)/,
  "a deck that cannot report its slide must say so in both languages"
);

const runClassSource = readFileSync(
  path.join(root, "src/screens/instructor/RunClass.tsx"),
  "utf8"
);
assert.match(
  runClassSource,
  /deckSlide=\{bridge\.slide\}/,
  "Run Class must feed the plan board the deck's reported slide"
);
assert.match(
  runClassSource,
  /deckTeachingSlide=\{bridge\.teachingSlide\}/,
  "Run Class must feed the plan board the authored teaching slide too"
);

console.log("verify-plan-auto-ask: OK");

// Two polls may legitimately share a slide. Sending the first refreshes the
// plan and re-runs the effect against the same slide; without an arrival latch
// the second lands on the phones a second later.
assert.match(
  boardSource,
  /if \(lastAskedArrival\.current === slideArrival\.current\) return;/,
  "only one poll may send itself per arrival at a slide"
);
assert.match(
  boardSource,
  /lastAskedArrival\.current = slideArrival\.current;\s*\n\s*void handleAskNow\(/,
  "the arrival must be latched before the push, not after it resolves"
);
assert.match(
  boardSource,
  /slideArrival\.current \+= 1;\s*\n\s*\}, \[deckSlide, deckTeachingSlide\]\)/,
  "arriving at a new slide must re-arm the automatic ask"
);
