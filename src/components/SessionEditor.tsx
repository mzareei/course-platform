import { useState } from "preact/hooks";
import { updateClass } from "../api/classes";
import type { ContentItem } from "../api/content";
import type { ClassSession, CourseSection } from "../api/schedule";
import { t } from "../i18n";

type SessionEditorProps = {
  session: ClassSession;
  sections: CourseSection[];
  lectures: ContentItem[];
  onSaved: (saved: ClassSession) => void;
  onCancel: () => void;
};

// This stays at module scope so an active form keeps its identity while the
// schedule refreshes. See docs/07-pitfalls.md #4.
export function SessionEditor({ session, sections, lectures, onSaved, onCancel }: SessionEditorProps) {
  const [sectionId, setSectionId] = useState(session.section_id);
  const [title, setTitle] = useState(session.title);
  const [plannedDate, setPlannedDate] = useState(session.planned_date);
  const [contentItemId, setContentItemId] = useState(session.content_item_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const { session: saved } = await updateClass({
        session_id: session.session_id,
        section_id: sectionId,
        title: title.trim(),
        planned_date: plannedDate,
        content_item_id: contentItemId || null
      });
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("schedule.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="stack">
      <div class="grid-2">
        <label class="field">
          {t("schedule.date")}
          <input
            type="date"
            value={plannedDate}
            onInput={(event) => setPlannedDate((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          {t("schedule.group")}
          <select
            value={sectionId}
            onChange={(event) => setSectionId((event.target as HTMLSelectElement).value)}
          >
            {sections.map((section) => (
              <option value={section.id}>{section.section_name || section.section_code}</option>
            ))}
          </select>
        </label>
        <label class="field">
          {t("schedule.lecture")}
          <select
            value={contentItemId}
            onChange={(event) => setContentItemId((event.target as HTMLSelectElement).value)}
          >
            <option value="">{t("schedule.lectureNone")}</option>
            {lectures.map((lecture) => (
              <option value={lecture.id}>{lecture.title}</option>
            ))}
          </select>
          <span class="hint">{t("schedule.lectureHint")}</span>
        </label>
        <label class="field">
          {t("schedule.classTitle")}
          <input
            type="text"
            value={title}
            onInput={(event) => setTitle((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      {error ? <p class="error-text" role="alert">{error}</p> : null}
      <div class="row">
        <button
          class="btn primary"
          type="button"
          disabled={saving || !sectionId || !plannedDate || !title.trim()}
          onClick={() => void save()}
        >
          {saving ? t("schedule.saving") : t("schedule.save")}
        </button>
        <button class="btn quiet" type="button" disabled={saving} onClick={onCancel}>
          {t("schedule.keep")}
        </button>
      </div>
    </div>
  );
}
