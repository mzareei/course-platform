// The only thing in this repository that writes to production.
//
//   COURSE_ACCESS_TOKEN=<instructor session token> \
//     node tools/publish.mjs <slug> [--confirm]
//
// Without --confirm it prints the exact diff and stops. That is the default on
// purpose: publishing over a lecture is legitimate but should never be
// accidental.
//
// The token is the professor's own short-lived Supabase session token, which
// the edge function re-validates along with the role on every call. Nothing
// here needs or touches a service key — this repository holds no credentials,
// and the CI workflow holds none either. That is the whole reason publishing
// is a command rather than a merge hook.
//
// Publishing NEVER makes anything visible to students. There is no code here
// that writes to content_releases, and there is deliberately no flag to add
// one. A newly published item is simply present in the library until someone
// releases it in the app.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { validateItem } from "../lib/validate.mjs";

const SUPABASE_URL = "https://ojmbupftdikwmlqvibwt.supabase.co";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(path.join(root, "course.json"), "utf8"));
const token = process.env.COURSE_ACCESS_TOKEN || "";
const slug = process.argv[2];
const confirmed = process.argv.includes("--confirm");

if (!slug) {
  console.error("Usage: node tools/publish.mjs <slug> [--confirm]");
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

// ---- 1. resolve ------------------------------------------------------------
const [courseId, course] = Object.entries(config.courses).find(([, candidate]) =>
  existsSync(path.join(root, candidate.directory, "content", slug))
) || [];
if (!courseId) {
  console.error(`No course contains an item named "${slug}".`);
  process.exit(1);
}
const itemDir = path.join(root, course.directory, "content", slug);
const meta = JSON.parse(readFileSync(path.join(itemDir, "content.json"), "utf8"));

// ---- 2. validate — every fallible pure step before any network write -------
const failures = validateItem(itemDir, config);
if (failures.length) {
  console.error(`${failures.length} validation failure(s). Nothing was published:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

const html = readFileSync(path.join(itemDir, meta.entry || "index.html"), "utf8");
const sha = createHash("sha256").update(html).digest("hex");

// ---- 3. reconcile against production ---------------------------------------
if (!token) {
  console.error("COURSE_ACCESS_TOKEN is required. Sign in to the app and copy your session token.");
  process.exit(1);
}
const library = await callFn("course-content-library", { course_id: courseId });
const existing = (library.content_items || []).find((item) => item.slug === slug);

// ---- 4. preflight — print, and refuse without --confirm ---------------------
console.log(`\n${slug}`);
console.log(`  course         ${courseId}`);
console.log(`  content item   ${existing ? `${existing.id} (existing, id unchanged)` : "new"}`);
if (existing && existing.can_edit === false) {
  console.error("\n  ✗ This item belongs to another instructor. Nothing was published.");
  process.exit(1);
}
const storagePath = `${course.storage_prefix}/${slug}/${meta.storage_filename}`;
console.log(`  storage path   ${storagePath}${existing ? " (unchanged)" : ""}`);
console.log(`  artifact       ${Math.round(html.length / 1024)} KB, sha256 ${sha.slice(0, 8)}`);
if (meta.version?.content_sha256 === sha) {
  console.log("\n  Nothing to do — the artifact is identical to the published version.");
  process.exit(0);
}
if (meta.version?.content_sha256) console.log(`                 (was ${meta.version.content_sha256.slice(0, 8)})`);
if (existing?.release_counts?.active) {
  console.log(`  ⚠ ${existing.release_counts.active} active release(s) — students can open this now`);
}

if (!confirmed) {
  console.log("\n  Not published. Re-run with --confirm to write.");
  process.exit(0);
}

// ---- 5. write --------------------------------------------------------------
const { signed_url, path: uploadPath } = await callFn("course-content-upload", {
  course_id: courseId,
  action: "create_upload_url",
  slug,
  filename: meta.storage_filename
});
const put = await fetch(signed_url, {
  method: "PUT",
  headers: { "Content-Type": "text/html; charset=utf-8", "x-upsert": "true" },
  body: html
});
if (!put.ok) throw new Error(`Storage PUT failed (${put.status}): ${await put.text()}`);

const { item } = await callFn("course-content-upload", {
  course_id: courseId,
  action: "register_item",
  slug,
  title: meta.title.en,
  summary: meta.summary?.en || "",
  content_type: meta.content_type,
  storage_path: uploadPath,
  default_points: meta.default_points || 0
});

// ---- 6. record the version locally, so git is the history ------------------
const version = Number(meta.version?.current || 0) + 1;
meta.content_item_id = item?.id || meta.content_item_id;
meta.history = [
  ...(meta.history || []),
  ...(meta.version ? [{ ...meta.version, version: meta.version.current }] : [])
];
meta.version = {
  current: version,
  published_at: new Date().toISOString(),
  content_sha256: sha,
  storage_path: uploadPath
};
writeFileSync(path.join(itemDir, "content.json"), `${JSON.stringify(meta, null, 2)}\n`);

console.log(`\n  Published version ${version}. Commit content.json to record it.`);
console.log("  Students see nothing until you release it in the app.");
