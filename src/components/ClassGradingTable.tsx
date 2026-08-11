// Table 2 — Class grading.
//
// Every row opens into the arithmetic that produced it. A grade a professor
// cannot explain on the spot is a grade they cannot defend, so the breakdown is
// part of the table rather than something to reconstruct later.
import { useMemo, useState } from "preact/hooks";
import { t, locale } from "../i18n";
import {
  overrideClassGrade,
  type GradingRow,
  type GradingTable as GradingTableData
} from "../api/classRecord";
import { nextSort, sortRows, type SortState } from "../features/classRecord/sorting";
import { formatGrade as grade, formatPercent as percent } from "../features/classRecord/format";

type SortKey =
  | "name"
  | "student_identifier"
  | "pulse_correct"
  | "quiz_correct"
  | "submission"
  | "final_grade";

const naturalDirection: Record<SortKey, "asc" | "desc"> = {
  name: "asc",
  student_identifier: "asc",
  // Worst first: the reason to sort by a score is to find who is struggling.
  pulse_correct: "asc",
  quiz_correct: "asc",
  submission: "asc",
  final_grade: "asc"
};

function stamp(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * The audit trail for one student: how the number was reached, what was
 * overridden, by whom, and why.
 */
function Breakdown({ row }: { row: GradingRow }) {
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
      </ol>

      {row.override_history.length ? (
        <div class="stack" style="gap: 0.35rem;">
          <p class="eyebrow">{t("classRecord.breakdown.overrideHistory")}</p>
          {row.override_history.map((entry, index) => (
            <p class="hint" key={`${entry.created_at}-${index}`}>
              {entry.grade === null
                ? t("classRecord.breakdown.historyCleared", {
                    actor: entry.actor_name,
                    when: stamp(entry.created_at)
                  })
                : t("classRecord.breakdown.historySet", {
                    grade: grade(entry.grade),
                    calculated: grade(entry.calculated_grade),
                    actor: entry.actor_name,
                    when: stamp(entry.created_at)
                  })}
              {" — "}
              <em>{entry.reason}</em>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ClassGradingTable({
  data,
  onData
}: {
  data: GradingTableData;
  onData: (next: GradingTableData) => void;
}) {
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "name", direction: "asc" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftGrade, setDraftGrade] = useState("");
  const [draftReason, setDraftReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const value = (row: GradingRow) => {
      switch (sort.key) {
        case "student_identifier":
          return row.student_identifier;
        case "pulse_correct":
          return row.pulse_accuracy_percent;
        case "quiz_correct":
          return row.quiz_accuracy_percent;
        case "submission":
          return row.submission_present ? 1 : 0;
        case "final_grade":
          return row.final_grade;
        default:
          return row.name;
      }
    };
    return sortRows(data.rows, value, sort.direction);
  }, [data.rows, sort]);

  function header(key: SortKey, label: string, numeric = false) {
    const active = sort.key === key;
    return (
      <th class={numeric ? "num" : undefined}>
        <button
          type="button"
          class={`sort-header ${active ? "active" : ""}`}
          onClick={() => setSort(nextSort(sort, key, naturalDirection[key]))}
          aria-label={t("classRecord.sortBy", { column: label })}
        >
          {label}
          <span aria-hidden="true">{active ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</span>
        </button>
      </th>
    );
  }

  function startEditing(row: GradingRow) {
    setEditingId(row.profile_id);
    setOpenId(row.profile_id);
    setDraftGrade(row.override_grade === null ? "" : String(row.override_grade));
    setDraftReason("");
    setError(null);
  }

  async function saveOverride(profileId: string, clear: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = await overrideClassGrade({
        class_session_id: data.session.class_session_id,
        profile_id: profileId,
        grade: clear ? null : Number(draftGrade),
        reason: draftReason.trim()
      });
      onData(next);
      setEditingId(null);
      setDraftGrade("");
      setDraftReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("classRecord.overrideFailed"));
    } finally {
      setBusy(false);
    }
  }

  const reasonTooShort = draftReason.trim().length < 5;
  const gradeInvalid =
    draftGrade.trim() === "" || !Number.isFinite(Number(draftGrade)) ||
    Number(draftGrade) < 0 || Number(draftGrade) > 100;

  return (
    <section class="card">
      <h2>{t("classRecord.grading.title")}</h2>
      <p class="hint">
        {t("classRecord.grading.formula", {
          pulseWeight: data.weights.pulse_percent,
          quizWeight: data.weights.quiz_percent,
          threshold: data.weights.mastery_threshold_percent,
          penalty: data.weights.missing_submission_penalty_percent
        })}
      </p>
      <p class="hint">
        {t("classRecord.grading.totals", {
          pulses: data.totals.graded_pulse_questions,
          pushed: data.totals.pulse_rounds_pushed,
          quiz: data.totals.quiz_questions
        })}
      </p>

      {error ? <p class="error-text" role="alert">{error}</p> : null}

      <div class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              {header("name", t("classRecord.column.student"))}
              {header("student_identifier", t("classRecord.column.studentId"))}
              {header("pulse_correct", t("classRecord.column.pulseCorrect"), true)}
              <th class="num">{t("classRecord.column.pulseTotal")}</th>
              {header("quiz_correct", t("classRecord.column.quizCorrect"), true)}
              <th class="num">{t("classRecord.column.quizTotal")}</th>
              {header("submission", t("classRecord.column.submission"))}
              {header("final_grade", t("classRecord.column.finalGrade"), true)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = openId === row.profile_id;
              const editing = editingId === row.profile_id;
              return [
                <tr key={row.profile_id}>
                  <td>{row.name}</td>
                  <td>{row.student_identifier || "—"}</td>
                  <td class="num">{row.pulse_correct}</td>
                  <td class="num">{row.pulse_total}</td>
                  <td class="num">{row.quiz_correct}</td>
                  <td class="num">{row.quiz_total}</td>
                  <td>
                    <span class={`attendance-pill ${row.submission_present ? "present" : "absent"}`}>
                      {row.submission_present
                        ? t("classRecord.submission.submitted")
                        : t("classRecord.submission.missing")}
                    </span>
                  </td>
                  <td class="num">
                    {row.override_grade !== null ? (
                      <span>
                        <s class="hint">{grade(row.calculated_grade)}</s>{" "}
                        <strong title={row.override_reason || undefined}>
                          {grade(row.override_grade)}
                        </strong>
                      </span>
                    ) : (
                      <strong>{grade(row.final_grade)}</strong>
                    )}
                  </td>
                  <td>
                    <button
                      class="btn quiet"
                      type="button"
                      onClick={() => setOpenId(open ? null : row.profile_id)}
                    >
                      {open ? t("classRecord.hideDetail") : t("classRecord.showDetail")}
                    </button>
                  </td>
                </tr>,
                open ? (
                  <tr key={`${row.profile_id}-detail`}>
                    <td colSpan={9}>
                      <Breakdown row={row} />
                      {editing ? (
                        <div class="stack" style="gap: 0.5rem; margin-top: 0.6rem;">
                          <div class="row" style="gap: 0.5rem; align-items: center;">
                            <label>
                              {t("classRecord.overrideGrade")}
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.1"
                                value={draftGrade}
                                onInput={(event) =>
                                  setDraftGrade((event.target as HTMLInputElement).value)
                                }
                              />
                            </label>
                          </div>
                          <label>
                            {t("classRecord.overrideReason")}
                            <textarea
                              rows={2}
                              value={draftReason}
                              placeholder={t("classRecord.overrideReasonPlaceholder")}
                              onInput={(event) =>
                                setDraftReason((event.target as HTMLTextAreaElement).value)
                              }
                            />
                          </label>
                          <div class="row" style="gap: 0.5rem;">
                            <button
                              class="btn primary"
                              type="button"
                              disabled={busy || reasonTooShort || gradeInvalid}
                              onClick={() => saveOverride(row.profile_id, false)}
                            >
                              {busy ? t("classRecord.saving") : t("classRecord.saveOverride")}
                            </button>
                            {row.override_grade !== null ? (
                              <button
                                class="btn"
                                type="button"
                                disabled={busy || reasonTooShort}
                                onClick={() => saveOverride(row.profile_id, true)}
                              >
                                {t("classRecord.clearOverride")}
                              </button>
                            ) : null}
                            <button
                              class="btn quiet"
                              type="button"
                              disabled={busy}
                              onClick={() => setEditingId(null)}
                            >
                              {t("classRecord.cancel")}
                            </button>
                          </div>
                          {reasonTooShort ? (
                            <p class="hint">{t("classRecord.reasonRequired")}</p>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          class="btn"
                          type="button"
                          style="margin-top: 0.6rem;"
                          onClick={() => startEditing(row)}
                        >
                          {row.override_grade === null
                            ? t("classRecord.override")
                            : t("classRecord.changeOverride")}
                        </button>
                      )}
                    </td>
                  </tr>
                ) : null
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
