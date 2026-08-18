// Reset — for the morning after a rehearsal, when the invented students have to
// go and the real semester starts from zero.
//
// It follows the group in the top bar. Looking at Group 501 resets Group 501,
// and nothing in 402 or 502 moves; the whole course only goes when All groups
// is deliberately chosen, and then the confirmation phrase is a different one.
// The screen is scoped to a group everywhere else, so a reset that ignored the
// switcher would read as "reset 501" and mean "reset everything".
//
// Owner only, and hidden rather than disabled for anyone else: a control that
// always 403s is a broken screen (pitfall #17).
//
// Nothing is destroyed until the professor has seen a count of every row at
// stake and typed the confirmation. The preview is loaded on demand rather than
// with the screen: this control should cost nothing to anyone who is not
// deliberately looking for it.
import { useEffect, useState } from "preact/hooks";
import { t, apiErrorText } from "../i18n";
import { isOwner } from "../state/session";
import { activeGroupName, activeSectionId, isAllGroups } from "../state/scope";
import {
  executeCourseReset,
  previewCourseReset,
  type ResetPreview,
  type ResetResult
} from "../api/courseReset";

const CONFIRM_TOKEN = "RESET";
const CONFIRM_TOKEN_ALL = "RESET ALL";

function total(counts: Record<string, number>) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export function CourseReset() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetResult | null>(null);

  const owner = isOwner.value;
  const sectionId = activeSectionId.value;
  const allGroups = isAllGroups.value;
  const groupName = activeGroupName.value;

  // Changing the group in the top bar invalidates everything on screen: those
  // counts and those ticked names belong to the group you were looking at.
  useEffect(() => {
    setOpen(false);
    setPreview(null);
    setSelected(new Set());
    setConfirm("");
    setResult(null);
    setError(null);
  }, [sectionId]);

  async function load() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await previewCourseReset(sectionId);
      setPreview(data);
      setSelected(new Set());
      setOpen(true);
    } catch (e) {
      setError(apiErrorText(e, "reset.previewFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await executeCourseReset({
        sectionId,
        confirm,
        remove_profile_ids: [...selected]
      });
      setResult(outcome);
      setConfirm("");
      // Reload so the screen shows the emptied state rather than stale numbers.
      const fresh = await previewCourseReset(sectionId).catch(() => null);
      if (fresh) setPreview(fresh);
      setSelected(new Set());
    } catch (e) {
      setError(apiErrorText(e, "reset.failed"));
    } finally {
      setBusy(false);
    }
  }

  function toggle(profileId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  // Not the owner: no card at all. An instructor clears one class at a time
  // from Run Class, which is the reversible tool for the same instinct.
  if (!owner) return null;

  const title = allGroups ? t("reset.title.all") : t("reset.title.group", { group: groupName });
  const body = allGroups ? t("reset.body.all") : t("reset.body.group", { group: groupName });

  if (!open) {
    return (
      <section class="card">
        <h2>{title}</h2>
        <p class="hint">{body}</p>
        <p class="hint">{allGroups ? t("reset.scope.all") : t("reset.scope.group")}</p>
        {error ? <p class="error-text" role="alert">{error}</p> : null}
        <button class="btn quiet" type="button" disabled={busy} onClick={load}>
          {busy ? t("reset.checking") : t("reset.check")}
        </button>
      </section>
    );
  }

  const activityTotal = preview ? total(preview.counts) : 0;
  const legacyTotal = preview ? total(preview.legacy_counts) : 0;
  const expected = allGroups ? CONFIRM_TOKEN_ALL : CONFIRM_TOKEN;
  const ready = confirm.trim().toUpperCase().replace(/\s+/g, " ") === expected;

  return (
    <section class="card">
      <h2>{title}</h2>
      <p class="hint">{allGroups ? t("reset.scope.all") : t("reset.scope.group")}</p>
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {result ? (
        <p class="hint" role="status">
          {t("reset.done", { rows: total(result.counts), removed: result.removed })}
        </p>
      ) : null}

      {result?.refused.length ? (
        <div class="stack" style="gap: 0.3rem;">
          <p class="error-text" role="alert">{t("reset.refusedTitle")}</p>
          {result.refused.map((row) => (
            <p class="hint" key={row.profile_id}>{row.reason}</p>
          ))}
        </div>
      ) : null}

      {preview ? (
        <>
          <p class="hint">
            {allGroups
              ? t("reset.summary", {
                  activity: activityTotal,
                  legacy: legacyTotal,
                  sessions: preview.counts.class_sessions_rewound,
                  kept: preview.kept.class_sessions
                })
              : t("reset.summary.group", {
                  group: preview.group_name || groupName,
                  activity: activityTotal,
                  sessions: preview.counts.class_sessions_rewound,
                  kept: preview.kept.class_sessions
                })}
          </p>

          <div class="table-scroll">
            <table class="data">
              <thead>
                <tr>
                  <th>{t("reset.col.what")}</th>
                  <th class="num">{t("reset.col.rows")}</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>{t("reset.row.checkIns")}</td><td class="num">{preview.counts.class_attendance}</td></tr>
                <tr><td>{t("reset.row.pulseRounds")}</td><td class="num">{preview.counts.pulse_rounds}</td></tr>
                <tr><td>{t("reset.row.pulseAnswers")}</td><td class="num">{preview.counts.pulse_answers}</td></tr>
                <tr><td>{t("reset.row.quizAttempts")}</td><td class="num">{preview.counts.student_attempts}</td></tr>
                <tr><td>{t("reset.row.quizAnswers")}</td><td class="num">{preview.counts.student_responses}</td></tr>
                <tr><td>{t("reset.row.reflections")}</td><td class="num">{preview.counts.exit_tickets}</td></tr>
                <tr><td>{t("reset.row.postedGrades")}</td><td class="num">{preview.counts.gradebook_scores}</td></tr>
                <tr><td>{t("reset.row.overrides")}</td><td class="num">{preview.counts.class_grade_overrides}</td></tr>
                <tr><td>{t("reset.row.participation")}</td><td class="num">{preview.counts.participation_events}</td></tr>
                <tr><td>{t("reset.row.notes")}</td><td class="num">{preview.counts.class_student_notes}</td></tr>
                {/* The old pilot tables carry no group, so they are a
                    whole-course matter only. */}
                {allGroups ? (
                  <tr><td>{t("reset.row.legacy")}</td><td class="num">{legacyTotal}</td></tr>
                ) : null}
                <tr><td>{t("reset.row.rewound")}</td><td class="num">{preview.counts.class_sessions_rewound}</td></tr>
              </tbody>
            </table>
          </div>

          <p class="hint">{allGroups ? t("reset.keptNote") : t("reset.keptNote.group")}</p>

          <h3>{allGroups ? t("reset.students") : t("reset.students.group")}</h3>
          <p class="hint">{allGroups ? t("reset.studentsBody") : t("reset.studentsBody.group")}</p>
          {!preview.students.length ? (
            <p class="hint">{t("reset.noStudents")}</p>
          ) : (
            <div class="table-scroll">
              <table class="data">
                <thead>
                  <tr>
                    <th>{t("reset.col.remove")}</th>
                    <th>{t("classRecord.column.student")}</th>
                    <th>{t("classRecord.column.studentId")}</th>
                    <th class="num">{t("reset.col.checkIns")}</th>
                    <th class="num">{t("reset.col.answers")}</th>
                    <th class="num">{t("reset.col.quizzes")}</th>
                    <th class="num">{t("reset.col.reflections")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.students.map((student) => (
                    <tr key={student.profile_id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(student.profile_id)}
                          disabled={!student.removable || busy}
                          onChange={() => toggle(student.profile_id)}
                          aria-label={t("reset.removeAria", { name: student.name })}
                        />
                      </td>
                      <td>
                        {student.name}
                        {student.email ? <span class="hint"> · {student.email}</span> : null}
                        {student.in_other_groups ? (
                          <span class="hint"> · {t("reset.alsoElsewhere")}</span>
                        ) : null}
                      </td>
                      <td>{student.student_identifier || "—"}</td>
                      <td class="num">{student.check_ins}</td>
                      <td class="num">{student.pulse_answers}</td>
                      <td class="num">{student.quiz_attempts}</td>
                      <td class="num">{student.reflections}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div class="stack" style="gap: 0.4rem; margin-top: 0.8rem;">
            <p class="error-text">
              {allGroups
                ? t("reset.warning.all", {
                    rows: activityTotal + legacyTotal,
                    students: selected.size,
                    groups: preview.group_count
                  })
                : t("reset.warning.group", {
                    group: preview.group_name || groupName,
                    rows: activityTotal,
                    students: selected.size
                  })}
            </p>
            <input
              type="text"
              value={confirm}
              placeholder={allGroups ? t("reset.placeholder.all") : t("reset.placeholder")}
              onInput={(event) => setConfirm((event.target as HTMLInputElement).value)}
            />
            <div class="row" style="gap: 0.5rem;">
              <button class="btn danger" type="button" disabled={busy || !ready} onClick={run}>
                {busy
                  ? t("reset.running")
                  : allGroups
                    ? t("reset.confirm.all")
                    : t("reset.confirm.group", { group: preview.group_name || groupName })}
              </button>
              <button
                class="btn quiet"
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setConfirm("");
                  setResult(null);
                }}
              >
                {t("reset.cancel")}
              </button>
            </div>
          </div>
        </>
      ) : (
        <p class="hint">{t("reset.checking")}</p>
      )}
    </section>
  );
}
