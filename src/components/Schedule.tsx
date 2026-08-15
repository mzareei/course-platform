// Class days — one entry per class meeting.
//
// Nothing in the v2 app could create one, so the course had a single seeded
// session and "tie a lecture to a class day" offered exactly one irrelevant
// option. Everything that belongs to a class meeting — live questions, the
// end-of-class quiz, reflections — hangs off a row created here.
//
// Module scope, per docs/07-pitfalls.md #4.
import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  listSessions, cancelSession, deleteSession, listSections,
  type ClassSession, type CourseSection
} from "../api/schedule";
import { createClass } from "../api/classes";
import { contentLibrary, type ContentItem } from "../api/content";
import { canReleaseToReview } from "../api/contentVisibility";
import { StatusPill } from "./StatusPill";
import { ForceDeleteControl } from "./ForceDeleteControl";
import { SessionEditor } from "./SessionEditor";
import { ConfirmButton } from "./ConfirmButton";
import { refreshContext } from "../state/session";
import { t, formatDay, apiErrorText } from "../i18n";
import { scopedSessions } from "../features/scope/filters";
import { activeSectionId, isAllGroups } from "../state/scope";

const RUNNABLE = ["planned", "open", "live", "paused", "continued"];
const EDITABLE_SESSION_STATES = ["planned", "open", "continued"];

const dayLabel = (v: string) => formatDay(v, { weekday: "short", month: "short", day: "numeric" });

