import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("..", import.meta.url);
const readinessPath = new URL("src/features/deck/bankReadiness.ts", root);
const readinessSource = await readFile(readinessPath, "utf8");
const compiled = ts.transpileModule(readinessSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const readiness = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const legacyBank = (overrides = {}) => ({
  total: 18,
  by_difficulty: { easy: 6, medium: 6, hard: 6 },
  generation_validation_profile: "legacy",
  checkpoint_preparation_state: "ready",
  checkpoint_metadata_status: "valid",
  checkpoint_coverage: [
    { candidate_count: 2 },
    { candidate_count: 2 },
    { candidate_count: 2 }
  ],
  source_pdf_mapping_status: "missing",
  content_item_id: "deck-item",
  ...overrides
});

assert.equal(readiness.questionBankReadiness(legacyBank()), "ready");
assert.equal(readiness.questionBankReadiness(legacyBank({ total: 17 })), "invalid");
assert.equal(readiness.questionBankReadiness(legacyBank({ by_difficulty: { easy: 5, medium: 6, hard: 6 } })), "invalid");
assert.equal(readiness.questionBankReadiness(legacyBank({ checkpoint_coverage: [{ candidate_count: 2 }, { candidate_count: 2 }] })), "invalid");
assert.equal(readiness.questionBankReadiness(legacyBank({ checkpoint_coverage: Array.from({ length: 6 }, () => ({ candidate_count: 2 })) })), "invalid");
assert.equal(readiness.questionBankReadiness(legacyBank({ checkpoint_coverage: [{ candidate_count: 1 }, { candidate_count: 2 }, { candidate_count: 2 }] })), "invalid");

const flexibleBank = (overrides = {}) => legacyBank({
  generation_validation_profile: "flexible",
  total: 1,
  by_difficulty: { easy: 0, medium: 1, hard: 0 },
  checkpoint_metadata_status: "missing",
  checkpoint_coverage: [],
  source_pdf_mapping_status: "valid",
  ...overrides
});
assert.equal(readiness.questionBankReadiness(flexibleBank()), "ready");
assert.equal(readiness.questionBankReadiness(flexibleBank({ total: 0 })), "invalid");
assert.equal(readiness.questionBankReadiness(flexibleBank({ source_pdf_mapping_status: "missing" })), "invalid");

assert.deepEqual(
  readiness.questionBankControlCapabilities(legacyBank({ content_item_id: null }), true),
  { prepare: false, resume: false, refresh: false }
);
assert.deepEqual(
  readiness.questionBankControlCapabilities(flexibleBank({ content_item_id: null }), true),
  { prepare: false, resume: false, refresh: false }
);
assert.deepEqual(
  readiness.questionBankControlCapabilities(legacyBank({
    checkpoint_preparation_state: "none",
    checkpoint_metadata_status: "missing",
    checkpoint_coverage: []
  }), true),
  { prepare: true, resume: false, refresh: false }
);
assert.deepEqual(
  readiness.questionBankControlCapabilities(legacyBank({
    checkpoint_preparation_state: "pending_upload"
  }), true),
  { prepare: false, resume: true, refresh: false }
);
assert.deepEqual(
  readiness.questionBankControlCapabilities(legacyBank(), true),
  { prepare: false, resume: false, refresh: true }
);

console.log("generation teaching-plan behavior verified");
