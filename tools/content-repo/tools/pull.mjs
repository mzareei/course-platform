// publish.mjs's missing counterpart: get a lecture OUT of production and into
// this repository so there is something to edit in the first place.
//
//   COURSE_ACCESS_TOKEN=<instructor session token> node tools/pull.mjs <slug>
//
// This never writes to production — it is read-only against
// course-content-library (list) and course-content-access +
// course-content-serve (the same gated path the app's own instructor preview
// uses to open a deck, not a storage signed URL or a service key).
//
// content_items.title/summary are English-only columns — there is no
// database source for the Spanish text content.json requires. A pull writes
// the English text into both languages and prints a warning; see
// lib/pull-metadata.mjs for the merge rule that keeps a real translation
// already on disk from ever being overwritten by that placeholder.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildPulledMetadata } from "../lib/pull-metadata.mjs";

const SUPABASE_URL = "https://ojmbupftdikwmlqvibwt.supabase.co";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(path.join(root, "course.json"), "utf8"));
const token = process.env.COURSE_ACCESS_TOKEN || "";
const slug = process.argv[2];

if (!slug) {
  console.error("Usage: COURSE_ACCESS_TOKEN=<token> node tools/pull.mjs <slug>");
  process.exit(1);
}
if (!token) {
  console.error("COURSE_ACCESS_TOKEN is required. Sign in to the app and copy your session token.");
  process.exit(1);
}

async function callFn(name, body) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${name}: ${payload.error || response.status}`);
  return payload;
}

// ---- 1. resolve the course --------------------------------------------------
const courseEntries = Object.entries(config.courses);
const [courseId, course] = courseEntries.length === 1
  ? courseEntries[0]
  : courseEntries.find(([id]) => id === process.env.COURSE_ID) || [];
if (!courseId) {
  console.error(`Multiple courses in course.json — set COURSE_ID to one of: ${courseEntries.map(([id]) => id).join(", ")}`);
  process.exit(1);
}

// ---- 2. find the item --------------------------------------------------------
const library = await callFn("course-content-library", { course_id: courseId });
const item = (library.content_items || []).find((candidate) => candidate.slug === slug);
if (!item) {
  const known = (library.content_items || []).map((candidate) => candidate.slug).sort().join(", ");
  console.error(`No content item named "${slug}" in ${courseId}.\nKnown slugs: ${known}`);
  process.exit(1);
}
if (item.can_edit === false) {
  console.error(
    `"${slug}" belongs to another instructor. Pulling it would let you overwrite their copy on publish.\n`
    + "Ask them to share it from the Content screen, then use Take a copy — that makes a version you own."
  );
  process.exit(1);
}

// ---- 3. fetch the current artifact through the real gated path -------------
const { token: contentToken } = await callFn("course-content-access", {
  action: "request_instructor_url",
  content_item_id: item.id
});
const served = await fetch(`${SUPABASE_URL}/functions/v1/course-content-serve?t=${contentToken}`);
if (!served.ok) throw new Error(`course-content-serve: ${served.status} ${await served.text()}`);
const html = await served.text();
const sha = createHash("sha256").update(html).digest("hex");

// ---- 4. merge metadata, preserving anything already authored ---------------
const itemDir = path.join(root, course.directory, "content", slug);
const metaPath = path.join(itemDir, "content.json");
const existingMeta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : null;
const { meta, warnings } = buildPulledMetadata({ item, existingMeta, sha, now: new Date().toISOString() });

// ---- 5. write ----------------------------------------------------------------
mkdirSync(itemDir, { recursive: true });
writeFileSync(path.join(itemDir, meta.entry), html);
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

console.log(`\nPulled ${slug} (${item.title}) into ${path.relative(process.cwd(), itemDir)}`);
console.log(`  ${Math.round(html.length / 1024)} KB, sha256 ${sha.slice(0, 8)}`);
for (const warning of warnings) console.log(`  ⚠ ${warning}`);
console.log(`\nEdit ${meta.entry}, then:\n  COURSE_ACCESS_TOKEN=... node tools/publish.mjs ${slug} --confirm`);
