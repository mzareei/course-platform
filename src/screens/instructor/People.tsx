// I5 People — roster overview + add one person. CSV import preview/apply and
// external-access management port over next; this screen reads the live roster
// and supports the most common action (add someone) end to end.
import { useEffect, useState } from "preact/hooks";
import { callFn } from "../../api/client";
import type { RosterOverview, Role } from "../../api/types";
import { StatusPill } from "../../components/StatusPill";
import { context } from "../../state/session";
import { t } from "../../i18n";

const ROLE_OPTIONS: Role[] = ["student", "teaching_assistant", "instructor", "observer"];

export function People() {
  const [data, setData] = useState<RosterOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-one-person form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [sectionCode, setSectionCode] = useState("");
  const [reason, setReason] = useState("");

  const sections = context.value?.sections ?? [];

  function load() {
    callFn<RosterOverview>("course-roster-management")
      .then((d) => {
        setData(d);
        if (!sectionCode && sections[0]) setSectionCode(sections[0].section_code);
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  const needsReason =
    email.trim() !== "" &&
    !(data?.allowed_domains ?? []).some((d) => email.trim().toLowerCase().endsWith(`@${d}`));

  async function addPerson() {
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await callFn("course-roster-management", {
        action: "add_person",
        institutional_email: email.trim().toLowerCase(),
        full_name: name.trim(),
        student_identifier: studentId.trim() || undefined,
        role,
        section_code: sectionCode,
        reason: needsReason ? reason.trim() : undefined
      });
      setNotice(t("people.added", { name: name.trim() || email.trim() }));
      setEmail(""); setName(""); setStudentId(""); setReason("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("people.addFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">{t("people.eyebrow")}</p>
        <h1>{t("people.title")}</h1>
      </div>

      <div class="card">
        <h2>{t("people.addTitle")}</h2>
        <p class="hint">{t("people.addBody")}</p>
        <div class="grid-2">
          <label class="field">
            {t("people.email")}
            <input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            {t("people.fullName")}
            <input type="text" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            {t("people.studentId")}
            <input type="text" value={studentId} onInput={(e) => setStudentId((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            {t("people.section")}
            <select value={sectionCode} onChange={(e) => setSectionCode((e.target as HTMLSelectElement).value)}>
              {sections.map((s) => (
                <option value={s.section_code}>{s.section_name || s.section_code}</option>
              ))}
            </select>
          </label>
          <label class="field">
            {t("people.role")}
            <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as Role)}>
              {ROLE_OPTIONS.map((option) => (
                <option value={option}>{t(`role.${option}`)}</option>
              ))}
            </select>
          </label>
          {needsReason ? (
            <label class="field">
              {t("people.reason")}
              <input
                type="text"
                placeholder={t("people.reasonPlaceholder")}
                value={reason}
                onInput={(e) => setReason((e.target as HTMLInputElement).value)}
              />
            </label>
          ) : null}
        </div>
        <div class="row">
          <button
            class="btn primary"
            type="button"
            disabled={
              busy || !email.trim() || !name.trim() || !sectionCode ||
              (needsReason && reason.trim().length < 3)
            }
            onClick={addPerson}
          >
            {t("people.add")}
          </button>
          {needsReason ? <span class="hint">{t("people.reasonNote")}</span> : null}
        </div>
        {notice ? <p class="hint" role="status">{notice}</p> : null}
        {error ? <p class="error-text" role="alert">{error}</p> : null}
      </div>

      <h2>{t("people.roster")}</h2>
      {!data ? (
        <div class="empty-state"><p>{t("people.loadingRoster")}</p></div>
      ) : data.roster.length === 0 ? (
        <div class="empty-state card">
          <h3>{t("people.emptyTitle")}</h3>
          <p>{t("people.emptyBody")}</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>{t("people.col.name")}</th>
                <th>{t("people.email")}</th>
                <th>{t("people.col.id")}</th>
                <th>{t("people.col.roleSection")}</th>
                <th>{t("grades.status")}</th>
              </tr>
            </thead>
            <tbody>
              {data.roster.map((person) => (
                <tr>
                  <td>{person.full_name}</td>
                  <td>{person.institutional_email}</td>
                  <td>{person.student_identifier ?? "—"}</td>
                  <td>
                    {(person.sections ?? [])
                      .map((s) => `${t(`role.${s.role}`)} · ${s.section_code}`)
                      .join(", ") ||
                      (person.course_role ? t(`role.${person.course_role}`) : "—")}
                  </td>
                  <td><StatusPill state={person.profile_status ?? person.membership_status ?? ""} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.external_access?.length ? (
        <>
          <h2>{t("people.externalAccess")}</h2>
          <div class="table-scroll">
            <table class="data">
              <thead>
                <tr>
                  <th>{t("people.email")}</th>
                  <th>{t("people.col.reason")}</th>
                  <th>{t("grades.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.external_access.map((grant) => (
                  <tr>
                    <td>{grant.email}</td>
                    <td>{grant.reason ?? "—"}</td>
                    <td><StatusPill state={grant.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
