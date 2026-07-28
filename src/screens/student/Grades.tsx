// S4 My Grades — weighted total + per-item rows from course-student-progress.
import { useEffect, useState } from "preact/hooks";
import { callFn } from "../../api/client";
import type { StudentProgress } from "../../api/types";
import { StatusPill } from "../../components/StatusPill";
import { t } from "../../i18n";

export function Grades() {
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const weighted = progress.weighted_summary;
  const percent = weighted?.weighted_course_percent;

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">{t("grades.eyebrow")}</p>
        <h1>{t("grades.title")}</h1>
      </div>

      <div class="card" style="align-items: center; text-align: center;">
        <span class="big-number">{typeof percent === "number" ? `${percent.toFixed(1)}%` : "—"}</span>
        <p class="hint">{t("grades.weightedTotal")}</p>
      </div>

      {weighted?.category_summaries?.length ? (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>{t("grades.category")}</th>
                <th>{t("grades.weight")}</th>
                <th>{t("grades.yourAverage")}</th>
              </tr>
            </thead>
            <tbody>
              {weighted.category_summaries.map((cat) => (
                <tr>
                  <td>{cat.category_name}</td>
                  <td class="num">{cat.category_weight_percent}%</td>
                  <td class="num">
                    {typeof cat.category_average_percent === "number" ? `${cat.category_average_percent.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <h2>{t("grades.recentWork")}</h2>
      {progress.scores.length === 0 ? (
        <div class="empty-state card">
          <h3>{t("grades.emptyTitle")}</h3>
          <p>{t("grades.emptyBody")}</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>{t("grades.item")}</th>
                <th>{t("grades.score")}</th>
                <th>{t("grades.status")}</th>
              </tr>
            </thead>
            <tbody>
              {progress.scores.map((score) => (
                <tr>
                  <td>{score.item_title ?? t("grades.gradedItem")}</td>
                  <td class="num">
                    {typeof score.score_final === "number"
                      ? `${score.score_final} / ${score.max_score ?? 100}`
                      : "—"}
                  </td>
                  <td><StatusPill state={score.status} /></td>
                </tr>
              ))}
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
