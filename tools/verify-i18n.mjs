// Verifies the bilingual contract: every string exists in both languages, no
// pair is a copy-paste placeholder, and screens don't smuggle in hardcoded
// English. A professor who works in Spanish should never hit an English label.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

for (const rel of ["src/i18n/strings.ts", "src/i18n/index.ts", "src/components/LanguageToggle.tsx"]) {
  if (!existsSync(path.join(root, rel))) failures.push(`Missing file: ${rel}`);
}
if (failures.length) {
  console.error("i18n verification failed:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

// ---------------------------------------------------------------- dictionary
const source = read("src/i18n/strings.ts");

// Each entry is  "key": ["english", "spanish"],  possibly across lines.
const entryPattern = /"([\w.]+)"\s*:\s*\[\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*\]/g;
const entries = [...source.matchAll(entryPattern)];
if (entries.length < 50) {
  failures.push(`Only parsed ${entries.length} dictionary entries — the format may have changed`);
}

const seen = new Set();
// Terms that are legitimately identical in both languages.
const allowedIdentical = new Set([
  "app.switchToSpanish",
  "app.switchToEnglish",
  "people.col.id",
  "type.material",
  "state.live",
  "pinata.burst",
  "pinata.porra"
]);

for (const [, key, en, es] of entries) {
  if (seen.has(key)) failures.push(`Duplicate key: ${key}`);
  seen.add(key);

  const english = JSON.parse(en);
  const spanish = JSON.parse(es);

  if (!english.trim()) failures.push(`${key}: English text is empty`);
  if (!spanish.trim()) failures.push(`${key}: Spanish text is empty`);
  if (english === spanish && !allowedIdentical.has(key)) {
    failures.push(`${key}: Spanish is identical to English — likely untranslated`);
  }

  // Placeholders must survive translation or the sentence breaks at runtime.
  const holders = (text) => (text.match(/\{(\w+)\}/g) || []).sort().join(",");
  if (holders(english) !== holders(spanish)) {
    failures.push(`${key}: placeholders differ (en "${holders(english)}" vs es "${holders(spanish)}")`);
  }
}

// ---------------------------------------------------------------- screens
// Every screen and shared component must go through t(); a bare English
// sentence in JSX would never translate.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...walk(rel));
    else if (entry.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

const componentFiles = [...walk("src/screens"), ...walk("src/components"), ...walk("src/features")];
const englishWords = /\b(the|your|you|and|with|from|this|that|when|professor|student|class|course)\b/i;

for (const rel of componentFiles) {
  const text = read(rel);

  // JSX text nodes: >Some sentence<
  for (const match of text.matchAll(/>\s*([A-Za-z][^<>{}\n]{12,})\s*</g)) {
    const candidate = match[1].trim();
    if (englishWords.test(candidate)) {
      failures.push(`${rel}: untranslated JSX text "${candidate.slice(0, 48)}"`);
    }
  }

  // Attributes users read.
  for (const match of text.matchAll(/(placeholder|title|aria-label)="([^"{}]{12,})"/g)) {
    if (englishWords.test(match[2])) {
      failures.push(`${rel}: untranslated ${match[1]} "${match[2].slice(0, 48)}"`);
    }
  }

  if (/\bt\(/.test(text) && !/from "(\.\.\/)+i18n"/.test(text)) {
    failures.push(`${rel}: uses t() without importing it from the i18n module`);
  }
}

// ---------------------------------------------------------------- deck sync
const i18n = read("src/i18n/index.ts");
if (!i18n.includes("tc-lang")) {
  failures.push("src/i18n/index.ts must mirror the choice to tc-lang so lecture decks match the app");
}
if (!/navigator\.language/.test(i18n)) {
  failures.push("src/i18n/index.ts should fall back to the browser language on first visit");
}

if (failures.length) {
  console.error("i18n verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`verify-i18n: OK (${entries.length} strings, both languages)`);
