// Class days — one entry per class meeting.
//
// Nothing in the v2 app could create one, so the course had a single seeded
// session and "tie a lecture to a class day" offered exactly one irrelevant
// option. Everything that belongs to a class meeting — live questions, the
// end-of-class quiz, reflections — hangs off a row created here.
//
// Module scope, per docs/07-pitfalls.md #4.
import { useEffect, useState } from "preact/hooks";
import {
  listSessions, createSession, cancelSession, listSections,
  type ClassSession, type CourseSection
} from "../api/schedule";
import { StatusPill } from "./StatusPill";
import { refreshContext } from "../state/session";
import { t, formatDay } from "../i18n";

const RUNNABLE = ["planned", "open", "live", "paused", "continued"];

const dayLabel = (v: string) => formatDay(v, { weekday: "short", month: "short", day: "numeric" });

export function Schedule() {
  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
  const [sections, setSections] = useState<CourseSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [sectionId, setSectionId] = useState("");

  async function load() {
    try {
      const [s, sec] = await Promise.all([listSessions(), listSections()]);
      setSessions(s.sessions);
      setSections(sec.sections);
      setSectionId((current) =>
        current || sec.sections.find((x) => x.status === "active")?.id || sec.sections[0]?.id || ""
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("schedule.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onAdd() {
    setError(null);
    setNotice(null);
    setBusy("add");
    try {
      const { session } = await createSession({
        section_id: sectionId,
        title: title.trim(),
        planned_date: date
      });
      setNotice(t("schedule.added", { title: session.title, date: dayLabel(session.planned_date) }));
      setTitle("");
      setDate("");
      await load();
      // Home and the student Today screen both read teacher_sessions from the
      // auth context, so a new class day is invisible until that is refetched.
      await refreshContext();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("schedule.addFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onCancel(session: ClassSession) {
    if (!confirm(t("schedule.cancelConfirm", { title: session.title }))) return;
    setError(null);
    setNotice(null);
    setBusy(session.session_id);
    try {
      await cancelSession(session.session_id);
      setNotice(t("schedule.cancelled", { title: session.title }));
      await load();
      await refreshContext();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("schedule.addFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (error && !sessions) return <p class="error-text" role="alert">{error}</p>;
  if (!sessions || !sections) {
    return <div class="empty-state"><p>{t("schedule.loading")}</p></div>;
  }

  const usableSections = sections.filter((s) => ["planned", "active"].includes(s.status));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const visible = sessions.filter((s) => s.state !== "cancelled");

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
                <th>{t("schedule.col.group")}</th>
                <th>{t("grades.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((session) => {
                const section = sectionById.get(session.section_id);
                return (
                  <tr>
                    <td>{dayLabel(session.planned_date)}</td>
                    <td>{session.title}</td>
                    <td>{section?.section_code ?? session.section_code ?? "—"}</td>
                    <td><StatusPill state={session.state} /></td>
                    <td>
                      <div class="row" style="gap: 0.3rem;">
                        {RUNNABLE.includes(session.state) ? (
                          <a class="btn quiet" href={`/teach/run/${session.session_id}`}>
                            {t("schedule.run")}
                          </a>
                        ) : null}
                        {session.state === "planned" ? (
                          <button
                            class="btn quiet"
                            type="button"
                            disabled={busy === session.session_id}
                            onClick={() => void onCancel(session)}
                          >
                            {t("schedule.cancel")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
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
