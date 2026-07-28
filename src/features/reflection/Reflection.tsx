// The end-of-class reflection: one paragraph on what was learned, within the
// professor's word range (50-100 by default). The counter updates live so a
// student knows before they try to submit, not after a rejection.
import { useState } from "preact/hooks";
import { t } from "../../i18n";
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
  onSubmitted: () => void;
}) {
  const [text, setText] = useState("");
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
      await submitReflection({ class_session_id: classSessionId, one_thing: text.trim() });
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("reflection.submitFailed"));
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
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        style="min-height: 9rem;"
        placeholder={t("reflection.placeholder")}
      />
      <p class={tooShort || tooLong ? "error-text" : "hint"}>
        {t("reflection.wordCount", { count: words, min: minWords, max: maxWords })}
      </p>
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      <button class="btn primary" type="button" disabled={busy || !canSubmit} onClick={onSubmit}>
        {busy ? t("reflection.submitting") : t("reflection.submit")}
      </button>
    </div>
  );
}
