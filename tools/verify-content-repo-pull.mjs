// publish.mjs's counterpart never existed: there was no way to get a lecture
// *out* of production and into this repository to edit it. "How do I modify
// Week 1" had no good answer beyond "ask a session with a working Supabase
// CLI to guess at storage download flags."
//
// pull.mjs (untested directly, like publish.mjs — it is nothing but network
// calls) does the I/O. This tests its one pure decision: how to merge what
// production knows (English-only — content_items has no title_es/summary_es
// column) with whatever content.json already has, without silently fabricating
// Spanish text that looks real.
import assert from "node:assert/strict";
import { buildPulledMetadata } from "./content-repo/lib/pull-metadata.mjs";

const item = {
  id: "7bfd4934-0f82-4642-b458-42d2026401f1",
  slug: "week-01-lecture",
  content_type: "lecture",
  title: "Introduction to Information Security",
  summary: "",
  default_points: 0
};

// --- a first pull has nothing to preserve -----------------------------------
{
  const { meta, warnings } = buildPulledMetadata({ item, existingMeta: null, sha: "abc123", now: "2026-08-07T00:00:00.000Z" });
  assert.equal(meta.slug, "week-01-lecture");
  assert.equal(meta.content_item_id, item.id);
  assert.equal(meta.title.en, "Introduction to Information Security");
  // Never leave title.es empty — that fails validate.mjs's bilingual check —
  // but never silently claim it is a real translation either.
  assert.equal(meta.title.es, "Introduction to Information Security");
  assert.equal(meta.entry, "index.html");
  assert.equal(meta.storage_filename, "deck.html");
  assert.equal(meta.version.content_sha256, "abc123");
  assert.equal(meta.version.current, 0);
  assert.ok(!("summary" in meta), "an item with no summary must not gain a fabricated one");
  assert.ok(
    warnings.some((w) => /title\.es/.test(w) && /translation/.test(w)),
    "defaulting title.es to English must be flagged, not silent"
  );
}

// --- re-pulling must never clobber a real translation -----------------------
{
  const existingMeta = {
    slug: "week-01-lecture",
    content_item_id: item.id,
    content_type: "lecture",
    title: { en: "Introduction to Information Security", es: "Introducción a la seguridad de la información" },
    entry: "index.html",
    storage_filename: "deck.html",
    version: { current: 3, content_sha256: "old-sha", published_at: "2026-08-01T00:00:00.000Z" },
    history: [{ current: 2 }]
  };
  const { meta, warnings } = buildPulledMetadata({ item, existingMeta, sha: "new-sha", now: "2026-08-07T00:00:00.000Z" });
  assert.equal(meta.title.es, "Introducción a la seguridad de la información");
  assert.equal(meta.version.current, 3, "pulling must not reset the publish version counter");
  assert.equal(meta.version.content_sha256, "new-sha", "the sha must reflect what was just downloaded");
  assert.deepEqual(meta.history, [{ current: 2 }], "publish history must survive a pull");
  assert.equal(
    warnings.filter((w) => /title\.es/.test(w)).length, 0,
    "a real existing translation must not be flagged as defaulted"
  );
}

// --- a summary defaults the same way, only when production has one ----------
{
  const withSummary = { ...item, summary: "Threats, controls, and the CIA triad." };
  const { meta, warnings } = buildPulledMetadata({ item: withSummary, existingMeta: null, sha: "s1", now: "now" });
  assert.equal(meta.summary.en, "Threats, controls, and the CIA triad.");
  assert.equal(meta.summary.es, "Threats, controls, and the CIA triad.");
  assert.ok(warnings.some((w) => /summary\.es/.test(w)));
}

// --- storage_filename and entry are never re-derived once set ---------------
{
  const existingMeta = { entry: "deck.html", storage_filename: "index.html" };
  const { meta } = buildPulledMetadata({ item, existingMeta, sha: "s", now: "now" });
  assert.equal(meta.entry, "deck.html", "a locally-chosen entry filename must survive a re-pull");
  assert.equal(meta.storage_filename, "index.html", "the real production filename must survive a re-pull");
}

console.log("verify-content-repo-pull: OK");
