// The validation gate. Runs in CI on every pull request, and again inside
// publish before anything is written.
//
// The rule that earns this file's existence: **zero references to the course's
// own public origin.** Phase 2 deliberately rewrote every relative link in a
// deck to an absolute public URL so cross-navigation would keep working while
// the public copies existed. The result was that nine of the twelve missions
// linked to the public copy of their own lecture, so a student inside the
// gated viewer was one click outside it. Nobody noticed for months because
// nothing errors — the links simply work, and take the student somewhere they
// should not be able to reach.
//
// A review habit would not have caught that. A validator does.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const CONTENT_TYPES = [
  "lecture", "mission", "quiz_bank", "activity",
  "exit_ticket", "portfolio", "resource", "case_file"
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Every href/src in the document, with the tag it came from. */
function references(html) {
  return [...html.matchAll(/(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
    .map((match) => String(match[1] ?? match[2] ?? "").trim())
    .filter(Boolean);
}

function hostOf(reference) {
  if (/^(?:data|mailto|tel):/i.test(reference)) return null;
  if (reference.startsWith("#")) return null;
  if (!/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(reference)) return "";  // relative
  try {
    return new URL(reference, "https://placeholder.invalid/").hostname.toLowerCase();
  } catch {
    return "invalid";
  }
}

export function validateItem(itemDir, config) {
  const failures = [];
  const slug = path.basename(itemDir);
  const fail = (message) => failures.push(`${slug}: ${message}`);

  const metaPath = path.join(itemDir, "content.json");
  if (!existsSync(metaPath)) {
    fail("content.json is missing");
    return failures;
  }

  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, "utf8"));
  } catch (error) {
    fail(`content.json is not valid JSON (${error.message})`);
    return failures;
  }

  // --- identity ------------------------------------------------------------
  // The directory name is the slug is the storage prefix is the database key.
  // One fact, and the tools must never have to infer it.
  if (meta.slug !== slug) fail(`content.json slug "${meta.slug}" does not match the directory name`);
  if (!CONTENT_TYPES.includes(meta.content_type)) fail(`content_type "${meta.content_type}" is not a known type`);
  if (meta.content_item_id && !UUID.test(meta.content_item_id)) fail("content_item_id is not a valid uuid");
  if (meta.variant != null && meta.variant !== "bridge") fail(`variant "${meta.variant}" is not recognised`);

  // Two writers put two filenames in this bucket historically, and production
  // is the only authority on which one an item uses. Never derive it.
  if (!meta.storage_filename) fail("storage_filename is required — it is read from production, never derived");

  // --- bilingual -----------------------------------------------------------
  // Every user-facing string is EN + ES. A missing Spanish title is a build
  // failure here for the same reason it is in the app.
  for (const field of ["title"]) {
    if (!meta[field]?.en?.trim()) fail(`${field}.en is required`);
    if (!meta[field]?.es?.trim()) fail(`${field}.es is required`);
  }
  if (meta.title?.en && meta.title.en.length > 180) fail("title.en exceeds the 180-character column limit");
  if (meta.title?.es && meta.title.es.length > 180) fail("title.es exceeds the 180-character column limit");
  if (meta.summary && (Boolean(meta.summary.en) !== Boolean(meta.summary.es))) {
    fail("summary must be present in both languages or neither");
  }

  // --- the artifact --------------------------------------------------------
  const entry = meta.entry || "index.html";
  const entryPath = path.join(itemDir, entry);
  if (!existsSync(entryPath)) {
    fail(`entry file ${entry} is missing`);
    return failures;
  }
  const html = readFileSync(entryPath, "utf8");

  if (!/<title>[^<]+<\/title>/i.test(html)) fail("the document has no <title>");

  const declared = new Set([
    ...(config.allowed_external_hosts || []),
    ...(meta.external_links || []).map((link) => {
      try { return new URL(link).hostname.toLowerCase(); } catch { return link; }
    })
  ]);
  const forbidden = new Set(config.forbidden_hosts || []);

  for (const reference of references(html)) {
    const host = hostOf(reference);
    if (host === null) continue;                 // data:, mailto:, fragment
    if (host === "invalid") { fail(`unparseable reference ${reference}`); continue; }

    if (host === "") {
      // Relative. The published artifact is a single self-contained file, so a
      // surviving relative reference means an asset that was not inlined —
      // it would 404 from behind the gate, where there is no sibling to find.
      fail(`relative reference ${reference} survived — the artifact must be self-contained`);
      continue;
    }
    if (forbidden.has(host)) {
      fail(`links to ${host} (${reference}) — a link from inside the gate to the ungated copy`);
      continue;
    }
    if (!declared.has(host)) {
      fail(`links to undeclared host ${host} (${reference}) — declare it in content.json external_links`);
    }
  }

  // --- version bookkeeping -------------------------------------------------
  if (meta.version && typeof meta.version.current !== "number") {
    fail("version.current must be a number");
  }
  if (meta.history && !Array.isArray(meta.history)) fail("history must be an array");

  return failures;
}

export function validateCourse(courseDir, config) {
  const contentDir = path.join(courseDir, "content");
  if (!existsSync(contentDir)) return [`${courseDir}: no content/ directory`];
  const failures = [];
  for (const entry of readdirSync(contentDir).sort()) {
    const itemDir = path.join(contentDir, entry);
    if (!statSync(itemDir).isDirectory()) continue;
    failures.push(...validateItem(itemDir, config));
  }
  return failures;
}
