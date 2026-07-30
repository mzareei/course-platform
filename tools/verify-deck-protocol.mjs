import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canPrepareCheckpoints,
  questionBankReadiness
} from "../src/features/deck/bankReadiness.ts";

const sameOrigin = "https://course.example.test";
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { origin: sameOrigin }
});

const {
  DECK_PROTOCOL_VERSION,
  isDeckMessage,
  validateCheckpointQuestion
} = await import("../src/features/deck/protocol.ts");

assert.equal(DECK_PROTOCOL_VERSION, 1);

const validDeckMessages = [
  { version: 1, type: "deck.ready", slide: 1 },
  {
    version: 1,
    type: "deck.slide_changed",
    slide: 3,
    teaching_slide: 2
  },
  {
    version: 1,
    type: "deck.slide_changed",
    slide: 4,
    teaching_slide: null
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
  checkpoint_metadata_status: "missing",
  checkpoint_coverage: []
};
const readyBank = {
  ...balanced,
  checkpoint_metadata_status: "valid",
  checkpoint_coverage: coverage
};
const invalidBank = {
  ...balanced,
  checkpoint_metadata_status: "invalid",
  checkpoint_coverage: []
};

assert.equal(questionBankReadiness(legacyBank), "legacy");
assert.equal(canPrepareCheckpoints(legacyBank), true);
assert.equal(questionBankReadiness(readyBank), "ready");
assert.equal(canPrepareCheckpoints(readyBank), false);
assert.equal(questionBankReadiness(invalidBank), "invalid");
assert.equal(canPrepareCheckpoints(invalidBank), false);

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
