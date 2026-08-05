import { useState } from "preact/hooks";
import { saveSection, sectionErrorKey, type CourseSection } from "../api/schedule";
import { t } from "../i18n";

type SectionEditorProps = {
  section: CourseSection;
  onSaved: (saved: CourseSection) => void;
  onCancel: () => void;
};

const SECTION_STATUSES = ["planned", "active", "completed", "archived"] as const;

function statusLabel(status: (typeof SECTION_STATUSES)[number]) {
  if (status === "planned") return t("state.planned");
  if (status === "active") return t("state.active");
  if (status === "completed") return t("state.completed");
  return t("state.archived");
}

// This stays at module scope so editing is not reset by a list refresh. See
// docs/07-pitfalls.md #4.
export function SectionEditor({ section, onSaved, onCancel }: SectionEditorProps) {
  const [code, setCode] = useState(section.section_code);
  const [name, setName] = useState(section.section_name);
  const [meetingPattern, setMeetingPattern] = useState(section.meeting_pattern || "");
  const [campus, setCampus] = useState(section.campus || "");
  const [status, setStatus] = useState(section.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const { section: saved } = await saveSection({
        section_id: section.id,
        section_code: code.trim(),
        section_name: name.trim(),
        meeting_pattern: meetingPattern.trim() || null,
        campus: campus.trim() || null,
        status
      });
      onSaved(saved);
    } catch (cause) {
      setError(t(sectionErrorKey((cause as { code?: string })?.code)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="stack">
      <div class="grid-2">
        <label class="field">
          {t("sections.code")}
          <input type="text" value={code} onInput={(event) => setCode((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          {t("sections.name")}
          <input type="text" value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          {t("sections.meetingPattern")}
          <input
            type="text"
            value={meetingPattern}
            onInput={(event) => setMeetingPattern((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          {t("sections.campus")}
          <input type="text" value={campus} onInput={(event) => setCampus((event.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          {t("sections.status")}
          <select value={status} onChange={(event) => setStatus((event.target as HTMLSelectElement).value)}>
            {SECTION_STATUSES.map((option) => <option value={option}>{statusLabel(option)}</option>)}
          </select>
        </label>
      </div>
      {error ? <p class="error-text" role="alert">{error}</p> : null}
      <div class="row">
        <button
          class="btn primary"
          type="button"
          disabled={saving || !code.trim() || !name.trim()}
          onClick={() => void save()}
        >
          {saving ? t("sections.saving") : t("sections.save")}
        </button>
        <button class="btn quiet" type="button" disabled={saving} onClick={onCancel}>
          {t("sections.keep")}
        </button>
      </div>
    </div>
  );
}
