// Your lectures — everything in this course, and whether students can open it.
//
// The first version of this screen exposed the release state machine almost
// directly: "Release to students", "Open it during class", "Switch to review
// only", plus a mandatory class-session picker. The professor's reaction on
// 2026-07-28 is the specification for this rewrite — he could not tell what
// "give it to a class" meant, the picker offered one nonsensical option, and a
// closed item had no way back.
//
// So this screen answers only the two questions he actually has:
//   1. Can my students open this?  -> Make it available / Take it back
//   2. Does it belong to one class day?  -> optional, secondary, explained
//
// Module scope, per docs/07-pitfalls.md #4.
import { useEffect, useState } from "preact/hooks";
import {
  contentLibrary, listReleases, updateReleaseState, makeAvailable, createDraftRelease,
  studentsCanOpen,
  type ContentItem, type ContentLibrary as Library, type ReleaseRow
} from "../api/content";
import { t, locale } from "../i18n";

type Filter = "all" | "available" | "hidden";

function dateLabel(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(locale(), { month: "short", day: "numeric" });
}

export function ContentLibraryView() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [tying, setTying] = useState<string | null>(null);
  const [pickedSession, setPickedSession] = useState("");

  async function load() {
    try {
      const [lib, rel] = await Promise.all([contentLibrary(), listReleases()]);
      setLibrary(lib);
      setReleases(rel.releases);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("content.library.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(key: string, work: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("content.library.changeFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (error && !library) return <p class="error-text" role="alert">{error}</p>;
  if (!library || !releases) {
    return <div class="empty-state"><p>{t("content.library.loading")}</p></div>;
  }
  if (!library.content_items.length) {
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

  // One item is "available" if any of its releases is in a student-visible
  // state. Everything else is a detail the professor should not have to hold.
  const isAvailable = (item: ContentItem) =>
    (releasesByItem.get(item.id) ?? []).some((r) => studentsCanOpen(r.state));

  const items = library.content_items.filter((item) =>
    filter === "all" ? true : filter === "available" ? isAvailable(item) : !isAvailable(item)
  );

  return (
    <div class="stack">
      <p class="hint">{t("content.library.lede")}</p>

      <div class="row" style="justify-content: space-between; align-items: center;">
        <span class="hint">
          {t("content.library.count", { count: library.content_items.length })}
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
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {items.map((item) => {
        const mine = releasesByItem.get(item.id) ?? [];
        const open = mine.find((r) => studentsCanOpen(r.state));
        const available = Boolean(open);
        // Prefer an existing release row over creating a second one.
        const reusable = open ?? mine[0];
        const tied = mine.find((r) => r.class_session_id);

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
                  {" "}
                  {tied
                    ? t("content.library.statusForClass", {
                        session: `${tied.class_session_title} · ${dateLabel(tied.planned_date)}`
                      })
                    : available
                      ? t("content.library.statusCourseWide")
                      : ""}
                </p>
              </div>
              <div class="row" style="flex: 0 0 auto; gap: 0.4rem;">
                {available ? (
                  <button
                    class="btn quiet"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      if (!open) return;
                      if (!confirm(t("content.library.takeBackConfirm", { title: item.title }))) return;
                      void run(item.id, async () => {
                        await updateReleaseState({ release_id: open.release_id, next_state: "closed" });
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

            {tying === item.id ? (
              <div class="stack" style="gap: 0.4rem;">
                <p class="hint">{t("content.library.tieHint")}</p>
                {library.sessions.length ? (
                  <>
                    <label class="field">
                      {t("content.library.pickSession")}
                      <select
                        value={pickedSession}
                        onChange={(e) => setPickedSession((e.target as HTMLSelectElement).value)}
                      >
                        <option value="">—</option>
                        {library.sessions.map((session) => (
                          <option value={session.id}>
                            {session.title} · {dateLabel(session.planned_date)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div class="row">
                      <button
                        class="btn"
                        type="button"
                        disabled={!pickedSession || busy === item.id}
                        onClick={() => {
                          const session = library.sessions.find((s) => s.id === pickedSession);
                          if (!session) return;
                          void run(item.id, async () => {
                            await createDraftRelease({
                              item,
                              section_id: session.section_id,
                              class_session_id: session.id
                            });
                            setNotice(t("content.library.tied", { title: item.title, session: session.title }));
                            setTying(null);
                            setPickedSession("");
                          });
                        }}
                      >
                        {busy === item.id ? t("content.library.working") : t("content.library.tie")}
                      </button>
                      <button class="btn quiet" type="button"
                              onClick={() => { setTying(null); setPickedSession(""); }}>
                        {t("content.library.cancel")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p class="hint">{t("content.library.tieNoSessions")}</p>
                    <div class="row">
                      <button class="btn quiet" type="button" onClick={() => setTying(null)}>
                        {t("content.library.cancel")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div class="row">
                <button
                  class="btn quiet"
                  type="button"
                  onClick={() => { setTying(item.id); setPickedSession(""); }}
                >
                  {t("content.library.tieToClass")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
