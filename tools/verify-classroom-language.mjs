import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const layer = await readFile(new URL("src/features/live/ClassroomQuestionLayer.tsx", root), "utf8");

assert.match(
  layer,
  /import \{ lang, t \} from "\.\.\/\.\.\/i18n"/,
  "the audience layer must read the app language signal"
);
assert.match(
  layer,
  /const useSpanish = lang\.value === "es"/,
  "the audience layer must derive useSpanish from the language signal"
);
assert.match(
  layer,
  /\(useSpanish && round\.text_es\) \|\| round\.text/,
  "the prompt must render exactly one language"
);
assert.match(
  layer,
  /\(useSpanish && option\.text_es\) \|\| option\.text/,
  "each option must render exactly one language"
);
assert.doesNotMatch(
  layer,
  /classroom-question-es/,
  "the stacked Spanish prompt element must be gone — both languages must never render together"
);
assert.doesNotMatch(
  layer,
  /classroom-question-option-es/,
  "the stacked Spanish option element must be gone"
);

console.log("classroom audience language verified");
