// CSV roster import: choose a file, see exactly what will change, then apply.
//
// The server validates the same rows a second time when applying, so this
// preview is an explanation rather than a gate. It exists because a roster
// import is the one bulk write in the product, and a professor should never
// discover what it did afterwards.
//
// Module scope on purpose — see docs/07-pitfalls.md #4.
import { useState } from "preact/hooks";
import {
  rosterFromCsv, previewRoster, applyRoster, MAX_ROSTER_ROWS,
  type RosterRow, type RosterPreview
} from "../api/roster";

import { t } from "../i18n";

export function RosterImport({ onImported }: { onImported: () => void }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setFileName("");
    setRows(null);
    setPreview(null);
    setTruncated(false);
    setError(null);
  }

  async function onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    setPreview(null);
    setBusy(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = rosterFromCsv(text);
      if (parsed.missing.length) {
        setRows(null);
        setError(
          t("roster.import.missingColumns", {
            columns: parsed.missing.join(", "),
            headers: parsed.headers.join(", ") || "—"
          })
        );
        return;
      }
      if (!parsed.rows.length) {
        setRows(null);
        setError(t("roster.import.emptyFile"));
        return;
      }
      setRows(parsed.rows);
      setTruncated(parsed.rows.length >= MAX_ROSTER_ROWS);
      setPreview(await previewRoster(parsed.rows));
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : t("roster.import.failed"));
    } finally {
      setBusy(false);
      // Let the same file be chosen again after a fix.
      input.value = "";
    }
  }

  async function onApply() {
    if (!rows || !preview) return;
    if (!confirm(t("roster.import.confirm", { count: preview.accepted_count }))) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await applyRoster(rows, fileName);
      setNotice(
        result.rejected_count
          ? t("roster.import.doneWithSkips", {
              count: result.accepted_count,
              skipped: result.rejected_count
            })
          : t("roster.import.done", { count: result.accepted_count })
      );
      reset();
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("roster.import.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card stack">
      <h2>{t("roster.import.title")}</h2>
      <p class="hint">{t("roster.import.body")}</p>
      <p class="hint">{t("roster.import.columns")}</p>

      <div class="row">
        <label class="btn">
          {t("roster.import.choose")}
          <input
            type="file"
            accept=".csv,text/csv"
            style="display: none;"
            onChange={onFile}
          />
        </label>
        {fileName && rows ? (
          <span class="hint">
            {t("roster.import.file", { name: fileName, count: rows.length })}
          </span>
        ) : null}
        {preview ? (
          <button class="btn quiet" type="button" disabled={busy} onClick={reset}>
            {t("roster.import.startOver")}
          </button>
        ) : null}
      </div>

      {busy && !preview ? <p class="hint" role="status">{t("roster.import.checking")}</p> : null}
      {truncated ? (
        <p class="hint" role="status">{t("roster.import.truncated", { max: MAX_ROSTER_ROWS })}</p>
      ) : null}
      {notice ? <p class="hint" role="status">{notice}</p> : null}
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {preview ? (
        <div class="stack">
          <p>
            {preview.rejected_count === 0
              ? t("roster.import.allGood", { total: preview.row_count })
              : t("roster.import.summary", {
                  accepted: preview.accepted_count,
                  total: preview.row_count
                })}
          </p>

          {preview.rejected_count ? (
            <div class="stack" style="gap: 0.4rem;">
              <h3>{t("roster.import.rejected", { count: preview.rejected_count })}</h3>
              <p class="hint">{t("roster.import.rejectedBody")}</p>
              <div class="table-scroll">
                <table class="data">
                  <thead>
                    <tr>
                      <th>{t("roster.import.col.row")}</th>
                      <th>{t("people.email")}</th>
                      <th>{t("people.col.name")}</th>
                      <th>{t("roster.import.col.problem")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rejected_rows.map((row) => (
                      <tr>
                        <td class="num">{row.row_number}</td>
                        <td>{row.institutional_email || "—"}</td>
                        <td>{row.full_name || "—"}</td>
                        <td>{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {preview.accepted_count ? (
            <div class="table-scroll">
              <table class="data">
                <thead>
                  <tr>
                    <th>{t("roster.import.col.row")}</th>
                    <th>{t("people.col.name")}</th>
                    <th>{t("people.email")}</th>
                    <th>{t("people.col.id")}</th>
                    <th>{t("people.col.roleSection")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.accepted_rows.map((row) => (
                    <tr>
                      <td class="num">{row.row_number}</td>
                      <td>{row.full_name}</td>
                      <td>{row.institutional_email}</td>
                      <td>{row.student_identifier || "—"}</td>
                      <td>
                        {t(`role.${row.role}` as "role.student")} · {row.section_name || row.section_code}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div class="row">
            <button
              class="btn primary"
              type="button"
              disabled={busy || !preview.accepted_count}
              onClick={onApply}
            >
              {busy
                ? t("roster.import.applying")
                : t("roster.import.apply", { count: preview.accepted_count })}
            </button>
            {!preview.accepted_count ? (
              <span class="hint">{t("roster.import.nothingToApply")}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