export function Schedule() {
  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
  const [sections, setSections] = useState<CourseSection[] | null>(null);
  const [lectures, setLectures] = useState<ContentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [forceDeleteSessionId, setForceDeleteSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [contentItemId, setContentItemId] = useState("");

  async function load() {
    try {
      const [s, sec, library] = await Promise.all([listSessions(), listSections(), contentLibrary()]);
      setSessions(s.sessions);
      setSections(sec.sections);
      setLectures(
        library.content_items
          .filter(canReleaseToReview)
          .filter((item) => item.content_type === "lecture")
          .sort((a, b) => a.title.localeCompare(b.title))
      );
      setSectionId((current) =>
        current || sec.sections.find((x) => x.status === "active")?.id || sec.sections[0]?.id || ""
      );
    } catch (e) {
      setError(apiErrorText(e, "schedule.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Keep the "add a class day" group in step with the switcher, including when
  // the professor changes groups while this screen is open.
  useEffect(() => {
    if (activeSectionId.value) setSectionId(activeSectionId.value);
  }, [activeSectionId.value]);

  async function onAdd() {
    setError(null);
    setNotice(null);
    setBusy("add");
    try {
      const { session } = await createClass({
        section_id: sectionId,
        title: title.trim(),
        planned_date: date,
        content_item_id: contentItemId || undefined
      });
      setNotice(t("schedule.added", { title: session.title, date: dayLabel(session.planned_date) }));
      setTitle("");
      setDate("");
      setContentItemId("");
      await load();
      // Home and the student Today screen both read teacher_sessions from the
      // auth context, so a new class day is invisible until that is refetched.
      await refreshContext();
    } catch (e) {
      setError(apiErrorText(e, "schedule.addFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onCancel(session: ClassSession) {
    setError(null);
    setNotice(null);
    setBusy(session.session_id);
    try {
      await cancelSession(session.session_id);
      setNotice(t("schedule.cancelled", { title: session.title }));
      await load();
      await refreshContext();
    } catch (e) {
      setError(apiErrorText(e, "schedule.addFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(session: ClassSession, force = false) {
    setError(null);
    setNotice(null);
    setBusy(session.session_id);
    try {
      await deleteSession(session.session_id, { force });
      setNotice(t("schedule.deleted", { title: session.title }));
      setForceDeleteSessionId(null);
      await load();
      await refreshContext();
    } catch (e) {
      const message = apiErrorText(e, "schedule.deleteFailed");
      setError(message);
      setForceDeleteSessionId(
        message.includes("recorded live-question activity") ? session.session_id : null
      );
    } finally {
      setBusy(null);
    }
  }

  async function onSessionSaved(session: ClassSession) {
    setEditingSessionId(null);
    setNotice(t("schedule.saved", { title: session.title }));
    await load();
    await refreshContext();
  }

  if (error && !sessions) return <p class="error-text" role="alert">{error}</p>;
  if (!sessions || !sections || !lectures) {
    return <div class="empty-state"><p>{t("schedule.loading")}</p></div>;
  }

  const active = activeSectionId.value;
  // A new class day belongs to the group you are looking at. Offering the
  // others here would let you file it against a group that is not on screen.
  const usableSections = sections
    .filter((s) => ["planned", "active"].includes(s.status))
    .filter((s) => active === null || s.id === active);
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const visible = scopedSessions(sessions, active);

  return (
    <div class="stack">
      <div>
        <h2>{t("schedule.title")}</h2>
        <p class="hint">{t("schedule.body")}</p>
      </div>

      {notice ? <p class="hint" role="status">{notice}</p> : null}
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {!visible.length ? (
        <div class="empty-state card">
          <h3>{t("schedule.emptyTitle")}</h3>
          <p>{t("schedule.emptyBody")}</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>{t("schedule.col.when")}</th>
                <th>{t("schedule.col.what")}</th>
                {isAllGroups.value ? <th>{t("schedule.col.group")}</th> : null}
                <th>{t("schedule.col.lecture")}</th>
                <th>{t("grades.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((session) => {
                const section = sectionById.get(session.section_id);
                const editable =
                  EDITABLE_SESSION_STATES.includes(session.state) && session.actual_start_at == null;
                return (
                  <Fragment key={session.session_id}>
                    <tr>
                      <td>{dayLabel(session.planned_date)}</td>
                      <td>{session.title}</td>
                      {isAllGroups.value
                        ? <td>{section?.section_code ?? session.section_code ?? "—"}</td>
                        : null}
                      <td>{session.content_title || t("schedule.noLecture")}</td>
                      <td><StatusPill state={session.state} /></td>
                      <td>
                        <div class="row" style="gap: 0.3rem;">
                          {RUNNABLE.includes(session.state) ? (
                            <a class="btn quiet" href={`/teach/run/${session.session_id}`}>
                              {t("schedule.run")}
                            </a>
                          ) : null}
                          {editable ? (
                            <button
                              class="btn quiet"
                              type="button"
                              onClick={() => setEditingSessionId(session.session_id)}
                            >
                              {t("schedule.edit")}
                            </button>
                          ) : null}
                          {session.state === "planned" ? (
                            <ConfirmButton
                              label={t("schedule.cancel")}
                              confirmLabel={t("app.pressAgainConfirm")}
                              className="btn quiet"
                              disabled={busy === session.session_id}
                              onConfirm={() => void onCancel(session)}
                            />
                          ) : null}
                          {["planned", "cancelled", "closed"].includes(session.state) ? (
                            <ConfirmButton
                              label={t("schedule.delete")}
                              confirmLabel={t("app.pressAgainConfirm")}
                              className="btn quiet"
                              disabled={busy === session.session_id}
                              onConfirm={() => void onDelete(session)}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {editingSessionId === session.session_id ? (
                      <tr>
                        <td colSpan={isAllGroups.value ? 6 : 5}>
                          <SessionEditor
                            session={session}
                            sections={sections}
                            lectures={lectures}
                            onSaved={(saved) => void onSessionSaved(saved)}
                            onCancel={() => setEditingSessionId(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {forceDeleteSessionId === session.session_id ? (
                      <tr>
                        <td colSpan={isAllGroups.value ? 6 : 5}>
                          <ForceDeleteControl
                            busy={busy === session.session_id}
                            warningKey="schedule.forceDeleteWarning"
                            onConfirm={() => void onDelete(session, true)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div class="card">
        <h3>{t("schedule.add")}</h3>
        {!usableSections.length ? (
          <p class="hint">{t("schedule.noGroups")}</p>
        ) : (
          <>
            <div class="grid-2">
              <label class="field">
                {t("schedule.date")}
                <input
                  type="date"
                  value={date}
                  onInput={(e) => setDate((e.target as HTMLInputElement).value)}
                />
              </label>
              {isAllGroups.value ? (
                <label class="field">
                  {t("schedule.group")}
                  <select
                    value={sectionId}
                    onChange={(e) => setSectionId((e.target as HTMLSelectElement).value)}
                  >
                    {usableSections.map((s) => (
                      <option value={s.id}>{s.section_name || s.section_code}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label class="field">
                {t("schedule.lecture")}
                <select
                  value={contentItemId}
                  onChange={(e) => {
                    const nextId = (e.target as HTMLSelectElement).value;
                    const previousTitle = lectures.find((item) => item.id === contentItemId)?.title || "";
                    const nextTitle = lectures.find((item) => item.id === nextId)?.title || "";
                    setContentItemId(nextId);
                    setTitle((current) =>
                      !current.trim() || current === previousTitle ? nextTitle : current
                    );
                  }}
                >
                  <option value="">{t("schedule.lectureNone")}</option>
                  {lectures.map((lecture) => (
                    <option value={lecture.id}>{lecture.title}</option>
                  ))}
                </select>
                <span class="hint">{t("schedule.lectureHint")}</span>
              </label>
              <label class="field" style="grid-column: 1 / -1;">
                {t("schedule.classTitle")}
                <input
                  type="text"
                  value={title}
                  onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
                />
                <span class="hint">{t("schedule.titleHint")}</span>
              </label>
            </div>
            <div class="row">
              <button
                class="btn primary"
                type="button"
                disabled={busy === "add" || !date || !title.trim() || !sectionId}
                onClick={onAdd}
              >
                {busy === "add" ? t("schedule.adding") : t("schedule.add")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
