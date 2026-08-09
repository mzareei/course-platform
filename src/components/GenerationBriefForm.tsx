import { useState } from "preact/hooks";
import type { GenerationMode, TeachingBrief } from "../api/generation";
import { t } from "../i18n";

type BriefSubmission = {
  file: File;
  title: string;
  teaching_brief: TeachingBrief;
};

function optionalGoal(value: string) {
  const goal = Number(value);
  return value.trim() && Number.isFinite(goal) && goal > 0 ? goal : null;
}

export function GenerationBriefForm({
  busy,
  onSubmit
}: {
  busy: boolean;
  onSubmit: (submission: BriefSubmission) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<GenerationMode>("deck_and_bank");
  const [instructions, setInstructions] = useState("");
  const [preferences, setPreferences] = useState("");
  const [liveGoal, setLiveGoal] = useState("");
  const [candidatesGoal, setCandidatesGoal] = useState("");
  const [endQuizGoal, setEndQuizGoal] = useState("");

  async function submit(event: Event) {
    event.preventDefault();
    if (!file || title.trim().length < 3) return;
    const submitted = await onSubmit({
      file,
      title: title.trim(),
      teaching_brief: {
        generation_mode: mode,
        instructions: instructions.trim(),
        live_checkpoint_goal: optionalGoal(liveGoal),
        candidates_per_checkpoint: optionalGoal(candidatesGoal),
        end_quiz_question_goal: optionalGoal(endQuizGoal),
        checkpoint_preferences: preferences.trim()
      }
    });
    if (!submitted) return;
    setTitle("");
    setFile(null);
    setInstructions("");
    setPreferences("");
    setLiveGoal("");
    setCandidatesGoal("");
    setEndQuizGoal("");
  }

  return (
    <form class="card stack" onSubmit={submit}>
      <div>
        <h2>{t("content.brief.title")}</h2>
        <p class="hint">{t("content.brief.body")}</p>
        <p class="hint">{t("content.sourceTruth")}</p>
      </div>
      <div class="grid-2">
        <label class="field">
          {t("content.lectureTitle")}
          <input
            type="text"
            placeholder={t("content.lectureTitlePlaceholder")}
            value={title}
            onInput={(event) => setTitle((event.target as HTMLInputElement).value)}
          />
          <span class="hint">{t("content.titleLabelOnly")}</span>
        </label>
        <label class="field">
          {t("content.pdf")}
          <input
            type="file"
            accept="application/pdf"
            onChange={(event) => setFile((event.target as HTMLInputElement).files?.[0] ?? null)}
          />
        </label>
      </div>
      <fieldset class="field">
        <legend>{t("content.mode.label")}</legend>
        <label>
          <input type="radio" name="generation-mode" checked={mode === "deck_and_bank"}
            onChange={() => setMode("deck_and_bank")} />
          {" "}{t("content.mode.deckAndBank")}
        </label>
        <label>
          <input type="radio" name="generation-mode" checked={mode === "bank_only"}
            onChange={() => setMode("bank_only")} />
          {" "}{t("content.mode.bankOnly")}
        </label>
      </fieldset>
      <label class="field">
        {t("content.brief.instructions")}
        <textarea value={instructions} rows={3}
          onInput={(event) => setInstructions((event.target as HTMLTextAreaElement).value)} />
      </label>
      <label class="field">
        {t("content.brief.preferences")}
        <textarea value={preferences} rows={2}
          onInput={(event) => setPreferences((event.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="grid-3">
        <GoalField label={t("content.brief.liveGoal")} value={liveGoal} onInput={setLiveGoal} />
        <GoalField label={t("content.brief.candidatesGoal")} value={candidatesGoal} onInput={setCandidatesGoal} />
        <GoalField label={t("content.brief.endQuizGoal")} value={endQuizGoal} onInput={setEndQuizGoal} />
      </div>
      <button class="btn primary" type="submit" disabled={busy || !file || title.trim().length < 3}>
        {busy ? t("content.uploading") : t("content.generate")}
      </button>
    </form>
  );
}

function GoalField({ label, value, onInput }: {
  label: string;
  value: string;
  onInput: (value: string) => void;
}) {
  return (
    <label class="field">
      {label}
      <input type="number" min="1" value={value} placeholder={t("content.aiDecides")}
        onInput={(event) => onInput((event.target as HTMLInputElement).value)} />
      <span class="hint">{t("content.aiDecides")}</span>
    </label>
  );
}
