import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canPrepareCheckpoints,
  canResumeCheckpointPreparation,
  questionBankReadiness
} from "../src/features/deck/bankReadiness.ts";
import {
  checkpointQuestionMatches,
  resolveCheckpointActionSequence,
  spaceIntentForCheckpoint
} from "../src/features/live/checkpointState.ts";
import {
  instructorDeckUrl,
  shouldKeepDeckVisibleAfterRefreshFailure
} from "../src/features/deck/instructorDeckState.ts";

const sameOrigin = "https://course.example.test";
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { origin: sameOrigin }
});

const {
  DECK_PROTOCOL_VERSION,
  isDeckMessage,
  isGotoTeachingSlideMessage,
  nextRemoteTeachingSlide,
  reduceAppliedDeckRevision,
  validateCheckpointQuestion
} = await import("../src/features/deck/protocol.ts");

assert.equal(DECK_PROTOCOL_VERSION, 1);
assert.equal(
  instructorDeckUrl("fresh token", 17),
  "/content?t=fresh%20token#17",
  "token rotation must preserve the exact visible deck slide"
);
assert.equal(
  instructorDeckUrl("fresh token", null),
  "/content?t=fresh%20token",
  "the first deck load must not invent a slide hash"
);
assert.equal(
  shouldKeepDeckVisibleAfterRefreshFailure("working-token"),
  true,
  "a failed refresh must keep the already-loaded deck visible"
);

const validDeckMessages = [
  { version: 1, type: "deck.ready", slide: 1 },
  {
    version: 1,
    type: "deck.slide_changed",
    slide: 3,
    teaching_slide: 2,
    appliedRevision: 7
  },
  {
    version: 1,
    type: "deck.slide_changed",
    slide: 4,
    teaching_slide: null,
    appliedRevision: null
  },
  {
    version: 1,
    type: "deck.checkpoint_entered",
    checkpoint_key: "cia-triad",
    after_slide: 2
  },
  {
    version: 1,
    type: "deck.checkpoint_skipped",
    checkpoint_key: "cia-triad"
  },
  {
    version: 1,
    type: "deck.checkpoint_action",
    checkpoint_key: "cia-triad"
  }
];

for (const message of validDeckMessages) {
  assert.equal(
    isDeckMessage(message, sameOrigin),
    true,
    `${message.type} should pass same-origin structural validation`
  );
}

