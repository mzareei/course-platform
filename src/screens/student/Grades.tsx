// S4 My Grades — one grade per class, each one openable into the arithmetic
// that produced it.
//
// The breakdown is the point of this screen, not a detail hidden behind it. A
// student looking at a number they did not expect should be able to find the
// answer here rather than by asking; the professor sees exactly the same
// arithmetic on the class record, computed by the same function.
import { useEffect, useState } from "preact/hooks";
import { callFn } from "../../api/client";
import type { ClassGrade, StudentProgress } from "../../api/types";
import { t, formatDay } from "../../i18n";

function grade(value: number | null) {
  return value === null ? "—" : String(Math.round(value * 10) / 10);
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 10) / 10}%`;
}

/**
 * How this class grade was reached, step by step — the student's copy of the
 * professor's breakdown, minus the override audit trail, which is the
 * professor's record rather than theirs.
 */
function Breakdown({ row }: { row: ClassGrade }) {
  return (
    <div class="grade-breakdown">
      <ol>
        <li>
          {t("classRecord.breakdown.pulse", {
            correct: row.pulse_correct,
            total: row.pulse_total,
            accuracy: percent(row.pulse_accuracy_percent),
            weight: row.pulse_weight_percent
          })}
        </li>
        <li>
          {t("classRecord.breakdown.quiz", {
            correct: row.quiz_correct,
            total: row.quiz_total,
            accuracy: percent(row.quiz_accuracy_percent),
            weight: row.quiz_weight_percent
          })}
        </li>
        <li>{t("classRecord.breakdown.raw", { raw: percent(row.raw_score_percent) })}</li>
        <li>
          {t("classRecord.breakdown.scaled", {
            raw: percent(row.raw_score_percent),
            threshold: row.mastery_threshold_percent,
            scaled: grade(row.scaled_grade)
          })}
          {row.capped ? ` · ${t("classRecord.breakdown.capped")}` : ""}
        </li>
        <li>
          {row.penalty_applied
            ? t("classRecord.breakdown.penaltyApplied", { penalty: row.penalty_percent })
            : t("classRecord.breakdown.penaltyNone")}
        </li>
        <li class="grade-breakdown-result">
          {t("classRecord.breakdown.calculated", { grade: grade(row.calculated_grade) })}
        </li>
        {row.adjusted ? (
          <li class="grade-breakdown-result">
            {t("grades.breakdown.adjusted", { grade: grade(row.grade) })}
            {row.adjustment_reason ? (
              <>
                {" — "}
                <em>{row.adjustment_reason}</em>
              </>
            ) : null}
          </li>
        ) : null}
      </ol>
    </div>
  );
}

export function Grades() {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    callFn<StudentProgress>("course-student-progress")
      .then(setProgress)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div class="card">
        <h2>{t("grades.title")}</h2>
        <p class="error-text">{error}</p>
      </div>
    );
  }
  if (!progress) {
    return <div class="empty-state"><p>{t("grades.loading")}</p></div>;
  }

  const classGrades = progress.class_grades ?? [];
  const coursePercent = progress.course_summary?.course_percent ?? null;
  const rule = progress.grading_rule;

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">{t("grades.eyebrow")}</p>
        <h1>{t("grades.title")}</h1>
      </div>

      <div class="card" style="align-items: center; text-align: center;">
        <span class="big-number">
          {typeof coursePercent === "number" ? `${coursePercent.toFixed(1)}%` : "—"}
        </span>
        <p class="hint">
          {t("grades.courseTotal", { count: progress.course_summary?.graded_class_count ?? 0 })}
        </p>
      </div>

      {rule ? (
        <p class="hint">
          {t("classRecord.grading.formula", {
            pulseWeight: rule.pulse_percent,
            quizWeight: rule.quiz_percent,
            threshold: rule.mastery_threshold_percent,
            penalty: rule.missing_submission_penalty_percent
          })}
        </p>
      ) : null}

      <h2>{t("grades.byClass")}</h2>
      {!classGrades.length ? (
        <div class="empty-state card">
          <h3>{t("grades.emptyTitle")}</h3>
          <p>{t("grades.emptyBody")}</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>{t("grades.class")}</th>
                <th class="num">{t("grades.classQuestions")}</th>
                <th class="num">{t("grades.quizQuestions")}</th>
                <th>{t("grades.exitTicket")}</th>
                <th class="num">{t("grades.classGrade")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {classGrades.map((row) => {
                const open = openId === row.class_session_id;
                return [
                  <tr key={row.class_session_id}>
                    <td>
                      {t("grades.classLabel", { number: row.sequence_number })}
                      {row.title ? ` — ${row.title}` : ""}
                      {row.planned_date ? (
                        <>
                          <br />
                          <span class="hint" style="font-size: 0.78rem;">
                            {formatDay(row.planned_date)}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td class="num">{`${row.pulse_correct} / ${row.pulse_total}`}</td>
                    <td class="num">{`${row.quiz_correct} / ${row.quiz_total}`}</td>
                    <td>
                      <span
                        class={`attendance-pill ${row.submission_present ? "present" : "absent"}`}
                      >
                        {row.submission_present
                          ? t("classRecord.submission.submitted")
                          : t("classRecord.submission.missing")}
                      </span>
                    </td>
                    <td class="num"><strong>{grade(row.grade)}</strong></td>
                    <td>
                      <button
                        class="btn quiet"
                        type="button"
                        onClick={() => setOpenId(open ? null : row.class_session_id)}
                      >
                        {open ? t("classRecord.hideDetail") : t("grades.howCalculated")}
                      </button>
                    </td>
                  </tr>,
                  open ? (
                    <tr key={`${row.class_session_id}-detail`}>
                      <td colSpan={6}><Breakdown row={row} /></td>
                    </tr>
                  ) : null
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {progress.recommendations?.length ? (
        <div class="card muted">
          <h3>{t("grades.revisit")}</h3>
          {progress.recommendations.slice(0, 3).map((rec) => (
            <p class="hint">• {rec.message ?? rec.title ?? rec.reason}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
