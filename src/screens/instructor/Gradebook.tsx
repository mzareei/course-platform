// I4 Gradebook — Phase 1: semester matrix (read) + weights (read).
// Tab B per-class review lands in Phase 4; adjustments stay in the current app
// until the Advanced drawer arrives.
import { useEffect, useState } from "preact/hooks";
import { callFn } from "../../api/client";
import type { GradebookSummary } from "../../api/types";
import { StatusPill } from "../../components/StatusPill";

export function Gradebook() {
  const [data, setData] = useState<GradebookSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"matrix" | "weights">("matrix");

  useEffect(() => {
    callFn<GradebookSummary>("course-gradebook-summary")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div class="card">
        <h2>Gradebook</h2>
        <p class="error-text">{error}</p>
      </div>
    );
  }
  if (!data) return <div class="empty-state"><p>Loading the gradebook…</p></div>;

  // Group scores by student for the matrix.
  const students = new Map<string, { name: string; email: string; scores: Map<string, GradebookSummary["scores"][number]> }>();
  for (const score of data.scores) {
    const key = score.profile_id;
    if (!students.has(key)) {
      students.set(key, {
        name: score.student_name ?? "Student",
        email: score.student_email ?? "",
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
          <p class="eyebrow">Assessment</p>
          <h1>Gradebook</h1>
        </div>
        <div class="nav-tabs" role="tablist" style="flex: 0 0 auto;">
          <a href="#" role="tab" aria-current={tab === "matrix" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("matrix"); }}>Semester</a>
          <a href="#" role="tab" aria-current={tab === "weights" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("weights"); }}>Weights</a>
        </div>
      </div>

      {tab === "weights" ? (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr><th>Category</th><th>Weight</th><th>Drop lowest</th><th>Status</th></tr>
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
          <h3>No grades yet</h3>
          <p>Scores flow in automatically as students submit graded activities.</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>Student</th>
                {items.map((item) => <th title={item.title}>{item.title.length > 14 ? item.title.slice(0, 13) + "…" : item.title}</th>)}
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

      <p class="hint">
        Per-class review (pulse answers, quiz stats, and reflection texts in one place) arrives in
        Phase 4. Adjustments and locking stay in the current course app until then.
      </p>
    </div>
  );
}
