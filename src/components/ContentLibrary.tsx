// Your lectures — everything in this course, and whether students can open it.
//
// Two rewrites in, the shape that survives is: one badge, one button, no
// vocabulary from the release state machine. See docs/07-pitfalls.md #15.
//
// "Tie it to a class day" was removed on 2026-07-28, one day after it shipped.
// It created a draft release and never released it, so it could only ever make
// content invisible — and it was premature anyway: there is no UI to create
// class days, so it offered a single irrelevant option. It comes back with
// class-day management (05-status.md item 8).
//
// Module scope, per pitfalls #4.
import { useEffect, useState } from "preact/hooks";
import {
  contentLibrary, listReleases, updateReleaseState, makeAvailable, studentsCanOpen, ContentNotReviewableError,
  type ContentItem, type ContentLibrary as Library, type ReleaseRow
} from "../api/content";
import { canReleaseToReview } from "../api/contentVisibility";
import { t } from "../i18n";

type Filter = "all" | "available" | "hidden";

export function ContentLibraryView() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Keyed by item id: a failure has to appear next to the button that caused
  // it. A single error line at the top of a 23-item list reads as "nothing
  // happened", which is exactly how a hard failure went unnoticed.
  const [itemError, setItemError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    try {
      const [lib, rel] = await Promise.all([contentLibrary(), listReleases()]);
      setLibrary(lib);
      setReleases(rel.releases);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("content.library.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(itemId: string, work: () => Promise<void>) {
    setNotice(null);
    setItemError((current) => ({ ...current, [itemId]: "" }));
    setBusy(itemId);
    try {
      await work();
      await load();
    } catch (e) {
      setItemError((current) => ({
        ...current,
        [itemId]: e instanceof ContentNotReviewableError
          ? t("content.library.notReviewable")
          : e instanceof Error ? e.message : t("content.library.changeFailed")
      }));
    } finally {
      setBusy(null);
    }
  }

  if (loadError && !library) return <p class="error-text" role="alert">{loadError}</p>;
  if (!library || !releases) {
    return <div class="empty-state"><p>{t("content.library.loading")}</p></div>;
  }
  const reviewableItems = library.content_items.filter((item) => canReleaseToReview(item));

  if (!reviewableItems.length) {
    return (
      <div class="empty-state card">
        <h3>{t("content.library.emptyTitle")}</h3>
        <p>{t("content.library.emptyBody")}</p>
      </div>
    );
  }

  const releasesByItem = new Map<string, ReleaseRow[]>();
  for (const release of releases) {
    const list = releasesByItem.get(release.content_item_id) ?? [];
    list.push(release);
    releasesByItem.set(release.content_item_id, list);
  }

  const isAvailable = (item: ContentItem) =>
    (releasesByItem.get(item.id) ?? []).some((r) => studentsCanOpen(r.state));

  const items = reviewableItems.filter((item) =>
    filter === "all" ? true : filter === "available" ? isAvailable(item) : !isAvailable(item)
  );
  const availableCount = reviewableItems.filter(isAvailable).length;

  return (
    <div class="stack">
      <p class="hint">{t("content.library.lede")}</p>

      <div class="row" style="justify-content: space-between; align-items: center;">
        <span class="hint">
          {t("content.library.countAvailable", {
            available: availableCount,
            total: reviewableItems.length
          })}
        </span>
        <div class="nav-tabs" role="tablist" style="flex: 0 0 auto;">
          {(["all", "available", "hidden"] as Filter[]).map((value) => (
            <a href="#" role="tab" aria-current={filter === value ? "page" : undefined}
               onClick={(e) => { e.preventDefault(); setFilter(value); }}>
              {value === "all"
                ? t("content.library.filterAll")
                : value === "available"
                  ? t("content.library.filterAvailable")
                  : t("content.library.filterHidden")}
            </a>
          ))}
        </div>
      </div>

      {notice ? <p class="hint" role="status">{notice}</p> : null}

      {items.map((item) => {
        const mine = releasesByItem.get(item.id) ?? [];
        const open = mine.find((r) => studentsCanOpen(r.state));
        const available = Boolean(open);
        // Reuse the newest existing row rather than accumulating releases.
        const reusable = open ?? [...mine].sort((a, b) =>
          String(b.updated_at).localeCompare(String(a.updated_at)))[0];
        const failure = itemError[item.id];

        return (
          <div class="card stack">
            <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 0.8rem;">
              <div>
                <h3>{item.title}</h3>
                <p class="hint">
                  <span class={`pill ${available ? "open" : "hidden"}`}>
                    {available
                      ? t("content.library.statusAvailable")
                      : t("content.library.statusHidden")}
                  </span>
                </p>
              </div>
              <div class="row" style="flex: 0 0 auto;">
                {available ? (
                  <button
                    class="btn quiet"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      if (!open) return;
                      if (!confirm(t("content.library.takeBackConfirm", { title: item.title }))) return;
                      void run(item.id, async () => {
                        await updateReleaseState({
                          release_id: open.release_id,
                          next_state: "closed",
                          reason: "Taken back from the Content screen."
                        });
                        setNotice(t("content.library.tookBack", { title: item.title }));
                      });
                    }}
                  >
                    {busy === item.id ? t("content.library.working") : t("content.library.takeBack")}
                  </button>
                ) : (
                  <button
                    class="btn primary"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      if (!confirm(t("content.library.makeAvailableConfirm", { title: item.title }))) return;
                      void run(item.id, async () => {
                        await makeAvailable({ item, existingRelease: reusable });
                        setNotice(t("content.library.madeAvailable", { title: item.title }));
                      });
                    }}
                  >
                    {busy === item.id ? t("content.library.working") : t("content.library.makeAvailable")}
                  </button>
                )}
              </div>
            </div>
            {failure ? <p class="error-text" role="alert">{failure}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
