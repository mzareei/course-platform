// The end-of-class reflection: one paragraph on what was learned, within the
// professor's word range (50-100 by default). The counter updates live so a
// student knows before they try to submit, not after a rejection.
import { useState } from "preact/hooks";
import type { ClassGrade } from "../../api/types";
import { t, apiErrorText } from "../../i18n";
import { submitReflection } from "../../api/reflection";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function Reflection({
  classSessionId,
  minWords,
  maxWords,
  onSubmitted
}: {
  classSessionId: string;
  minWords: number;
  maxWords: number;
  /** Carries the class grade the server just posted, so the next screen can
   *  show it instead of sending the student to look for it. */
  onSubmitted: (grade: ClassGrade | null) => void;
}) {
  // A reload or accidental back gesture at the end of class must not eat the
  // one paragraph a student wrote. Drafts persist per class session.
  const draftKey = `cp.reflection.draft.${classSessionId}`;
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(draftKey) || ""; } catch { return ""; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = countWords(text);
  const tooShort = words > 0 && words < minWords;
  const tooLong = words > maxWords;
  const canSubmit = words >= minWords && words <= maxWords;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { ticket } = await submitReflection({
        class_session_id: classSessionId,
        one_thing: text.trim()
      });
      try { localStorage.removeItem(draftKey); } catch { /* nothing to clean */ }
      onSubmitted(ticket.class_grade ?? null);
    } catch (e) {
      setError(apiErrorText(e, "reflection.submitFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <p class="eyebrow">{t("reflection.eyebrow")}</p>
      <h2>{t("reflection.title")}</h2>
      <p class="hint">{t("reflection.prompt", { min: minWords, max: maxWords })}</p>

      <textarea
        value={text}
        onInput={(e) => {
          const value = (e.target as HTMLTextAreaElement).value;
          setText(value);
          // ≤100 words; writing through on every keystroke is fine.
          try { localStorage.setItem(draftKey, value); } catch { /* draft survives in state only */ }
        }}
        style="min-height: 9rem;"
        placeholder={t("reflection.placeholder")}
      />
      <p class={tooShort || tooLong ? "error-text" : "hint"}>
        {t("reflection.wordCount", { count: words, min: minWords, max: maxWords })}
      </p>
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      <button class={`btn primary${busy ? " loading" : ""}`} type="button" disabled={busy || !canSubmit} aria-busy={busy} onClick={onSubmit}>
        {busy ? t("reflection.submitting") : t("reflection.submit")}
      </button>
    </div>
  );
}
