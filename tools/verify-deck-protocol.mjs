import assert from "node:assert/strict";
import {
  validateCheckpointQuestion
} from "../src/features/deck/protocol.ts";
import {
  canPrepareCheckpoints,
  questionBankReadiness
} from "../src/features/deck/bankReadiness.ts";

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
console.log("verify-deck-protocol: OK");