assert.equal(
  isDeckMessage(validDeckMessages[0], "https://attacker.example"),
  false,
  "deck messages from any other origin must be rejected"
);
assert.equal(
  isDeckMessage({ ...validDeckMessages[0], version: 2 }, sameOrigin),
  false,
  "unknown protocol versions must be rejected"
);
assert.equal(
  isDeckMessage({ version: 1, type: "deck.ready", slide: 1.5 }, sameOrigin),
  false,
  "slide positions must be integers"
);
for (const invalidRevision of [0, -1, 1.5, Number.NaN, "1"]) {
  assert.equal(
    isDeckMessage({
      version: 1,
      type: "deck.slide_changed",
      slide: 3,
      teaching_slide: 2,
      appliedRevision: invalidRevision
    }, sameOrigin),
    false,
    `deck acknowledgements must reject invalid revision ${String(invalidRevision)}`
  );
}
assert.equal(
  isDeckMessage({
    version: 1,
    type: "deck.slide_changed",
    slide: 3,
    teaching_slide: 2
  }, sameOrigin),
  true,
  "legacy decks must remain valid position reporters during a rolling engine upgrade"
);
assert.equal(
  reduceAppliedDeckRevision(7, {
    version: 1,
    type: "deck.slide_changed",
    slide: 3,
    teaching_slide: 2
  }),
  7,
  "a legacy position message must not erase or impersonate a remote acknowledgement"
);
assert.equal(
  reduceAppliedDeckRevision(7, {
    version: 1,
    type: "deck.slide_changed",
    slide: 4,
    teaching_slide: 3,
    appliedRevision: null
  }),
  7,
  "local navigation after a remote acknowledgement must preserve the last non-null revision"
);
assert.equal(
  reduceAppliedDeckRevision(7, {
    version: 1,
    type: "deck.slide_changed",
    slide: 5,
    teaching_slide: 4,
    appliedRevision: 9
  }),
  9,
  "a newer remote acknowledgement must replace the retained revision"
);
assert.equal(
  reduceAppliedDeckRevision(9, { version: 1, type: "deck.ready", slide: 1 }),
  null,
  "a newly ready iframe must reset the acknowledgement lifecycle"
);
assert.equal(nextRemoteTeachingSlide(5, 5), 5);
assert.equal(
  nextRemoteTeachingSlide(5, 10),
  6,
  "Task 6 can request the current boundary before advancing to the next teaching slide"
);
assert.equal(
  isGotoTeachingSlideMessage({
    type: "course-platform:goto-slide",
    teachingSlide: 11,
    revision: 4
  }),
  true,
  "the remote navigation command must accept a positive teaching slide and revision"
);
for (const invalid of [
  { type: "course-platform:goto-slide", teachingSlide: 0, revision: 4 },
  { type: "course-platform:goto-slide", teachingSlide: 11.5, revision: 4 },
  { type: "course-platform:goto-slide", teachingSlide: 11, revision: 0 },
  { type: "course-platform:goto-slide", teachingSlide: 11, revision: 4.5 },
  { type: "course-platform:goto-slide", teachingSlide: 11, revision: 4, extra: true },
  { version: 1, type: "course-platform:goto-slide", teachingSlide: 11, revision: 4 }
]) {
  assert.equal(
    isGotoTeachingSlideMessage(invalid),
    false,
    "malformed or non-exact remote navigation commands must fail closed"
  );
}
assert.equal(
  isDeckMessage({
    version: 1,
    type: "deck.checkpoint_entered",
    after_slide: 2
  }, sameOrigin),
  false,
  "checkpoint messages must carry a key"
);
assert.equal(
  isDeckMessage({
    version: 1,
    type: "deck.checkpoint_skipped",
    checkpoint_key: ""
  }, sameOrigin),
  false,
  "checkpoint keys must not be empty"
);
assert.equal(
  isDeckMessage({
    version: 1,
    type: "deck.checkpoint_action"
  }, sameOrigin),
  false,
  "checkpoint action intents must carry a key"
);
assert.equal(
  isDeckMessage({
    ...validDeckMessages[0],
    execute() {}
  }, sameOrigin),
  false,
  "additional executable values must be rejected"
);
const hiddenExecutableMessage = { ...validDeckMessages[0] };
Object.defineProperty(hiddenExecutableMessage, "execute", {
  enumerable: false,
  value() {}
});
assert.equal(
  isDeckMessage(hiddenExecutableMessage, sameOrigin),
  false,
  "hidden executable values must be rejected"
);
const hiddenUnknownMessage = { ...validDeckMessages[0] };
Object.defineProperty(hiddenUnknownMessage, "internal", {
  enumerable: false,
  value: "unexpected"
});
assert.equal(
  isDeckMessage(hiddenUnknownMessage, sameOrigin),
  false,
  "hidden unknown values must be rejected"
);
let getterExecuted = false;
const accessorMessage = {
  version: 1,
  get type() {
    getterExecuted = true;
    return "deck.ready";
  },
  slide: 1
};
assert.equal(
  isDeckMessage(accessorMessage, sameOrigin),
  false,
  "executable accessors must be rejected"
);
assert.equal(
  getterExecuted,
  false,
  "message validation must not execute accessors"
);
assert.equal(
  isDeckMessage({ version: 1, type: "deck.unknown", slide: 1 }, sameOrigin),
  false,
  "unknown message types must be rejected"
);

const valid = {
  segment_key: "cia-triad",
  source_slide_numbers: [12, 13, 14, 15],
  source_slide_start: 12,
  source_slide_end: 15,
  checkpoint_after_slide: 15
};
assert.deepEqual(validateCheckpointQuestion(valid), []);
assert.match(
  validateCheckpointQuestion({ ...valid, source_slide_end: 16 })[0],
  /after its checkpoint/
);
assert.match(
  validateCheckpointQuestion({ ...valid, source_slide_numbers: [] })[0],
  /source slide/
);

