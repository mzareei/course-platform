import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const [checkpointsApi, review] = await Promise.all([
  readFile(new URL("src/api/checkpoints.ts", root), "utf8"),
  readFile(new URL("src/components/QuestionBankReview.tsx", root), "utf8")
]);

assert.match(
  checkpointsApi,
  /suggested_slide_hint:\s*number\s*\|\s*null;/,
  "BankQuestion must expose the informal slide hint"
);
assert.match(
  checkpointsApi,
  /suggested_topic:\s*string\s*\|\s*null;/,
  "BankQuestion must expose the informal topic"
);
assert.match(
  review,
  /question\.checkpoint_after_slide !== null \? \([\s\S]{0,400}?\) : question\.suggested_slide_hint !== null \? \(/,
  "the During class pill must fall back to suggested_slide_hint when checkpoint_after_slide is unset"
);

console.log("question bank review hints verified");
