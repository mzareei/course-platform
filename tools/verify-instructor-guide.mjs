// Verifies the instructor guide: a five-step how-to reachable from Home, built
// from the screens' own labels so it can never name a button that was renamed.
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const keyPattern = (key) => new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:`);

const guidePath = "src/screens/instructor/Guide.tsx";
assert.ok(existsSync(path.join(root, guidePath)), "the guide screen must exist");
const guide = read(guidePath);
const app = read("src/app.tsx");
const home = read("src/screens/instructor/Home.tsx");
const strings = read("src/i18n/strings.ts");

// ------------------------------------------------------------- reachable
// A route with no link ships unreachable — the Admin tab comment in app.tsx
// records the feature that once shipped that way.
assert.match(guide, /^export function InstructorGuide\(/m, "InstructorGuide must be declared at module scope — pitfall #4");
assert.match(app, /import \{ InstructorGuide \} from "\.\/screens\/instructor\/Guide";/);
const instructorSurface = app.slice(app.indexOf("function InstructorSurface()"), app.indexOf("function Topbar()"));
assert.match(
  instructorSurface, /<Route path="\/teach\/guide" component=\{InstructorGuide\} \/>/,
  "the guide is for instructors, so its route belongs to the instructor surface"
);
assert.match(home, /href="\/teach\/guide"/, "Home must link to the guide, or no colleague can reach it");
assert.match(home, /t\("teach\.card\.guide"\)/);

// ------------------------------------------------ every step goes somewhere real
for (const href of ["/teach/people", "/teach/content?tab=import", "/teach/classes", "/teach", "/teach/grades"]) {
  assert.ok(guide.includes(`href: "${href}"`), `the guide must link a step to ${href}`);
}
for (const route of ["/teach/people", "/teach/content", "/teach/classes", "/teach", "/teach/grades"]) {
  assert.ok(instructorSurface.includes(`<Route path="${route}" `), `${route} must still be a real instructor route`);
}

// ------------------------------------------ names come from the screens themselves
// Retyping "Start class" into a guide sentence drifts the day the button is
// renamed. Passing the button's own string in keeps both in step.
for (const key of [
  "teach.nav.people", "roster.import.title",
  "teach.nav.content", "content.tab.import",
  "teach.nav.classes", "schedule.add",
  "teach.nav.home", "run.title", "run.start", "run.plan.title", "endOfClass.title", "endOfClass.start",
  "run.endClass", "nav.review", "teach.nav.grades",
  "run.pause", "run.reset.action"
]) {
  assert.ok(guide.includes(`t("${key}")`), `the guide must name ${key} through t(), so a renamed button renames the guide too`);
  assert.match(strings, keyPattern(key), `${key} must exist in the dictionary`);
}
for (const key of [
  "guide.eyebrow", "guide.title", "guide.lede", "guide.open", "guide.goodToKnow",
  ...[1, 2, 3, 4, 5].flatMap((n) => [`guide.step${n}.title`, `guide.step${n}.when`, `guide.step${n}.body`]),
  "guide.tip.pause", "guide.tip.reflection", "guide.tip.reset",
  "teach.card.guide", "teach.card.guideBody"
]) {
  assert.match(strings, keyPattern(key), `${key} must be bilingual`);
}

// ------------------------------------------------------------- the drawings
// Decoration shared by both languages and both themes.
const svgs = guide.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
assert.equal(svgs.length, 5, "one drawing per step");
for (const svg of svgs) {
  assert.match(svg, /aria-hidden="true"/, "a drawing must be hidden from screen readers — the step text carries the meaning");
  assert.doesNotMatch(svg, /<text\b/, "no words inside a drawing: they would show in one language only");
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}\b|rgb\(/, "drawing colours must come from theme tokens, or they break in dark mode");
}

console.log("verify-instructor-guide: OK");
