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
  syncContentFromRepository,
  copyContentItem, shareContentItem, unshareContentItem,
  deleteContentItem, contentItemDeleteErrorKey,
  type ContentItem, type ContentLibrary as Library, type ReleaseRow
} from "../api/content";
import { updateClass } from "../api/classes";
import { listSessions, type ClassSession } from "../api/schedule";
import { canReleaseToReview } from "../api/contentVisibility";
import { PublicLinkCleanup } from "./PublicLinkCleanup";
import { ForceDeleteControl } from "./ForceDeleteControl";
import { refreshContext } from "../state/session";
import { t, formatDay, apiErrorText } from "../i18n";
import { ApiError } from "../api/client";
import type { StringKey } from "../i18n/strings";

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
  const [query, setQuery] = useState("");
  // Which item's share picker is expanded, and the group chosen in it. Local
  // to the screen, not the library payload — closing it loses nothing on the
  // server.
  const [sharingItemId, setSharingItemId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<string>("");

  async function load() {
    try {
      const [lib, rel, classes] = await Promise.all([contentLibrary(), listReleases(), listSessions()]);
      setLibrary(lib);
      setReleases(rel.releases);
      setSessions(classes.sessions);
    } catch (e) {
      setLoadError(apiErrorText(e, "content.library.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(itemId: string, work: () => Promise<void>, failureMessage = t("content.library.changeFailed")) {
    setNotice(null);
    setItemError((current) => ({ ...current, [itemId]: "" }));
    setBusy(itemId);
    try {
      await work();
      await load();
    } catch (e) {
      const deleteErrorKey: StringKey | null = e instanceof ApiError ? contentItemDeleteErrorKey(e.code) : null;
      setItemError((current) => ({
        ...current,
        [itemId]: e instanceof ContentNotReviewableError
          ? t("content.library.notReviewable")
          : deleteErrorKey !== null
            ? t(deleteErrorKey)
            : e instanceof Error ? e.message : failureMessage
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
  // Anything canReleaseToReview excludes (e.g. a bank-only import with no
  // deck: content_type "quiz_bank", source_kind "supabase_record") never
  // gets a card in the loop below and previously had no way to be reached
  // at all — the row existed in the database with no Delete button anywhere
  // in the app. This section is delete-only: none of Make available / Sync
  // / Share / Assign apply to something with no student-facing form.
  const unmanagedItems = library.content_items.filter((item) =>
    !canReleaseToReview(item) && item.can_edit !== false && !item.is_shared_with_me
  );

  if (!reviewableItems.length && !unmanagedItems.length) {
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
    (releasesByItem.get(item.id) ?? []).some((r) => studentsCanOpen(r.state, r.opens_at));

  // Numeric collation puts "Week 2" before "Week 10" — the list used to render
  // in creation order, which scattered the weeks.
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const needle = query.trim().toLowerCase();
  const items = reviewableItems
    .filter((item) =>
      filter === "all" ? true : filter === "available" ? isAvailable(item) : !isAvailable(item)
    )
    .filter((item) => !needle || item.title.toLowerCase().includes(needle))
    .sort((a, b) => collator.compare(a.title, b.title));
  const availableCount = reviewableItems.filter(isAvailable).length;
  const assignableSessions = sessions.filter((session) =>
    ASSIGNABLE_SESSION_STATES.includes(session.state) && session.actual_start_at == null
  );

  return (
    <div class="stack">
      {notice ? <p class="hint" role="status">{notice}</p> : null}

      {reviewableItems.length ? (
        <>
          <p class="hint">{t("content.library.lede")}</p>

          {/* Renders nothing once every stored file is clean, so this one-time
              job does not leave a permanent maintenance card behind. */}
          <PublicLinkCleanup />

          <div class="row" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <span class="hint">
              {t("content.library.countAvailable", {
                available: availableCount,
                total: reviewableItems.length
              })}
            </span>
            <input
              type="search"
              value={query}
              placeholder={t("content.library.searchPlaceholder")}
              aria-label={t("content.library.searchPlaceholder")}
              style="max-width: 16rem;"
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
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

          {items.map((item) => {
            const mine = releasesByItem.get(item.id) ?? [];
            const effectiveReleases = mine.filter((release) => studentsCanOpen(release.state, release.opens_at));
            const manageableReleases = mine.filter((release) =>
              studentsCanOpen(release.state, release.opens_at) || release.state === "scheduled"
            );
            const available = effectiveReleases.length > 0;
            const wholeCourseRelease = effectiveReleases.find((release) => release.section_id == null);
            // A group release must never be reopened as the whole-course override.
            const reusableWholeCourseRelease = [...mine]
              .filter((release) => release.section_id == null)
              .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
            const plannedAssignments = assignableSessions.filter((session) => session.content_item_id === item.id);
            const failure = itemError[item.id];
            // Absent means an older deployed function that predates ownership, and
            // the pre-ownership behaviour was "every instructor may write".
            const canEdit = item.can_edit !== false;

            return (
              <div class="card stack" key={item.id}>
                <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 0.8rem;">
                  <div>
                    <h3>{item.title}</h3>
                    <p class="hint">
                      <span class={`pill ${available ? "open" : "hidden"}`}>
                        {available
                          ? t("content.library.statusAvailable")
                          : t("content.library.statusHidden")}
                      </span>
                      {item.is_shared_with_me ? (
                        <span class="pill" style="margin-left: 0.4rem;">
                          {t("content.library.sharedBadge")}
                        </span>
                      ) : null}
                    </p>
                    {item.is_shared_with_me ? (
                      <p class="hint">{t("content.library.sharedHint")}</p>
                    ) : null}
                  </div>
                  <div class="row" style="flex: 0 0 auto;">
                    {/* A share grants visibility and one action: take a copy.
                        Offering the availability controls here would be a button
                        that always 403s, which reads as a no-op rather than a
                        refusal. */}
                    {item.is_shared_with_me ? (
                      <button
                        class="btn primary"
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => void run(item.id, async () => {
                          const result = await copyContentItem(item.id);
                          setNotice(t("content.library.copied", { title: result.item?.title || item.title }));
                        })}
                      >
                        {busy === item.id ? t("content.library.copying") : t("content.library.copy")}
                      </button>
                    ) : canEdit && !wholeCourseRelease ? (
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
                    {canEdit && item.source_kind === "storage_object" ? (
                      <button
                        class="btn quiet"
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => {
                          if (!confirm(t("content.library.syncConfirm", { title: item.title }))) return;
                          void run(item.id, async () => {
                            const result = await syncContentFromRepository(item.id);
                            setNotice(t(
                              result.status === "unchanged"
                                ? "content.library.syncUnchanged"
                                : "content.library.synced",
                              { title: item.title }
                            ));
                          }, t("content.library.syncFailed", { title: item.title }));
                        }}
                      >
                        {busy === item.id ? t("content.library.syncing") : t("content.library.syncFromRepository")}
                      </button>
                    ) : null}
                    {/* Sharing is a distinct privilege from releasing to
                        students, so it is offered independently of whether the
                        whole-course release button above is showing. */}
                    {canEdit && !item.is_shared_with_me ? (
                      <button
                        class="btn quiet"
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => {
                          setSharingItemId(sharingItemId === item.id ? null : item.id);
                          setShareTarget("");
                        }}
                      >
                        {t("content.library.share")}
                      </button>
                    ) : null}
                    {canEdit && !item.is_shared_with_me ? (
                      <button
                        class="btn quiet"
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => {
                          if (!confirm(t("content.library.deleteConfirm", { title: item.title, releases: mine.length }))) return;
                          void run(item.id, async () => {
                            await deleteContentItem(item.id);
                            setNotice(t("content.library.deleted", { title: item.title }));
                            // Cached TeacherSession rows in the auth context denormalize
                            // content_item_id/content_slug/content_title/source_kind/source_ref,
                            // and Home, RunClass, Projector, and Gradebook all read that
                            // cache. Deleting this item nulls class_sessions.content_item_id
                            // server-side, so without a refresh a professor who deletes an
                            // assigned lecture would keep seeing stale references until a
                            // full reload.
                            await refreshContext();
                          }, t("content.library.deleteFailed"));
                        }}
                      >
                        {busy === item.id ? t("content.library.working") : t("content.library.delete")}
                      </button>
                    ) : null}
                  </div>
                </div>
                {canEdit && sharingItemId === item.id ? (
                  <label class="field">
                    {t("content.library.shareTo")}
                    <select
                      value={shareTarget}
                      disabled={busy === item.id}
                      onChange={(event) => setShareTarget((event.target as HTMLSelectElement).value)}
                    >
                      <option value="">{t("content.library.sharePlaceholder")}</option>
                      {library.shareable_sections.map((section) => (
                        <option value={section.id}>{section.section_code || section.section_name}</option>
                      ))}
                    </select>
                    <div class="row" style="gap: 0.5rem; margin-top: 0.4rem;">
                      <button
                        class="btn primary"
                        type="button"
                        disabled={busy === item.id || !shareTarget}
                        onClick={() => {
                          const section = library.shareable_sections.find((candidate) => candidate.id === shareTarget);
                          void run(item.id, async () => {
                            await shareContentItem(item.id, shareTarget);
                            setNotice(t("content.library.shared", {
                              title: item.title,
                              group: section?.section_code || section?.section_name || ""
                            }));
                            setSharingItemId(null);
                            setShareTarget("");
                          });
                        }}
                      >
                        {busy === item.id ? t("content.library.sharing") : t("content.library.shareSubmit")}
                      </button>
                      <button
                        class="btn quiet"
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => { setSharingItemId(null); setShareTarget(""); }}
                      >
                        {t("content.cancel")}
                      </button>
                    </div>
                  </label>
                ) : null}
                {canEdit && item.shares && item.shares.length ? (
                  <div class="stack" style="gap: 0.4rem;">
                    <p class="hint">{t("content.library.currentShares")}</p>
                    {item.shares.map((share) => (
                      <div class="row" style="justify-content: space-between; align-items: center;">
                        <span class="pill open">{share.section_code || share.section_name}</span>
                        <button
                          class="btn quiet"
                          type="button"
                          disabled={busy === item.id}
                          onClick={() => void run(item.id, async () => {
                            await unshareContentItem(item.id, share.section_id);
                            setNotice(t("content.library.revoked", {
                              title: item.title,
                              group: share.section_code || share.section_name
                            }));
                          })}
                        >
                          {busy === item.id ? t("content.library.revoking") : t("content.library.revoke")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {canEdit ? (
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
                ) : null}
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
                {canEdit && manageableReleases.length ? (
                  <div class="stack" style="gap: 0.4rem;">
                    {manageableReleases.map((release) => {
                      const scope = reviewScope(release);
                      const scheduled = release.state === "scheduled";
                      return (
                        <div class="row" style="justify-content: space-between; align-items: center;">
                          <span class={`pill ${scheduled ? "scheduled" : "open"}`}>
                            {scheduled
                              ? t("content.library.scheduledScope", {
                                  scope,
                                  date: formatDay(release.opens_at)
                                })
                              : scope}
                          </span>
                          <button
                            class="btn quiet"
                            type="button"
                            disabled={busy === item.id}
                            onClick={() => {
                              const confirmKey = scheduled
                                ? "content.library.cancelScheduledConfirm"
                                : "content.library.removeFromReviewConfirm";
                              if (!confirm(t(confirmKey, { title: item.title, scope }))) return;
                              void run(item.id, async () => {
                                await updateReleaseState({
                                  release_id: release.release_id,
                                  next_state: release.state === "scheduled" ? "draft" : "closed",
                                  reason: scheduled
                                    ? "Cancelled scheduled access from the Content screen."
                                    : "Removed from Review from the Content screen."
                                });
                                setNotice(t(
                                  scheduled
                                    ? "content.library.scheduledCancelled"
                                    : "content.library.removedFromReview",
                                  { title: item.title, scope }
                                ));
                              });
                            }}
                          >
                            {busy === item.id
                              ? t("content.library.working")
                              : release.state === "scheduled"
                                ? t("content.library.cancelScheduled")
                                : t("content.library.removeFromReview")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {failure ? <p class="error-text" role="alert">{failure}</p> : null}
                {failure === t("content.library.content_item_has_activity_history") ? (
                  <ForceDeleteControl
                    busy={busy === item.id}
                    warningKey="content.library.forceDeleteWarning"
                    onConfirm={() => void run(item.id, async () => {
                      await deleteContentItem(item.id, { force: true });
                      setNotice(t("content.library.deleted", { title: item.title }));
                      await refreshContext();
                    }, t("content.library.deleteFailed"))}
                  />
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}

      {unmanagedItems.length ? (
        <div class="stack">
          <div>
            <h3>{t("content.library.unmanagedTitle")}</h3>
            <p class="hint">{t("content.library.unmanagedHint")}</p>
          </div>
          {unmanagedItems.map((item) => {
            const itemReleases = releasesByItem.get(item.id) ?? [];
            const failure = itemError[item.id];
            return (
              <div class="card row" style="justify-content: space-between; align-items: center;" key={item.id}>
                <span>{item.title}</span>
                <div class="stack" style="align-items: flex-end; gap: 0.3rem;">
                  <button
                    class="btn quiet"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      if (!confirm(t("content.library.deleteConfirm", { title: item.title, releases: itemReleases.length }))) return;
                      void run(item.id, async () => {
                        await deleteContentItem(item.id);
                        setNotice(t("content.library.deleted", { title: item.title }));
                        await refreshContext();
                      }, t("content.library.deleteFailed"));
                    }}
                  >
                    {busy === item.id ? t("content.library.working") : t("content.library.delete")}
                  </button>
                  {failure ? <p class="error-text" role="alert">{failure}</p> : null}
                  {failure === t("content.library.content_item_has_activity_history") ? (
                    <ForceDeleteControl
                      busy={busy === item.id}
                      warningKey="content.library.forceDeleteWarning"
                      onConfirm={() => void run(item.id, async () => {
                        await deleteContentItem(item.id, { force: true });
                        setNotice(t("content.library.deleted", { title: item.title }));
                        await refreshContext();
                      }, t("content.library.deleteFailed"))}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
