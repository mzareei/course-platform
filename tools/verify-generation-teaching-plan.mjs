import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [readiness, api, component, strings] = await Promise.all([
  read("src/features/deck/bankReadiness.ts"),
  read("src/api/checkpoints.ts"),
  read("src/components/QuestionBanks.tsx"),
  read("src/i18n/strings.ts")
]);

assert.match(readiness, /generation_validation_profile/);
assert.match(readiness, /profile === "flexible"/);
assert.match(api, /source_pdf_pages/);
assert.match(component, /content\.banks\.flexibleReady/);
assert.match(component, /content\.banks\.sourcePages/);
assert.match(strings, /"content\.banks\.flexibleReady"/);

console.log("generation teaching-plan contract verified");
