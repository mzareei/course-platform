// I4 Gradebook — Phase 1: semester matrix (read) + weights (read).
// Tab B per-class review lands in Phase 4; adjustments stay in the current app
// until the Advanced drawer arrives.
import { useEffect, useState } from "preact/hooks";
import { callFn } from "../../api/client";
import type { GradebookSummary } from "../../api/types";
import { StatusPill } from "../../components/StatusPill";
import { t } from "../../i18n";

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
          <p class="eyebrow">{t("gradebook.eyebrow")}</p>
          <h1>{t("gradebook.title")}</h1>
        </div>
        <div class="nav-tabs" role="tablist" style="flex: 0 0 auto;">
          <a href="#" role="tab" aria-current={tab === "matrix" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("matrix"); }}>
            {t("gradebook.tab.semester")}
          </a>
          <a href="#" role="tab" aria-current={tab === "weights" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("weights"); }}>
            {t("gradebook.tab.weights")}
          </a>
        </div>
      </div>

      {tab === "weights" ? (
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
