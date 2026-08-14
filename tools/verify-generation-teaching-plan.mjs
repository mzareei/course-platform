import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readinessPath = new URL("src/features/deck/bankReadiness.ts", root);
const readinessSource = await readFile(readinessPath, "utf8");
const compiled = ts.transpileModule(readinessSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const readiness = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const [generationApi, content, strings, briefForm] = await Promise.all([
  read("src/api/generation.ts"),
  read("src/screens/instructor/Content.tsx"),
  read("src/i18n/strings.ts"),
  read("src/components/GenerationBriefForm.tsx")
]);
const compiledGeneration = ts.transpileModule(
  generationApi.replace(
    'import { callFn } from "./client";',
    "const callFn = (...args) => globalThis.__generationCall(...args);"
  ),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
).outputText;
const generation = await import(`data:text/javascript;base64,${Buffer.from(compiledGeneration).toString("base64")}`);

assert.match(generationApi, /export type TeachingBrief/);
assert.match(generationApi, /reviewPlan\(jobId/);
assert.match(generationApi, /approvePlan\(input/);
assert.match(content, /GenerationBriefForm/);
assert.match(content, /GenerationPlanReview/);
assert.match(strings, /"content\.plan\.approve"/);
assert.match(strings, /"content\.mode\.bankOnly"/);
assert.equal(generation.isGenerationInFlight("ready_for_plan_review"), false);
assert.equal(generation.hasGenerationProgress("ready_for_plan_review"), true);
const listedJob = {
  id: "job-list-1",
  generation_mode: "bank_only",
  status: "ready_for_review",
  lecture_title: "Bank-only PDF",
  lecture_slug: "bank-only-pdf",
  created_at: "2026-08-09T00:00:00.000Z"
};
globalThis.__generationCall = async () => ({ jobs: [listedJob] });
assert.equal((await generation.listJobs()).jobs[0].generation_mode, "bank_only");
globalThis.__generationCall = async () => ({
  jobs: [{ ...listedJob, generation_mode: undefined }]
});
await assert.rejects(
  generation.listJobs(),
  /missing a valid generation mode/,
  "list_jobs payloads without generation_mode must not reach the review UI"
);
assert.deepEqual(generation.generationReviewCapabilities("bank_only"), {
  showsDeck: false,
  requestsDeckPreview: false,
  showsCheckpointMappings: false,
  createsDraftRelease: false
});
assert.deepEqual(generation.generationReviewCapabilities("deck_and_bank"), {
  showsDeck: true,
  requestsDeckPreview: true,
  showsCheckpointMappings: true,
  createsDraftRelease: true
});
assert.match(strings, /"content\.status\.grounding"/);
assert.match(generationApi, /generation_mode: GenerationMode/);
assert.match(content, /generationReviewCapabilities/);
assert.match(briefForm, /if \(!submitted\) return;/);
assert.match(content, /onReview: \(job: GenerationJob\) => void/);
assert.match(content, /onReview=\{\(\) => setReviewing\(job\)\}/);
assert.match(content, /generationMode=\{reviewing\.generation_mode\}/);
assert.match(content, /const reviewCapabilities = generationReviewCapabilities\(generationMode\)/);
assert.match(content, /if \(!reviewCapabilities\.requestsDeckPreview\) return;/);
assert.match(content, /reviewCapabilities\.showsCheckpointMappings \? \(/);
assert.doesNotMatch(content, /generationReviewCapabilities\(bundle\.job\.generation_mode\)/);

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
// A bank with real PDF pages and a broken mapping is genuinely wrong…
assert.equal(
  readiness.questionBankReadiness(
    flexibleBank({ source_pdf_mapping_status: "missing", source_pdf_pages: [3, 4] })
  ),
  "invalid"
);
// …but an imported bank never had a PDF, and must not be flagged for it.
assert.equal(
  readiness.questionBankReadiness(
    flexibleBank({ source_pdf_mapping_status: "missing", source_pdf_pages: [] })
  ),
  "ready"
);

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
