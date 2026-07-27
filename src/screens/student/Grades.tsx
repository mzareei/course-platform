// S4 My Grades — weighted total + per-item rows from course-student-progress.
import { useEffect, useState } from "preact/hooks";
import { callFn } from "../../api/client";
import type { StudentProgress } from "../../api/types";
import { StatusPill } from "../../components/StatusPill";

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
        <h2>My Grades</h2>
        <p class="error-text">{error}</p>
      </div>
    );
  }
  if (!progress) return <div class="empty-state"><p>Loading your grades…</p></div>;

  const weighted = progress.weighted_summary;
  const percent = weighted?.weighted_percent;

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">Your standing</p>
        <h1>My Grades</h1>
      </div>

      <div class="card" style="align-items: center; text-align: center;">
        <span class="big-number">{typeof percent === "number" ? `${percent.toFixed(1)}%` : "—"}</span>
        <p class="hint">Weighted course total so far</p>
      </div>

      {weighted?.categories?.length ? (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>Category</th>
                <th>Weight</th>
                <th>Your average</th>
              </tr>
            </thead>
            <tbody>
              {weighted.categories.map((cat) => (
                <tr>
                  <td>{cat.name}</td>
                  <td class="num">{cat.weight_percent}%</td>
                  <td class="num">
                    {typeof cat.average_percent === "number" ? `${cat.average_percent.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <h2>Recent work</h2>
      {progress.scores.length === 0 ? (
        <div class="empty-state card">
          <h3>No grades yet</h3>
          <p>Quiz scores and class participation appear here after your first graded class.</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>Item</th>
                <th>Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {progress.scores.map((score) => (
                <tr>
                  <td>{score.item_title ?? "Graded item"}</td>
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
          <h3>Worth revisiting</h3>
          {progress.recommendations.slice(0, 3).map((rec) => (
            <p class="hint">• {rec.message ?? rec.title ?? rec.reason}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
