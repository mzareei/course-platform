// I4 Gradebook — semester matrix (read), weights (read), and per-class review.
// Adjustments and locking stay in the current app until the Advanced drawer
// arrives.
import { useEffect, useState } from "preact/hooks";
import { callFn } from "../../api/client";
import type { GradebookSummary } from "../../api/types";
import { StatusPill } from "../../components/StatusPill";
import { context } from "../../state/session";
import { classPulseRounds, type PulseRoundReview } from "../../api/pulse";
import { classQuizSummary, type QuizAttemptSummary } from "../../api/quiz";
import { classReflections, type ClassReflection } from "../../api/reflection";
import { t, locale } from "../../i18n";

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
  const sessions = [...(context.value?.teacher_sessions ?? [])].reverse();
  // Default to the most recent class that has actually been held; a planned
  // session in the future has nothing to review.
  const firstHeld = sessions.find((s) => s.state !== "planned") ?? sessions[0];
  const [sessionId, setSessionId] = useState(firstHeld?.session_id ?? "");
  const [rounds, setRounds] = useState<PulseRoundReview[] | null>(null);
  const [attempts, setAttempts] = useState<QuizAttemptSummary[] | null>(null);
  const [reflections, setReflections] = useState<ClassReflection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) setError(e.message || t("gradebook.perClass.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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

  return (
    <div class="stack">
      <label class="stack" style="gap: 0.3rem; max-width: 26rem;">
        <span class="hint">{t("gradebook.perClass.pick")}</span>
        <select
          value={sessionId}
          onChange={(e) => setSessionId((e.target as HTMLSelectElement).value)}
        >
          {sessions.map((s) => (
            <option value={s.session_id}>
              {s.planned_date ? `${new Date(s.planned_date).toLocaleDateString(locale())} · ` : ""}
              {s.title || `#${s.sequence_number}`}
              {s.section_code ? ` · ${s.section_code}` : ""}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p class="error-text" role="alert">{error}</p>
      ) : rounds === null ? (
        <div class="empty-state"><p>{t("gradebook.perClass.loading")}</p></div>
      ) : (
        <>
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
  const [tab, setTab] = useState<"matrix" | "perClass" | "weights">("matrix");

  useEffect(() => {
    callFn<GradebookSummary>("course-gradebook-summary")
      .then(setData)
      .catch((e: Error) => setError(e.message));
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
  const students = new Map<
    string,
    { name: string; email: string; scores: Map<string, GradebookSummary["scores"][number]> }
  >();
  for (const score of data.scores) {
    const key = score.profile_id;
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
        <div class="nav-tabs" role="tablist" style="flex: 0 0 auto;">
          <a href="#" role="tab" aria-current={tab === "matrix" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("matrix"); }}>
            {t("gradebook.tab.semester")}
          </a>
          <a href="#" role="tab" aria-current={tab === "perClass" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("perClass"); }}>
            {t("gradebook.tab.perClass")}
          </a>
          <a href="#" role="tab" aria-current={tab === "weights" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("weights"); }}>
            {t("gradebook.tab.weights")}
          </a>
        </div>
      </div>

      {tab === "perClass" ? (
        <PerClassReview />
      ) : tab === "weights" ? (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>{t("grades.category")}</th>
                <th>{t("grades.weight")}</th>
                <th>{t("gradebook.col.dropLowest")}</th>
                <th>{t("grades.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((cat) => (
                <tr>
                  <td>{cat.name}</td>
                  <td class="num">{cat.weight_percent}%</td>
                  <td class="num">{cat.drop_lowest_count}</td>
                  <td><StatusPill state={cat.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
