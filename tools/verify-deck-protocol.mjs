import assert from "node:assert/strict";
import {
  validateCheckpointQuestion
} from "../src/features/deck/protocol.ts";

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
console.log("verify-deck-protocol: OK");
