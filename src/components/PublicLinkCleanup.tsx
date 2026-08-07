// "These lectures link out to the public site" — and the one action that fixes
// it.
//
// Phase 2 rewrote every relative link in a deck or mission to an absolute
// public URL so cross-navigation would keep working while the public copies
// still existed. The consequence is that nine of the twelve missions link to
// the public copy of their own lecture, so a student inside the gated viewer is
// one click outside it. This card is how the professor closes that.
//
// Three deliberate choices:
//
//   Preview first, always. The card knows what would change before it offers
//   to change anything, and it says so in a sentence rather than a table of
//   storage paths.
//
//   In-app confirmation, not window.confirm (pitfall #36). Native dialogs
//   block browser automation, cannot be translated, and have nowhere to put
//   the consequences.
//
//   Nothing to clean means nothing rendered. This is a one-time job; a
//   permanent maintenance card is clutter from the day after it is used.
//
// Module scope, per docs/07-pitfalls.md #4.
import { useEffect, useState } from "preact/hooks";
import {
  previewPublicLinks,
  cleanPublicLinks,
  type CleanupPreviewRow
} from "../api/contentCleanup";
import { t } from "../i18n";

export function PublicLinkCleanup() {
  const [rows, setRows] = useState<CleanupPreviewRow[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows((await previewPublicLinks()).items);
    } catch (e) {
      // A failed preview is not worth an alarm on the Content screen: the
      // card simply stays hidden and the professor loses nothing.
      setRows([]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function onClean() {
    setError(null);
    setConfirming(false);
    let cleaned = 0;
    // One call per item. The backend refuses to sweep, and walking here means
    // a failure names the item it failed on instead of losing the whole run.
    for (const row of (rows || []).filter((candidate) => candidate.would_change)) {
      setWorking(row.title || row.slug);
      try {
        const result = await cleanPublicLinks(row.content_item_id);
        if (!result.already_clean) cleaned += 1;
      } catch (e) {
        setWorking(null);
        setError(t("cleanup.failed", { title: row.title || row.slug }));
        await load();
        return;
      }
    }
    setWorking(null);
    setDone(cleaned);
    await load();
  }

  if (!rows) return null;

  const pending = rows.filter((row) => row.would_change);
  const references = pending.reduce((total, row) => total + row.public_references, 0);

  if (!pending.length) {
    // Say it once after a run, then disappear on the next load.
    return done !== null
      ? <p class="hint" role="status">{t("cleanup.allClean")}</p>
      : null;
  }

  return (
    <div class="card">
      <h3>{t("cleanup.title")}</h3>
      <p class="hint">{t("cleanup.body")}</p>
      <p role="status">
        {t("cleanup.found", { items: String(pending.length), links: String(references) })}
      </p>

      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {working ? (
        <p class="hint" role="status">{t("cleanup.working", { title: working })}</p>
      ) : confirming ? (
        <div class="row" style="gap: 0.5rem; align-items: center;">
          <button class="btn primary" type="button" onClick={() => void onClean()}>
            {t("cleanup.confirm")}
          </button>
          <button class="btn quiet" type="button" onClick={() => setConfirming(false)}>
            {t("content.cancel")}
          </button>
        </div>
      ) : (
        <div class="row">
          <button class="btn primary" type="button" onClick={() => setConfirming(true)}>
            {t("cleanup.action")}
          </button>
        </div>
      )}

      {done !== null && !working ? (
        <p class="hint" role="status">{t("cleanup.done", { count: String(done) })}</p>
      ) : null}
    </div>
  );
}
