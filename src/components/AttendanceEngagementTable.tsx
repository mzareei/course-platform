// Table 1 — Attendance and engagement.
//
// Kept separate from grading on purpose: being in the room and answering when
// asked is not the same as getting the answers right, and a professor defending
// one should never have to untangle it from the other.
import { useMemo, useState } from "preact/hooks";
import { t, locale, formatDay } from "../i18n";
import {
  markPresent,
  type AttendanceRow,
  type AttendanceStatus,
  type AttendanceTable as AttendanceTableData
} from "../api/classRecord";
import { nextSort, sortRows, type SortState } from "../features/classRecord/sorting";

type SortKey =
  | "name"
  | "student_identifier"
  | "checked_in_at"
  | "status"
  | "pulse_responses"
  | "engagement_percent"
  | "last_activity_at";

// Worst-first for the columns you sort to find a problem; A→Z for the rest.
const naturalDirection: Record<SortKey, "asc" | "desc"> = {
  name: "asc",
  student_identifier: "asc",
  checked_in_at: "asc",
  status: "asc",
  pulse_responses: "asc",
  engagement_percent: "asc",
  last_activity_at: "asc"
};

const statusOrder: Record<AttendanceStatus, number> = {
  present: 0,
  late: 1,
  left_early: 2,
  absent: 3
};

function timeOf(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
}

function statusLabel(status: AttendanceStatus) {
  return t(`classRecord.status.${status}` as Parameters<typeof t>[0]);
}

export function AttendanceEngagementTable({
  data,
  onData
}: {
  data: AttendanceTableData;
  onData: (next: AttendanceTableData) => void;
}) {
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "name", direction: "asc" });
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const value = (row: AttendanceRow) => {
      switch (sort.key) {
        case "status":
          return statusOrder[row.status];
        case "engagement_percent":
          return row.engagement_percent;
        case "pulse_responses":
          return row.pulse_responses;
        case "checked_in_at":
          return row.checked_in_at;
        case "last_activity_at":
          return row.last_activity_at;
        case "student_identifier":
          return row.student_identifier;
        default:
          return row.name;
      }
    };
    return sortRows(data.rows, value, sort.direction);
  }, [data.rows, sort]);

  const counts = useMemo(() => {
    const tally: Record<AttendanceStatus, number> = { present: 0, late: 0, left_early: 0, absent: 0 };
    for (const row of data.rows) tally[row.status] += 1;
    return tally;
  }, [data.rows]);

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

  async function submitMarkPresent(profileId: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await markPresent({
        class_session_id: data.session.class_session_id,
        profile_id: profileId,
        note: note.trim()
      });
      onData(next);
      setMarkingId(null);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("classRecord.markPresentFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <h2>{t("classRecord.attendance.title")}</h2>
          <p class="hint">
            {t("classRecord.attendance.summary", {
              present: counts.present,
              late: counts.late,
              leftEarly: counts.left_early,
              absent: counts.absent
            })}
          </p>
        </div>
        <p class="hint">
          {data.session.actual_start_at
            ? t("classRecord.attendance.startedAt", {
                time: timeOf(data.session.actual_start_at),
                minutes: data.session.late_after_minutes
              })
            : t("classRecord.attendance.neverStarted")}
        </p>
      </div>

      {error ? <p class="error-text" role="alert">{error}</p> : null}

      <div class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              {header("name", t("classRecord.column.student"))}
              {header("student_identifier", t("classRecord.column.studentId"))}
              {header("checked_in_at", t("classRecord.column.checkIn"))}
              {header("status", t("classRecord.column.status"))}
              {header("pulse_responses", t("classRecord.column.pulseResponses"), true)}
              {header("engagement_percent", t("classRecord.column.engagement"), true)}
              {header("last_activity_at", t("classRecord.column.lastActivity"))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.profile_id}>
                <td>{row.name}</td>
                <td>{row.student_identifier || "—"}</td>
                <td>
                  {timeOf(row.checked_in_at)}
                  {row.check_in_source === "instructor" ? (
                    <span class="hint" title={row.check_in_note || undefined}>
                      {" "}
                      · {t("classRecord.markedByHand")}
                    </span>
                  ) : null}
                </td>
                <td>
                  <span class={`attendance-pill ${row.status.replace("_", "-")}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td class="num">{row.pulse_responses}</td>
                <td class="num">
                  {row.engagement_percent === null ? "—" : `${row.engagement_percent}%`}
                </td>
                <td>{timeOf(row.last_activity_at)}</td>
                <td>
                  {row.checked_in_at ? null : markingId === row.profile_id ? (
                    <div class="row" style="gap: 0.4rem;">
                      <input
                        type="text"
                        style="min-width: 12rem;"
                        value={note}
                        placeholder={t("classRecord.markPresentNote")}
                        onInput={(event) => setNote((event.target as HTMLInputElement).value)}
                      />
                      <button
                        class="btn primary"
                        type="button"
                        disabled={busy || note.trim().length < 3}
                        onClick={() => submitMarkPresent(row.profile_id)}
                      >
                        {busy ? t("classRecord.saving") : t("classRecord.save")}
                      </button>
                      <button
                        class="btn quiet"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setMarkingId(null);
                          setNote("");
                        }}
                      >
                        {t("classRecord.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      class="btn quiet"
                      type="button"
                      onClick={() => {
                        setMarkingId(row.profile_id);
                        setNote("");
                      }}
                    >
                      {t("classRecord.markPresent")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p class="hint">
        {t("classRecord.attendance.footnote", {
          pushed: data.pulse_rounds_pushed,
          date: formatDay(data.session.planned_date, { month: "long", day: "numeric" })
        })}
      </p>
    </section>
  );
}
