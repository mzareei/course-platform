import { useEffect, useState } from "preact/hooks";
import {
  listSessionNotes,
  listStudentNotes,
  resolveStudentNote,
  type ClassStudentNote
} from "../api/studentNotes";
import { formatDay, locale, t, apiErrorText } from "../i18n";

function noteTime(iso: string) {
  return new Date(iso).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
}

export function StudentNoteHistory({
  profileId,
  classSessionId,
  refreshKey = 0
}: {
  profileId: string;
  classSessionId?: string;
  refreshKey?: number;
}) {
  const [notes, setNotes] = useState<ClassStudentNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    setError(null);
    const loadNotes = classSessionId
      ? listSessionNotes(classSessionId)
      : listStudentNotes(profileId);
    loadNotes
      .then(({ notes: loadedNotes }) => {
        if (!cancelled) setNotes(loadedNotes);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || t("studentNotes.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [classSessionId, profileId, refreshKey]);

  async function resolveNote(noteId: string) {
    setResolving(noteId);
    setError(null);
    try {
      await resolveStudentNote(noteId);
      const { notes: updatedNotes } = await (classSessionId
        ? listSessionNotes(classSessionId)
        : listStudentNotes(profileId));
      setNotes(updatedNotes);
    } catch (e) {
      setError(apiErrorText(e, "studentNotes.resolveFailed"));
    } finally {
      setResolving(null);
    }
  }

  const visibleNotes = (notes ?? []).filter((note) => note.profile_id === profileId);

  if (error) return <p class="error-text" role="alert">{error}</p>;
  if (notes === null) return <p class="hint" role="status">{t("studentNotes.loading")}</p>;
  if (!visibleNotes.length) return <p class="hint">{t("studentNotes.none")}</p>;

  return (
    <div class="stack">
      {visibleNotes.map((note) => (
        <article class="card muted stack" style="gap: 0.45rem;">
          <div class="row" style="justify-content: space-between;">
            <strong>{note.session_title}</strong>
            {note.needs_follow_up ? (
              <span class={`pill ${note.resolved_at ? "hidden" : "warn"}`}>
                {note.resolved_at ? t("studentNotes.resolved") : t("studentNotes.needsFollowUp")}
              </span>
            ) : null}
          </div>
          <p class="hint">
            {t("studentNotes.details", {
              date: formatDay(note.planned_date),
              author: note.author_name || t("studentNotes.unknownAuthor"),
              time: noteTime(note.created_at)
            })}
          </p>
          <p>{note.note_text}</p>
          {note.needs_follow_up && !note.resolved_at ? (
            <div class="row">
              <button
                class="btn quiet"
                type="button"
                disabled={resolving === note.id}
                onClick={() => void resolveNote(note.id)}
              >
                {resolving === note.id ? t("studentNotes.resolving") : t("studentNotes.resolve")}
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
