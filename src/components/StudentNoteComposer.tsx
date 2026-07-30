import { useState } from "preact/hooks";
import { createStudentNote } from "../api/studentNotes";
import { t } from "../i18n";

export function StudentNoteComposer({
  classSessionId,
  profileId,
  onCreated
}: {
  classSessionId: string;
  profileId: string;
  onCreated?: () => void;
}) {
  const [noteText, setNoteText] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNote() {
    if (!noteText.trim()) {
      setError(t("studentNotes.textRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createStudentNote({
        class_session_id: classSessionId,
        profile_id: profileId,
        note_text: noteText.trim(),
        needs_follow_up: needsFollowUp
      });
      setNoteText("");
      setNeedsFollowUp(false);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("studentNotes.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <label class="field">
        {t("studentNotes.text")}
        <textarea
          value={noteText}
          placeholder={t("studentNotes.textPlaceholder")}
          onInput={(e) => setNoteText((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <label class="row">
        <input
          type="checkbox"
          checked={needsFollowUp}
          onChange={(e) => setNeedsFollowUp((e.target as HTMLInputElement).checked)}
        />
        {t("studentNotes.needsFollowUp")}
      </label>
      <div class="row">
        <button class="btn primary" type="button" disabled={busy || !noteText.trim()} onClick={() => void saveNote()}>
          {busy ? t("studentNotes.adding") : t("studentNotes.add")}
        </button>
      </div>
      {error ? <p class="error-text" role="alert">{error}</p> : null}
    </div>
  );
}
