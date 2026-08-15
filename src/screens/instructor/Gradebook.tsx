// I4 Gradebook — semester matrix (read) and per-class review.
//
// There is no weights tab. A class is worth one grade, every class counts the
// same, and the course total is their plain average — so there is no category
// weighting left to display or configure.
//
// Adjustments and locking stay in the current app until the Advanced drawer
// arrives.
import { useEffect, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { callFn } from "../../api/client";
import type { GradebookSummary, RosterOverview } from "../../api/types";
import { StatusPill } from "../../components/StatusPill";
import { StudentNoteComposer } from "../../components/StudentNoteComposer";
import { StudentNoteHistory } from "../../components/StudentNoteHistory";
import { context } from "../../state/session";
import { classPulseRounds, type PulseRoundReview } from "../../api/pulse";
import { classQuizSummary, type QuizAttemptSummary } from "../../api/quiz";
import { classReflections, type ClassReflection } from "../../api/reflection";
import { t, locale, formatDay, apiErrorText } from "../../i18n";
import { scopedScoreProfileIds, scopedSessions } from "../../features/scope/filters";
import { activeSectionId } from "../../state/scope";

const SUBMITTED_STATES = ["submitted", "late"];

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function timeOf(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
}

/**
 * Tab B — what actually happened in one class: every question pushed to the
 * room with its distribution, how the quiz went, and every reflection.
 *
 * Module scope on purpose. A component defined inside another component gets a
 * new identity on each render and remounts its whole subtree — see
 * docs/07-pitfalls.md #4.
 */
function PerClassReview() {
  const sessions = scopedSessions(
    context.value?.teacher_sessions ?? [],
    activeSectionId.value
  ).reverse();
  // Default to the most recent class that has actually been held; a planned
  // session in the future has nothing to review.
  const firstHeld = sessions.find((s) => s.state !== "planned") ?? sessions[0];
  const [sessionId, setSessionId] = useState(firstHeld?.session_id ?? "");
  const [rounds, setRounds] = useState<PulseRoundReview[] | null>(null);
  const [attempts, setAttempts] = useState<QuizAttemptSummary[] | null>(null);
  const [reflections, setReflections] = useState<ClassReflection[] | null>(null);
  const [roster, setRoster] = useState<RosterOverview["roster"] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [noteRefreshKey, setNoteRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    callFn<RosterOverview>("course-roster-management")
      .then(({ roster: loadedRoster }) => {
        if (!cancelled) {
          setRoster(loadedRoster);
          setRosterError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setRosterError(apiErrorText(e, "studentNotes.rosterLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setRounds(null);
    setAttempts(null);
    setReflections(null);
    setError(null);
    Promise.all([
      classPulseRounds(sessionId),
      classQuizSummary(sessionId),
      classReflections(sessionId)
    ])
      .then(([pulse, quiz, reflection]) => {
        if (cancelled) return;
        setRounds(pulse.rounds);
        setAttempts(quiz.attempts);
        setReflections(reflection.reflections);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(apiErrorText(e, "gradebook.perClass.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    setSelectedStudentId("");
  }, [sessionId]);

  // Changing groups must not leave the picker pointing at a class that is no
  // longer listed — the panels below would keep showing the old group's data.
  useEffect(() => {
    if (sessionId && sessions.some((session) => session.session_id === sessionId)) return;
    const firstHeldNow = sessions.find((session) => session.state !== "planned") ?? sessions[0];
    setSessionId(firstHeldNow?.session_id ?? "");
  }, [activeSectionId.value, sessions.length]);

  if (!sessions.length) {
    return (
      <div class="empty-state card">
        <h3>{t("gradebook.perClass.noSessions")}</h3>
        <p>{t("gradebook.perClass.noSessionsBody")}</p>
      </div>
    );
  }

  const submitted = (attempts ?? []).filter((a) => SUBMITTED_STATES.includes(a.status));
  const scored = submitted.filter((a) => typeof a.score_percent === "number");
  const average = scored.length
    ? Math.round(scored.reduce((sum, a) => sum + Number(a.score_percent), 0) / scored.length)
    : 0;
  const selectedSession = sessions.find((session) => session.session_id === sessionId);
  const sessionStudents = (roster ?? []).filter((person) =>
    (person.sections ?? []).some((section) =>
      section.section_id === selectedSession?.section_id && section.role === "student"
    )
  );
  const selectedStudent = sessionStudents.find((student) => student.profile_id === selectedStudentId);

  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between; align-items: flex-end; gap: 1rem;">
        <label class="stack" style="gap: 0.3rem; max-width: 26rem; flex: 1;">
          <span class="hint">{t("gradebook.perClass.pick")}</span>
          <select
            value={sessionId}
            onChange={(e) => setSessionId((e.target as HTMLSelectElement).value)}
          >
            {sessions.map((s) => (
              <option value={s.session_id}>
                {s.planned_date ? `${formatDay(s.planned_date)} · ` : ""}
                {s.title || `#${s.sequence_number}`}
                {s.section_code ? ` · ${s.section_code}` : ""}
              </option>
            ))}
          </select>
        </label>
        {sessionId ? (
          <a class="btn primary" href={`/teach/class/${sessionId}`}>
            {t("gradebook.perClass.openRecord")}
          </a>
        ) : null}
      </div>

      {error ? (
        <p class="error-text" role="alert">{error}</p>
      ) : rounds === null ? (
        <div class="empty-state"><p>{t("gradebook.perClass.loading")}</p></div>
      ) : (
        <>
          <section class="card stack">
            <h2>{t("studentNotes.title")}</h2>
            {rosterError ? (
              <p class="error-text" role="alert">{rosterError}</p>
            ) : roster === null ? (
              <p class="hint" role="status">{t("studentNotes.loading")}</p>
            ) : !sessionStudents.length ? (
              <p class="hint">{t("studentNotes.noStudents")}</p>
            ) : (
              <>
                <label class="field" style="max-width: 26rem;">
                  {t("studentNotes.pickStudent")}
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId((e.target as HTMLSelectElement).value)}
                  >
                    <option value="">{t("studentNotes.pickStudent")}</option>
                    {sessionStudents.map((student) => (
                      <option value={student.profile_id}>{student.full_name}</option>
                    ))}
                  </select>
                </label>
                {selectedStudent ? (
                  <div class="stack">
                    <h3>{t("studentNotes.for", { name: selectedStudent.full_name })}</h3>
                    <StudentNoteComposer
                      classSessionId={sessionId}
                      profileId={selectedStudentId}
                      onCreated={() => setNoteRefreshKey((key) => key + 1)}
                    />
                    <h3>{t("studentNotes.history")}</h3>
                    <StudentNoteHistory
                      classSessionId={sessionId}
                      profileId={selectedStudentId}
                      refreshKey={noteRefreshKey}
                    />
                  </div>
                ) : <p class="hint">{t("studentNotes.pickStudentBody")}</p>}
              </>
            )}
          </section>

          <section class="card stack">
            <h2>{t("gradebook.perClass.questions")}</h2>
            {!rounds.length ? (
              <p class="hint">{t("gradebook.perClass.noQuestions")}</p>
            ) : (
              rounds.map((round, i) => (
                <div class="stack" style="gap: 0.35rem;">
                  <h3>
                    {i + 1}. {round.text}
                  </h3>
                  {round.distribution.map((option) => {
                    const total = Math.max(1, round.answered);
                    const share = Math.round((option.count / total) * 100);
                    const isCorrect = option.key === round.correct_key;
                    return (
                      <div class={`pulse-bar ${isCorrect ? "correct" : ""}`}>
                        <div
                          class="pulse-bar-fill"
                          style={`width: ${round.answered ? share : 0}%`}
                        />
                        <span class="pulse-bar-label">
                          {option.text}
                          {isCorrect ? ` ✓ ${t("gradebook.perClass.correctMark")}` : ""}
                        </span>
                        <span class="pulse-bar-count">{option.count}</span>
                      </div>
                    );
                  })}
                  <p class="hint">
                    {t("gradebook.perClass.correctOf", {
                      correct: round.correct,
                      answered: round.answered,
                      enrolled: round.enrolled
                    })}
                  </p>
                </div>
              ))
            )}
          </section>

          <section class="card stack">
            <h2>{t("gradebook.perClass.quiz")}</h2>
            {!(attempts ?? []).length ? (
              <p class="hint">{t("gradebook.perClass.noQuiz")}</p>
            ) : (
              <>
                <p class="hint">
                  {t("gradebook.perClass.quizHeadline", {
                    submitted: submitted.length,
                    started: (attempts ?? []).length,
                    average
                  })}
                </p>
                <div class="table-scroll">
                  <table class="data">
                    <thead>
                      <tr>
                        <th>{t("gradebook.col.student")}</th>
                        <th>{t("grades.status")}</th>
                        <th>{t("gradebook.col.score")}</th>
                        <th>{t("gradebook.col.submittedAt")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(attempts ?? []).map((attempt) => (
                        <tr>
                          <td>{attempt.name}</td>
                          <td><StatusPill state={attempt.status} /></td>
                          <td class="num">
                            {typeof attempt.score_percent === "number" ? `${Math.round(attempt.score_percent)}%` : "—"}
                          </td>
                          <td class="num">{timeOf(attempt.submitted_at)}</td>
                          <td>
                            <button
                              class="btn quiet"
                              type="button"
                              onClick={() => setSelectedStudentId(attempt.profile_id)}
                            >
                              {t("studentNotes.open")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section class="card stack">
            <h2>{t("gradebook.perClass.reflections")}</h2>
            {!(reflections ?? []).length ? (
              <p class="hint">{t("gradebook.perClass.noReflections")}</p>
            ) : (
              <>
                <p class="hint">
                  {t("gradebook.perClass.reflectionCount", { count: (reflections ?? []).length })}
                </p>
                {(reflections ?? []).map((reflection) => (
                  <div class="card muted stack" style="gap: 0.3rem;">
                    <div class="row" style="justify-content: space-between;">
                      <strong>{reflection.name}</strong>
                      <span class="hint">
                        {t("gradebook.perClass.words", { count: countWords(reflection.one_thing) })}
                        {" · "}
                        {timeOf(reflection.created_at)}
                      </span>
                    </div>
                    <p>{reflection.one_thing}</p>
                  </div>
                ))}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function Gradebook() {
  const [data, setData] = useState<GradebookSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The tab lives in the URL so back/reload keep the professor's place.
  const { query } = useLocation();
  const tab: "matrix" | "perClass" = query.tab === "perClass" ? "perClass" : "matrix";

  useEffect(() => {
    callFn<GradebookSummary>("course-gradebook-summary")
      .then(setData)
      .catch((e: unknown) => setError(apiErrorText(e, "gradebook.loadFailed")));
  }, []);

  if (error) {
    return (
      <div class="card">
        <h2>{t("gradebook.title")}</h2>
        <p class="error-text">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <div class="empty-state"><p>{t("gradebook.loading")}</p></div>;
  }

  // Group scores by student for the matrix.
  // Students are chosen by the group their scores are in; each chosen student
  // then keeps all of their scores, including any older row with no section_id,
  // so a row is never half-built.
  const visibleProfileIds = scopedScoreProfileIds(data.scores, activeSectionId.value);
  const students = new Map<
    string,
    { name: string; email: string; scores: Map<string, GradebookSummary["scores"][number]> }
  >();
  for (const score of data.scores) {
    const key = score.profile_id;
    if (!visibleProfileIds.has(key)) continue;
    if (!students.has(key)) {
      students.set(key, {
        name: score.student_name ?? t("gradebook.col.student"),
        email: score.institutional_email ?? "",
        scores: new Map()
      });
    }
    students.get(key)!.scores.set(score.gradebook_item_id, score);
  }
  const items = data.items;

  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between;">
        <div>
          <p class="eyebrow">{t("gradebook.eyebrow")}</p>
          <h1>{t("gradebook.title")}</h1>
        </div>
        <nav class="nav-tabs" aria-label={t("gradebook.tabsLabel")} style="flex: 0 0 auto;">
          <a href="/teach/grades" aria-current={tab === "matrix" ? "page" : undefined}>
            {t("gradebook.tab.semester")}
          </a>
          <a href="/teach/grades?tab=perClass" aria-current={tab === "perClass" ? "page" : undefined}>
            {t("gradebook.tab.perClass")}
          </a>
        </nav>
      </div>

      {(() => {
        // Posting is automatic now, so this no longer means "you forgot" — it
        // means a write failed, which is worth saying out loud rather than
        // leaving a class silently ungraded. Opening its record posts it.
        const postedSessionIds = new Set(
          items.map((item) => item.class_session_id).filter(Boolean)
        );
        const unposted = scopedSessions(
          context.value?.teacher_sessions ?? [],
          activeSectionId.value
        ).filter(
          (session) => session.state === "closed" && !postedSessionIds.has(session.session_id)
        );
        return unposted.length ? (
          <p class="hint" role="status">
            {t("gradebook.unpostedNudge", {
              titles: unposted.map((session) => session.title).join(" · ")
            })}
          </p>
        ) : null;
      })()}

      {tab === "perClass" ? (
        <PerClassReview />
      ) : students.size === 0 ? (
        <div class="empty-state card">
          <h3>{t("gradebook.emptyTitle")}</h3>
          <p>{t("gradebook.emptyBody")}</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>{t("gradebook.col.student")}</th>
                {items.map((item) => (
                  <th title={item.title}>
                    {item.title.length > 14 ? item.title.slice(0, 13) + "…" : item.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...students.values()].map((student) => (
                <tr>
                  <td>
                    {student.name}
                    <br />
                    <span class="hint" style="font-size: 0.78rem;">{student.email}</span>
                  </td>
                  {items.map((item) => {
                    const score = student.scores.get(item.id);
                    return (
                      <td class="num">
                        {score && typeof score.score_final === "number"
                          ? score.score_final
                          : score
                            ? <StatusPill state={score.status} />
                            : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p class="hint">{t("gradebook.perClassNote")}</p>
    </div>
  );
}