const balanced = {
  total: 18,
  by_difficulty: { easy: 6, medium: 6, hard: 6 }
};
const coverage = [5, 10, 15].map((slide) => ({
  segment_key: `segment-${slide}`,
  checkpoint_after_slide: slide,
  candidate_count: 6,
  difficulties: ["easy", "medium", "hard"]
}));
const legacyBank = {
  ...balanced,
  checkpoint_preparation_state: "none",
  checkpoint_metadata_status: "missing",
  checkpoint_coverage: []
};
const readyBank = {
  ...balanced,
  checkpoint_preparation_state: "none",
  checkpoint_metadata_status: "valid",
  checkpoint_coverage: coverage
};
const pendingBank = {
  ...readyBank,
  checkpoint_preparation_state: "pending_upload"
};
const invalidBank = {
  ...balanced,
  checkpoint_preparation_state: "none",
  checkpoint_metadata_status: "invalid",
  checkpoint_coverage: []
};

assert.equal(questionBankReadiness(legacyBank), "legacy");
assert.equal(canPrepareCheckpoints(legacyBank), true);
assert.equal(canResumeCheckpointPreparation(legacyBank), false);
assert.equal(questionBankReadiness(readyBank), "ready");
assert.equal(canPrepareCheckpoints(readyBank), false);
assert.equal(canResumeCheckpointPreparation(readyBank), false);
assert.equal(questionBankReadiness(pendingBank), "pending");
assert.equal(canPrepareCheckpoints(pendingBank), false);
assert.equal(canResumeCheckpointPreparation(pendingBank), true);
assert.equal(
  questionBankReadiness({
    ...pendingBank,
    checkpoint_metadata_status: "invalid",
    checkpoint_coverage: []
  }),
  "invalid",
  "a corrupt pending bank must fail closed instead of exposing Resume"
);
assert.equal(questionBankReadiness(invalidBank), "invalid");
assert.equal(canPrepareCheckpoints(invalidBank), false);
assert.equal(canResumeCheckpointPreparation(invalidBank), false);

