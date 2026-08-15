// Groups (course_sections) — create, rename, retire.
//
// course-section-management had a save_section action from the first
// generation and no caller in the v2 app, so a course was stuck with whatever
// sections were seeded. That blocked a second professor entirely: onboarded
// through Admin, they would have had nowhere to put their students.
//
// "Group" in the UI, `section` in the schema. The schema word means nothing to
// a professor here, and design rule #2 forbids leaking it.
//
// Group *lifecycle* — create, rename, retire — is platform-owner only
// (requirement 8). An assigned instructor still lists the groups they teach and
// still manages their members; only the lifecycle controls are withheld, with
// a bilingual line saying why. The server refuses a crafted request either way
// (`section_management_owner_only`), so this is a screen that tells the truth
// rather than an authorisation boundary.
//
// Module scope, per docs/07-pitfalls.md #4.
import { useEffect, useState } from "preact/hooks";
import { listSections, saveSection, sectionErrorKey, type CourseSection } from "../api/schedule";
import { StatusPill } from "./StatusPill";
import { SectionEditor } from "./SectionEditor";
import { ConfirmButton } from "./ConfirmButton";
import { isOwner, refreshContext } from "../state/session";
import { t, apiErrorText } from "../i18n";
import { inScope } from "../features/scope/filters";
import { activeSectionId } from "../state/scope";

export function Sections() {
  const [sections, setSections] = useState<CourseSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [meets, setMeets] = useState("");

  async function load() {
    try {
      setSections((await listSections()).sections);
    } catch (e) {
      setError(apiErrorText(e, "sections.saveFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onAdd() {
    setError(null);
    setNotice(null);
    setBusy("add");
    try {
      await saveSection({
        section_code: code.trim(),
        section_name: name.trim() || code.trim(),
        meeting_pattern: meets.trim() || null,
        status: "active"
      });
      setNotice(t("sections.added", { code: code.trim() }));
      setCode(""); setName(""); setMeets("");
      await load();
      await refreshContext();
    } catch (e) {
      setError(t(sectionErrorKey((e as { code?: string })?.code)));
    } finally {
      setBusy(null);
    }
  }

  async function onToggle(section: CourseSection) {
    const retiring = section.status === "active" || section.status === "planned";
    setError(null);
    setNotice(null);
    setBusy(section.id);
    try {
      // save_section rewrites the row, so echo every field back or it blanks.
      await saveSection({
        section_id: section.id,
        section_code: section.section_code,
        section_name: section.section_name,
        meeting_pattern: section.meeting_pattern,
        campus: section.campus,
        status: retiring ? "archived" : "active"
      });
      await load();
      await refreshContext();
    } catch (e) {
      setError(t(sectionErrorKey((e as { code?: string })?.code)));
    } finally {
      setBusy(null);
    }
  }

  async function onSectionSaved(section: CourseSection) {
    setEditingSectionId(null);
    setNotice(t("sections.saved", { code: section.section_code }));
    await load();
    await refreshContext();
  }

  if (!sections) return <div class="empty-state"><p>{t("app.loading")}</p></div>;

  const visibleSections = sections.filter((section) => inScope(section.id, activeSectionId.value));

  return (
    <div class="stack">
      <div>
        <h2>{t("sections.title")}</h2>
        <p class="hint">{t("sections.body")}</p>
      </div>

      {notice ? <p class="hint" role="status">{notice}</p> : null}
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {visibleSections.length ? (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>{t("sections.col.code")}</th>
                <th>{t("sections.col.name")}</th>
                <th>{t("sections.col.meets")}</th>
                <th>{t("grades.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleSections.map((section) => {
                const live = section.status === "active" || section.status === "planned";
                return (
                  <>
                    <tr>
                      <td>{section.section_code}</td>
                      <td>{section.section_name}</td>
                      <td>{section.meeting_pattern || "—"}</td>
                      <td><StatusPill state={section.status} /></td>
                      <td>
                        <div class="row" style="gap: 0.3rem;">
                          {isOwner.value ? (
                            <button
                              class="btn quiet"
                              type="button"
                              disabled={busy === section.id}
                              onClick={() => setEditingSectionId(section.id)}
                            >
                              {t("sections.edit")}
                            </button>
                          ) : null}
                          <a class="btn quiet" href={`/teach/people?group=${section.id}`}>
                            {t("sections.members")}
                          </a>
                          {isOwner.value ? (
                            live ? (
                              <ConfirmButton
                                label={t("sections.retire")}
                                confirmLabel={t("app.pressAgainConfirm")}
                                className="btn quiet"
                                disabled={busy === section.id}
                                onConfirm={() => void onToggle(section)}
                              />
                            ) : (
                              <button
                                class="btn quiet"
                                type="button"
                                disabled={busy === section.id}
                                onClick={() => void onToggle(section)}
                              >
                                {t("sections.reactivate")}
                              </button>
                            )
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isOwner.value && editingSectionId === section.id ? (
                      <tr>
                        <td colSpan={5}>
                          <SectionEditor
                            section={section}
                            onSaved={(saved) => void onSectionSaved(saved)}
                            onCancel={() => setEditingSectionId(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!isOwner.value ? <p class="hint">{t("sections.ownerOnly")}</p> : null}

      {isOwner.value ? (
      <div class="card">
        <h3>{t("sections.add")}</h3>
        <div class="grid-2">
          <label class="field">
            {t("sections.code")}
            <input type="text" value={code}
                   onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
            <span class="hint">{t("sections.codeHint")}</span>
          </label>
          <label class="field">
            {t("sections.name")}
            <input type="text" value={name}
                   onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            {t("sections.meetingPattern")}
            <input type="text" value={meets}
                   onInput={(e) => setMeets((e.target as HTMLInputElement).value)} />
            <span class="hint">{t("sections.meetingHint")}</span>
          </label>
        </div>
        <div class="row">
          <button class="btn primary" type="button"
                  disabled={busy === "add" || !code.trim()} onClick={onAdd}>
            {busy === "add" ? t("sections.adding") : t("sections.add")}
          </button>
        </div>
      </div>
      ) : null}
    </div>
  );
}
