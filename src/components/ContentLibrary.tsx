// Your lectures — everything already in this course, and the release gate.
//
// This is the half of Content that has nothing to do with the AI pipeline: the
// professor's own 23 decks were in the database from Phase 2 but the v2 app
// never listed them, and never called course-release-management either. So the
// app could show content it had no way to release, and "run a class without
// touching the old apps" was not actually true.
//
// The path is: library item -> give it to a class (draft) -> release it.
// Module scope, per docs/07-pitfalls.md #4.
import { useEffect, useState } from "preact/hooks";
import {
  contentLibrary, attachToSession, listReleases, updateReleaseState, RELEASE_ACTIONS,
  type ContentItem, type ContentLibrary as Library, type ReleaseRow
} from "../api/content";
import { StatusPill } from "./StatusPill";
import { t, locale } from "../i18n";
import type { StringKey } from "../i18n/strings";

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
  // Which item is currently showing its "give it to a class" picker.
  const [attaching, setAttaching] = useState<string | null>(null);
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

  async function onAttach(item: ContentItem) {
    const session = library?.sessions.find((s) => s.id === pickedSession);
    if (!session) return;
    setError(null);
    setNotice(null);
    setBusy(item.id);
    try {
      await attachToSession({
        item,
        section_id: session.section_id,
        class_session_id: session.id
      });
      setNotice(
        t("content.library.attached", { title: item.title, session: session.title })
      );
      setAttaching(null);
      setPickedSession("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("content.library.loadFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onTransition(release: ReleaseRow, next: string) {
    const label = release.class_session_title || release.section_code;
    if (next === "released" && !confirm(t("content.release.publishConfirm", { title: release.title, session: label }))) return;
    if (next === "closed" && !confirm(t("content.release.closeConfirm", { title: release.title, session: label }))) return;
    setError(null);
    setNotice(null);
    setBusy(release.release_id);
    try {
      await updateReleaseState({ release_id: release.release_id, next_state: next });
      setNotice(
        t("content.release.changed", {
          title: release.title,
          state: t(`state.${next}` as StringKey)
        })
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("content.release.failed"));
    } finally {
      setBusy(null);
    }
  }

  if (error && !library) {
    return <p class="error-text" role="alert">{error}</p>;
  }
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

  return (
    <div class="stack">
      <p class="hint">{t("content.library.count", { count: library.content_items.length })}</p>
      {notice ? <p class="hint" role="status">{notice}</p> : null}
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {library.content_items.map((item) => {
        const mine = releasesByItem.get(item.id) ?? [];
        return (
          <div class="card stack">
            <div class="row" style="justify-content: space-between; align-items: flex-start;">
              <div>
                <h3>{item.title}</h3>
                <p class="hint">
                  {mine.length
                    ? t("content.library.usedIn", { count: mine.length })
                    : t("content.library.notReleased")}
                </p>
              </div>
            </div>

            {mine.map((release) => {
              const options = RELEASE_ACTIONS.filter((a) => a.from === release.state);
              return (
                <div class="row" style="justify-content: space-between; align-items: center; gap: 0.6rem;">
                  <span>
                    {release.class_session_title
                      ? `${release.class_session_title} · ${dateLabel(release.planned_date)}`
                      : release.section_code}
                  </span>
                  <span class="row" style="gap: 0.4rem; align-items: center;">
                    <StatusPill state={release.state} />
                    {options.map((action) => (
                      <button
                        class={`btn ${action.to === "released" ? "primary" : "quiet"}`}
                        type="button"
                        disabled={busy === release.release_id}
                        onClick={() => void onTransition(release, action.to)}
                      >
                        {busy === release.release_id
                          ? t("content.release.working")
                          : t(action.key as StringKey)}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}

            {attaching === item.id ? (
              <div class="stack" style="gap: 0.4rem;">
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
                    <p class="hint">{t("content.library.attachHint")}</p>
                    <div class="row">
                      <button
                        class="btn primary"
                        type="button"
                        disabled={!pickedSession || busy === item.id}
                        onClick={() => void onAttach(item)}
                      >
                        {busy === item.id
                          ? t("content.library.attaching")
                          : t("content.library.attach")}
                      </button>
                      <button
                        class="btn quiet"
                        type="button"
                        onClick={() => { setAttaching(null); setPickedSession(""); }}
                      >
                        {t("content.library.cancel")}
                      </button>
                    </div>
                  </>
                ) : (
                  <p class="hint">{t("content.library.noSessions")}</p>
                )}
              </div>
            ) : (
              <div class="row">
                <button
                  class="btn"
                  type="button"
                  onClick={() => { setAttaching(item.id); setPickedSession(""); }}
                >
                  {t("content.library.attach")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
