// Your lectures — everything in this course, and whether students can open it.
//
// Keep the professor-facing language out of the release-state machine. See
// docs/07-pitfalls.md #15.
//
// Assignment is deliberately the same full-row session update used by Classes.
// It is never a content release: ending the assigned class creates the group
// Review release atomically on the server.
//
// Module scope, per pitfalls #4.
import { useEffect, useState } from "preact/hooks";
import {
  contentLibrary, listReleases, updateReleaseState, makeAvailable, studentsCanOpen, ContentNotReviewableError,
  type ContentItem, type ContentLibrary as Library, type ReleaseRow
} from "../api/content";
import { updateClass } from "../api/classes";
import { listSessions, type ClassSession } from "../api/schedule";
import { canReleaseToReview } from "../api/contentVisibility";
import { refreshContext } from "../state/session";
import { t, formatDay } from "../i18n";

type Filter = "all" | "available" | "hidden";
const ASSIGNABLE_SESSION_STATES = ["planned", "open", "continued"];

function reviewScope(release: ReleaseRow): string {
  return release.section_id == null
    ? t("content.library.wholeCourseReview")
    : t("content.library.groupReview", { group: release.section_code || release.section_name });
}

export function ContentLibraryView() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
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
      const [lib, rel, classes] = await Promise.all([contentLibrary(), listReleases(), listSessions()]);
      setLibrary(lib);
      setReleases(rel.releases);
      setSessions(classes.sessions);
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
  if (!library || !releases || !sessions) {
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
  const assignableSessions = sessions.filter((session) =>
    ASSIGNABLE_SESSION_STATES.includes(session.state) && session.actual_start_at == null
  );

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
        const effectiveReleases = mine.filter((release) => studentsCanOpen(release.state));
        const available = effectiveReleases.length > 0;
        const wholeCourseRelease = effectiveReleases.find((release) => release.section_id == null);
        // A group release must never be reopened as the whole-course override.
        const reusableWholeCourseRelease = [...mine]
          .filter((release) => release.section_id == null)
          .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
        const plannedAssignments = assignableSessions.filter((session) => session.content_item_id === item.id);
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
                {!wholeCourseRelease ? (
                  <button
                    class="btn primary"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      if (!confirm(t("content.library.makeAvailableConfirm", { title: item.title }))) return;
                      void run(item.id, async () => {
                        await makeAvailable({ item, existingRelease: reusableWholeCourseRelease });
                        setNotice(t("content.library.madeAvailable", { title: item.title }));
                      });
                    }}
                  >
                    {busy === item.id ? t("content.library.working") : t("content.library.makeAvailable")}
                  </button>
                ) : null}
              </div>
            </div>
            <label class="field">
              {t("content.library.assignToClass")}
              <select
                value=""
                disabled={busy === item.id || !assignableSessions.length}
                onChange={(event) => {
                  const target = event.target as HTMLSelectElement;
                  const session = assignableSessions.find((candidate) => candidate.session_id === target.value);
                  target.value = "";
                  if (!session) return;
                  if (!confirm(t("content.library.assignConfirm", { lecture: item.title, title: session.title }))) return;
                  void run(item.id, async () => {
                    await updateClass({
                      session_id: session.session_id,
                      section_id: session.section_id,
                      title: session.title,
                      planned_date: session.planned_date,
                      content_item_id: item.id
                    });
                    await refreshContext();
                    setNotice(t("content.library.assigned", { lecture: item.title, title: session.title }));
                  });
                }}
              >
                <option value="">{t("content.library.assignClassPlaceholder")}</option>
                {assignableSessions.map((session) => (
                  <option value={session.session_id}>
                    {t("content.library.assignmentOption", {
                      date: formatDay(session.planned_date),
                      group: session.section_code || session.section_name || "—",
                      title: session.title,
                      lecture: session.content_title || t("content.library.noLecture")
                    })}
                  </option>
                ))}
              </select>
            </label>
            {plannedAssignments.length ? (
              <div class="stack" style="gap: 0.4rem;">
                <p class="hint">{t("content.library.plannedAssignments")}</p>
                {plannedAssignments.map((session) => (
                  <p class="hint">
                    {t("content.library.plannedAssignment", {
                      date: formatDay(session.planned_date),
                      group: session.section_code || session.section_name || "—",
                      title: session.title
                    })}
                  </p>
                ))}
              </div>
            ) : null}
            {effectiveReleases.length ? (
              <div class="stack" style="gap: 0.4rem;">
                {effectiveReleases.map((release) => {
                  const scope = reviewScope(release);
                  return (
                    <div class="row" style="justify-content: space-between; align-items: center;">
                      <span class="pill open">{scope}</span>
                      <button
                        class="btn quiet"
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => {
                          if (!confirm(t("content.library.removeFromReviewConfirm", { title: item.title, scope }))) return;
                          void run(item.id, async () => {
                            await updateReleaseState({
                              release_id: release.release_id,
                              next_state: "closed",
                              reason: "Removed from Review from the Content screen."
                            });
                            setNotice(t("content.library.removedFromReview", { title: item.title, scope }));
                          });
                        }}
                      >
                        {busy === item.id ? t("content.library.working") : t("content.library.removeFromReview")}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {failure ? <p class="error-text" role="alert">{failure}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
