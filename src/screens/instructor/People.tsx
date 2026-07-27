// I5 People — roster overview + add one person. CSV import preview/apply and
// external-access management port over next; this screen reads the live roster
// and supports the most common action (add someone) end to end.
import { useEffect, useState } from "preact/hooks";
import { callFn } from "../../api/client";
import type { RosterOverview, Role } from "../../api/types";
import { StatusPill } from "../../components/StatusPill";
import { context } from "../../state/session";

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
        if (!sectionCode && d.roster.length === 0 && sections[0]) {
          setSectionCode(sections[0].section_code);
        }
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
      setNotice(`${name.trim() || email.trim()} was added to the roster.`);
      setEmail(""); setName(""); setStudentId(""); setReason("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add this person.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">Administration</p>
        <h1>People</h1>
      </div>

      <div class="card">
        <h2>Add one person</h2>
        <p class="hint">
          For a whole class list, use CSV import (still in the current course app; it ports here
          next). This form covers late enrollments, guests, and QA accounts.
        </p>
        <div class="grid-2">
          <label class="field">
            Email
            <input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            Full name
            <input type="text" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            Student / staff ID (optional)
            <input type="text" value={studentId} onInput={(e) => setStudentId((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            Section
            <select value={sectionCode} onChange={(e) => setSectionCode((e.target as HTMLSelectElement).value)}>
              {sections.map((s) => <option value={s.section_code}>{s.section_name || s.section_code}</option>)}
            </select>
          </label>
          <label class="field">
            Role
            <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as Role)}>
              <option value="student">Student</option>
              <option value="teaching_assistant">Teaching assistant</option>
              <option value="instructor">Instructor</option>
              <option value="observer">Observer</option>
            </select>
          </label>
          {needsReason ? (
            <label class="field">
              Reason for outside-institution access
              <input
                type="text"
                placeholder="e.g. Guest professor for week 8"
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
            disabled={busy || !email.trim() || !name.trim() || !sectionCode || (needsReason && reason.trim().length < 3)}
            onClick={addPerson}
          >
            Add person
          </button>
          {needsReason ? (
            <span class="hint">This address is outside the approved domains — the reason is recorded in the audit log.</span>
          ) : null}
        </div>
        {notice ? <p class="hint" role="status">{notice}</p> : null}
        {error ? <p class="error-text" role="alert">{error}</p> : null}
      </div>

      <h2>Roster</h2>
      {!data ? (
        <div class="empty-state"><p>Loading the roster…</p></div>
      ) : data.roster.length === 0 ? (
        <div class="empty-state card">
          <h3>Nobody on the roster yet</h3>
          <p>Add people above, or import the class CSV to bring everyone in at once.</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr><th>Name</th><th>Email</th><th>ID</th><th>Role · Section</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.roster.map((person) => (
                <tr>
                  <td>{person.full_name}</td>
                  <td>{person.institutional_email}</td>
                  <td>{person.student_identifier ?? "—"}</td>
                  <td>
                    {(person.enrollments ?? []).map((e) => `${e.role} · ${e.section_code}`).join(", ") ||
                      [person.role, person.section_code].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td><StatusPill state={person.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.external_access?.length ? (
        <>
          <h2>External access</h2>
          <div class="table-scroll">
            <table class="data">
              <thead>
                <tr><th>Email</th><th>Reason</th><th>Status</th></tr>
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
