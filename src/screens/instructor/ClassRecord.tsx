// The class record — one class, two tables.
//
// Attendance and engagement above, grading below, deliberately not merged. The
// professor opens this from the gradebook after a class to see who was there,
// who was participating, and what each of them earned.
import { useEffect, useState } from "preact/hooks";
import { t, formatDay, apiErrorText } from "../../i18n";
import { context } from "../../state/session";
import { AttendanceEngagementTable } from "../../components/AttendanceEngagementTable";
import { ClassGradingTable } from "../../components/ClassGradingTable";
import {
  classAttendance,
  classGrading,
  postClassGradesToGradebook,
  type AttendanceTable,
  type GradingTable
} from "../../api/classRecord";

export function ClassRecord({ sessionId }: { sessionId?: string }) {
  const [attendance, setAttendance] = useState<AttendanceTable | null>(null);
  const [grading, setGrading] = useState<GradingTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<{ posted: number; skipped: number } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setAttendance(null);
    setGrading(null);
    setError(null);
    setPosted(null);
    Promise.all([classAttendance(sessionId), classGrading(sessionId)])
      .then(([attendanceData, gradingData]) => {
        if (cancelled) return;
        setAttendance(attendanceData);
        setGrading(gradingData);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(apiErrorText(e, "classRecord.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function onPost() {
    if (!sessionId) return;
    setPosting(true);
    setError(null);
    try {
      const result = await postClassGradesToGradebook(sessionId);
      setPosted({ posted: result.posted, skipped: result.skipped });
    } catch (e) {
      setError(apiErrorText(e, "classRecord.postFailed"));
    } finally {
      setPosting(false);
    }
  }

  if (!sessionId) {
    return (
      <div class="empty-state card">
        <h3>{t("classRecord.noSession")}</h3>
        <a class="btn" href="/teach/grades">{t("classRecord.backToGrades")}</a>
      </div>
    );
  }

  const session = attendance?.session ?? grading?.session ?? null;
  const sessionTitle = session
    ? t("classRecord.heading", { number: session.sequence_number, title: session.title })
    : t("classRecord.loading");

  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <p class="eyebrow">{t("classRecord.eyebrow")}</p>
          <h1>{sessionTitle}</h1>
          {session ? (
            <p class="hint">
              {formatDay(session.planned_date, {
                weekday: "long",
                month: "long",
                day: "numeric"
              })}
            </p>
          ) : null}
        </div>
        <div class="row" style="gap: 0.5rem;">
          <a class="btn quiet" href="/teach/grades">{t("classRecord.backToGrades")}</a>
          <button class="btn primary" type="button" disabled={posting || !grading} onClick={onPost}>
            {posting ? t("classRecord.posting") : t("classRecord.postToGradebook")}
          </button>
        </div>
      </div>

      {error ? <p class="error-text" role="alert">{error}</p> : null}
      {posted ? (
        <p class="hint">
          {posted.posted === 1
            ? t("classRecord.postedResultOne")
            : t("classRecord.postedResultMany", { posted: posted.posted })}
          {posted.skipped > 0
            ? ` ${posted.skipped === 1
              ? t("classRecord.postedSkippedOne")
              : t("classRecord.postedSkippedMany", { skipped: posted.skipped })}`
            : ""}
        </p>
      ) : null}

      {attendance ? (
        <AttendanceEngagementTable data={attendance} onData={setAttendance} />
      ) : (
        <p class="hint">{t("classRecord.loading")}</p>
      )}

      {grading ? <ClassGradingTable data={grading} onData={setGrading} /> : null}
    </div>
  );
}

/** Route wrapper: preact-iso passes params as props. */
export function ClassRecordRoute(props: { sessionId?: string }) {
  // Nothing renders before the boot call resolves, so the roster and section
  // checks the record depends on are already in place.
  if (!context.value) return <p class="hint">{t("app.loading")}</p>;
  return <ClassRecord sessionId={props.sessionId} />;
}
