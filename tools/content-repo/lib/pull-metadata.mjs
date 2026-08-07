// The one decision pull.mjs has to make correctly: how to merge what
// production returns (English only — content_items has no title_es or
// summary_es column; Spanish text for the library metadata has never existed
// anywhere but a human's head) with whatever content.json already has on
// disk, without ever writing a fabricated translation that looks real.
//
// Kept pure and separate from pull.mjs's network calls so it can be tested
// the same way lib/validate.mjs is: fixtures in, assertions out, no fetch.
export function buildPulledMetadata({ item, existingMeta, sha, now }) {
  const existing = existingMeta || {};
  const warnings = [];

  const existingTitleEs = existing.title?.es?.trim();
  const titleEs = existingTitleEs || item.title;
  if (!existingTitleEs) {
    warnings.push(
      "title.es was not available from production (there is no Spanish column to pull) "
      + "and has been set to the English text — replace it with a real translation before publishing."
    );
  }

  const hasSummary = Boolean(item.summary && item.summary.trim());
  let summary;
  if (hasSummary) {
    const existingSummaryEs = existing.summary?.es?.trim();
    summary = { en: item.summary, es: existingSummaryEs || item.summary };
    if (!existingSummaryEs) {
      warnings.push(
        "summary.es was not available from production and has been set to the English text — "
        + "replace it with a real translation before publishing."
      );
    }
  } else if (existing.summary?.en || existing.summary?.es) {
    // Production has no summary now but one was authored locally before —
    // keep it rather than erase authored work on a re-pull.
    summary = existing.summary;
  }

  const meta = {
    slug: item.slug,
    content_item_id: item.id,
    content_type: item.content_type,
    title: { en: item.title, es: titleEs },
    ...(summary ? { summary } : {}),
    default_points: item.default_points ?? existing.default_points ?? 0,
    // The local authoring filename and the real production filename are
    // deliberately separate concepts (see publish.mjs) — a re-pull must never
    // override either once a human has set them.
    entry: existing.entry || "index.html",
    storage_filename: existing.storage_filename || "deck.html",
    ...(existing.variant ? { variant: existing.variant } : {}),
    ...(existing.external_links ? { external_links: existing.external_links } : {}),
    version: {
      current: existing.version?.current || 0,
      content_sha256: sha,
      pulled_at: now
    },
    ...(existing.history ? { history: existing.history } : {})
  };

  return { meta, warnings };
}