const checkpointQuestion = {
  question_id: "question-one",
  generation_key: "cia-triad-easy",
  difficulty: "easy",
  segment_key: "cia-triad",
  source_slide_numbers: [1, 2],
  source_slide_start: 1,
  source_slide_end: 2,
  checkpoint_after_slide: 2,
  prompt: "Which property prevents unauthorized disclosure?",
  prompt_es: "¿Qué propiedad evita la divulgación no autorizada?",
  explanation: null,
  explanation_es: null,
  options: []
};
assert.equal(
  checkpointQuestionMatches({ key: "cia-triad", afterSlide: 2 }, checkpointQuestion),
  true
);
assert.equal(
  checkpointQuestionMatches({ key: "cia-triad-2", afterSlide: 2 }, checkpointQuestion),
  true,
  "repeated authored segment keys may include their checkpoint slide suffix"
);
assert.equal(
  checkpointQuestionMatches({ key: "cia-triad", afterSlide: 3 }, checkpointQuestion),
  false,
  "a question from a different slide checkpoint must never be sendable"
);
assert.equal(
  checkpointQuestionMatches({ key: "different-segment", afterSlide: 2 }, checkpointQuestion),
  false,
  "a question from a different concept segment must never be sendable"
);
assert.equal(
  spaceIntentForCheckpoint({ type: "ready", question: checkpointQuestion }),
  "send",
  "Space sends only a prepared checkpoint question"
);
assert.equal(
  spaceIntentForCheckpoint({
    type: "open",
    round: { round_id: "round-one" },
    results: null
  }),
  "reveal",
  "Space reveals only the currently open round"
);
for (const state of [
  { type: "idle" },
  { type: "loading", checkpoint: 2 },
  {
    type: "revealed",
    round: { round_id: "round-one" },
    results: { round_id: "round-one" }
  },
  { type: "error", checkpoint: 2, message: "No question ready" }
]) {
  assert.equal(
    spaceIntentForCheckpoint(state),
    null,
    `Space must have no implicit action from ${state.type}`
  );
}
assert.deepEqual(
  resolveCheckpointActionSequence(4, null),
  { sequence: 0, shouldHandle: false },
  "a reloaded deck resets the parent action sequence"
);
assert.deepEqual(
  resolveCheckpointActionSequence(0, { key: "cia-triad", sequence: 1 }),
  { sequence: 1, shouldHandle: true }
);
assert.deepEqual(
  resolveCheckpointActionSequence(1, { key: "cia-triad", sequence: 1 }),
  { sequence: 1, shouldHandle: false },
  "a duplicate action sequence must remain a no-op"
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bankUiSource = readFileSync(
  path.join(root, "src/components/QuestionBanks.tsx"),
  "utf8"
);
assert.match(
  bankUiSource,
  /activeRoles\.value\.some\(\(role\) =>\s*role === "platform_owner" \|\| role === "instructor"/,
  "teaching assistants must not receive an enabled instructor-only preparation action"
);
assert.match(
  bankUiSource,
  /questionBankControlCapabilities\(bank, instructorCanPrepare\)/,
  "the card must use the shared capability gate for Resume and other deck-only actions"
);
assert.match(
  bankUiSource,
  /t\("content\.banks\.(?:resume|retry)"\)/,
  "the pending bank action must use bilingual Resume/Retry copy"
);
assert.match(
  bankUiSource,
  /await onRefresh\(\)/,
  "the card must refresh durable state after a failed upload or finalization"
);
const checkpointApiSource = readFileSync(
  path.join(root, "src/api/checkpoints.ts"),
  "utf8"
);
assert.match(
  checkpointApiSource,
  /checkpoint_preparation_state:\s*"none" \| "pending_upload" \| "ready"/,
  "the frontend contract must model the durable preparation state"
);
const hookSource = readFileSync(
  path.join(root, "src/features/deck/useDeckBridge.ts"),
  "utf8"
);
assert.match(
  hookSource,
  /event\.source !== deckWindow/,
  "the parent bridge must accept messages only from its own iframe"
);
assert.match(
  hookSource,
  /window\.addEventListener\("message", receive\)/,
  "the parent bridge must own one message listener"
);
assert.match(
  hookSource,
  /window\.removeEventListener\("message", receive\)/,
  "the parent bridge must remove its message listener"
);
assert.match(
  hookSource,
  /deckWindow\.postMessage\(message, window\.location\.origin\)/,
  "parent-to-deck messages must target the app origin only"
);
assert.match(
  hookSource,
  /goToTeachingSlide/,
  "the parent bridge must expose remote teaching-slide navigation"
);
assert.match(
  hookSource,
  /type:\s*"course-platform:goto-slide"/,
  "remote navigation must use the shared parent command"
);
assert.match(
  hookSource,
  /isPositiveInteger\(teachingSlide\)[\s\S]*isPositiveInteger\(revision\)/,
  "the parent bridge must fail closed before posting invalid slide or revision numbers"
);
assert.match(
  hookSource,
  /setAppliedRevision\(\(current\) => reduceAppliedDeckRevision\(current, message\)\)/,
  "the parent bridge acknowledgement lifecycle must use the executable reducer"
);
assert.match(
  hookSource,
  /case "deck\.checkpoint_action":/,
  "the parent hook must consume checkpoint action intents"
);
assert.match(
  hookSource,
  /checkpointAction,/,
  "the parent hook must expose checkpoint action intents"
);
assert.match(
  hookSource,
  /setBridgeError\(t\("deck\.bridgeInvalid"\)\)/,
  "invalid bridge messages must use bilingual app copy"
);
assert.match(
  hookSource,
  /setBridgeError\(t\("deck\.bridgeUnavailable"\)\)/,
  "unavailable bridge errors must use bilingual app copy"
);
assert.doesNotMatch(
  hookSource,
  /setBridgeError\("[A-Z]/,
  "the deck bridge must not return hardcoded English errors"
);
console.log("verify-deck-protocol: OK");
