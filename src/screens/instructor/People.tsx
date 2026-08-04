// I5 People — roster overview, add one person, and CSV roster import.
// External-access management still ports over from the old app.
import { useEffect, useState } from "preact/hooks";
import type { RosterOverview, Role } from "../../api/types";
import { ApiError } from "../../api/client";
import { listSections, type CourseSection } from "../../api/schedule";
import {
  addRosterPerson,
  assignPersonSection,
  listRoster,
  removeRosterPerson,
  resendInstructorInvitation
} from "../../api/roster";
import { StatusPill } from "../../components/StatusPill";
import { RosterImport } from "../../components/RosterImport";
import { StudentNoteHistory } from "../../components/StudentNoteHistory";
import {
  currentCourseStudentSectionId,
  hasActiveStudentEnrollment
} from "../../features/roster/sectionMembership";
import {
  assignmentErrorKey,
  isAssignableGroupStatus,
  isAssignableStudentProfileStatus
} from "../../features/roster/assignment";
import { context, refreshContext } from "../../state/session";
import { t } from "../../i18n";

const ROLE_OPTIONS: Role[] = ["student", "teaching_assistant", "instructor", "observer"];
const GROUP_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RosterPerson = RosterOverview["roster"][number];

function assignmentErrorMessage(cause: unknown) {
  return t(assignmentErrorKey(cause instanceof ApiError ? cause.code : undefined));
}

function canHaveStudentNotes(person: RosterPerson) {
  return person.course_role === "student" || (person.sections ?? []).some((section) => section.role === "student");
}

function GroupAssignment({
  person,
  groups,
  courseGroupIds,
  assigning,
  onAssign
}: {
  person: RosterPerson;
  groups: CourseSection[];
  courseGroupIds: ReadonlySet<string>;
  assigning: boolean;
  onAssign: (sectionId: string) => void;
}) {
  const currentSectionId = currentCourseStudentSectionId(person.sections, courseGroupIds);
  const [sectionId, setSectionId] = useState(currentSectionId);
  const availableGroups = groups.filter((group) => isAssignableGroupStatus(group.status));

  useEffect(() => {
    setSectionId(currentSectionId);
  }, [currentSectionId]);

  return (
    <div class="stack">
      <label class="field">
        {t("people.group")}
        <select
          value={sectionId}
          disabled={assigning}
          onChange={(event) => setSectionId((event.target as HTMLSelectElement).value)}
        >
          <option value="">{t("people.chooseGroup")}</option>
          {availableGroups.map((group) => (
            <option value={group.id}>{group.section_name || group.section_code}</option>
          ))}
        </select>
      </label>
      <button
        class="btn quiet"
        type="button"
        disabled={assigning || !sectionId || sectionId === currentSectionId}
        onClick={() => onAssign(sectionId)}
      >
        {assigning
          ? t("people.assigningGroup")
          : currentSectionId
            ? t("people.changeGroup")
            : t("people.assignGroup")}
      </button>
    </div>
  );
}

export function People() {
  const [data, setData] = useState<RosterOverview | null>(null);
  const [groups, setGroups] = useState<CourseSection[] | null>(null);
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

  const [removing, setRemoving] = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [profileToAssign, setProfileToAssign] = useState("");
  const [selectedNoteProfile, setSelectedNoteProfile] = useState<RosterPerson | null>(null);

  const myProfileId = context.value?.profile?.id ?? "";
  const groupParam = new URLSearchParams(location.search).get("group");
  const requestedGroupId = groupParam && GROUP_UUID.test(groupParam) ? groupParam : null;
  const selectedGroup = requestedGroupId
    ? groups?.find((group) => group.id === requestedGroupId) ?? null
    : null;
  const groupId = selectedGroup?.id ?? null;
  const selectedGroupAssignable = Boolean(
    selectedGroup && isAssignableGroupStatus(selectedGroup.status)
  );
  const courseGroupIds = new Set((groups ?? []).map((group) => group.id));

  async function load() {
    try {
      const [rosterData, sectionData] = await Promise.all([listRoster(), listSections()]);
      setData(rosterData);
      setGroups(sectionData.sections);
      setSectionCode((current) => {
        if (sectionData.sections.some(
          (group) => group.section_code === current && isAssignableGroupStatus(group.status)
        )) return current;
        const available = sectionData.sections.find((group) => isAssignableGroupStatus(group.status));
        return available?.section_code || "";
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("people.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const needsReason =
    role !== "instructor" &&
    email.trim() !== "" &&
    !(data?.allowed_domains ?? []).some((d) => email.trim().toLowerCase().endsWith(`@${d}`));
  const roster = groupId
    ? (data?.roster ?? []).filter((person) => hasActiveStudentEnrollment(person.sections, groupId))
    : (data?.roster ?? []);
  const studentsOutsideGroup = groupId && selectedGroupAssignable
    ? (data?.roster ?? []).filter((person, index, rows) =>
        person.course_role === "student" &&
        person.membership_status === "active" &&
        isAssignableStudentProfileStatus(person.profile_status) &&
        person.profile_id !== myProfileId &&
        currentCourseStudentSectionId(person.sections, courseGroupIds) !== groupId &&
        rows.findIndex((candidate) => candidate.profile_id === person.profile_id) === index
      )
    : [];

  async function removePerson(profileId: string, fullName: string) {
    if (!confirm(t("people.removeConfirm", { name: fullName }))) return;
    setNotice(null);
    setError(null);
    setRemoving(profileId);
    try {
      await removeRosterPerson(profileId);
      setNotice(t("people.removed", { name: fullName }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("people.removeFailed"));
    } finally {
      setRemoving(null);
    }
  }

  async function addPerson() {
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      const result = await addRosterPerson({
        institutional_email: email.trim().toLowerCase(),
        full_name: name.trim(),
        student_identifier: studentId.trim() || undefined,
        role,
        section_code: sectionCode,
        external_access_reason: needsReason ? reason.trim() : undefined
      });
      if (!result.added) throw new Error(result.reason || t("people.addFailed"));
      const addedName = name.trim() || email.trim();
      setNotice(
        role === "instructor" && result.invite_email_sent === true
          ? t("people.addedWithInvitation", { name: addedName })
          : role === "instructor" && result.invite_email_sent === false
            ? t("people.addedInvitationFailed", { name: addedName })
            : t("people.added", { name: addedName })
      );
      setEmail(""); setName(""); setStudentId(""); setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("people.addFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function resendInvitation(person: RosterPerson) {
    setNotice(null);
    setError(null);
    setInviting(person.profile_id);
    try {
      const result = await resendInstructorInvitation(person.profile_id);
      setNotice(
        result.sent
          ? t("people.invitationResent", { name: person.full_name })
          : t("people.invitationResendFailed", { name: person.full_name })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("people.invitationResendFailed", { name: person.full_name }));
    } finally {
      setInviting(null);
    }
  }

  async function assignGroup(person: RosterPerson, sectionId: string) {
    setNotice(null);
    setError(null);
    setAssigning(person.profile_id);
    try {
      await assignPersonSection(person.profile_id, sectionId);
      const group = groups?.find((candidate) => candidate.id === sectionId);
      setNotice(t("people.groupAssigned", {
        name: person.full_name,
        group: group?.section_name || group?.section_code || t("people.group")
      }));
      await load();
      await refreshContext();
    } catch (cause) {
      setError(assignmentErrorMessage(cause));
    } finally {
      setAssigning(null);
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
              {(groups ?? []).filter((group) => isAssignableGroupStatus(group.status)).map((s) => (
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

      <RosterImport onImported={() => void load()} />

      <h2>{t("people.roster")}</h2>
      {selectedGroup ? (
        <>
          <div class="row">
            <span class="pill scheduled">
              {t("people.viewingGroup", { group: selectedGroup.section_name || selectedGroup.section_code })}
            </span>
            <a class="btn quiet" href="/teach/people">{t("people.clearGroup")}</a>
          </div>
          <div class="card stack">
            <h3>
              {t("people.assignToViewingGroup", {
                group: selectedGroup.section_name || selectedGroup.section_code
              })}
            </h3>
            {!selectedGroupAssignable ? (
              <p class="hint">{t("people.groupNotAssignable")}</p>
            ) : studentsOutsideGroup.length ? (
              <div class="row">
                <label class="field">
                  {t("people.student")}
                  <select
                    value={profileToAssign}
                    disabled={Boolean(assigning)}
                    onChange={(event) => setProfileToAssign((event.target as HTMLSelectElement).value)}
                  >
                    <option value="">{t("people.chooseStudent")}</option>
                    {studentsOutsideGroup.map((person) => (
                      <option value={person.profile_id}>{person.full_name}</option>
                    ))}
                  </select>
                </label>
                <button
                  class="btn quiet"
                  type="button"
                  disabled={Boolean(assigning) || !profileToAssign}
                  onClick={() => {
                    const person = studentsOutsideGroup.find((candidate) => candidate.profile_id === profileToAssign);
                    if (!person) return;
                    setProfileToAssign("");
                    void assignGroup(person, selectedGroup.id);
                  }}
                >
                  {assigning ? t("people.assigningGroup") : t("people.assignGroup")}
                </button>
              </div>
            ) : (
              <p class="hint">{t("people.noStudentsToAssign")}</p>
            )}
          </div>
        </>
      ) : null}
      {!data || !groups ? (
        <div class="empty-state"><p>{t("people.loadingRoster")}</p></div>
      ) : roster.length === 0 ? (
        <div class="empty-state card">
          <h3>{t("people.emptyTitle")}</h3>
          <p>{groupId ? t("people.groupEmpty") : t("people.emptyBody")}</p>
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
                <th>{t("people.group")}</th>
                <th>{t("grades.status")}</th>
                <th>{t("studentNotes.title")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.map((person) => (
                <tr key={person.profile_id}>
                  <td>{person.full_name}</td>
                  <td>{person.institutional_email}</td>
                  <td>{person.student_identifier ?? "—"}</td>
                  <td>
                    {(person.sections ?? [])
                      .filter((s) => s.status !== "dropped")
                      .map((s) => `${t(`role.${s.role}`)} · ${s.section_code}`)
                      .join(", ") ||
                      (person.course_role ? t(`role.${person.course_role}`) : "—")}
                  </td>
                  <td>
                    {person.course_role === "student" &&
                    person.membership_status === "active" &&
                    isAssignableStudentProfileStatus(person.profile_status) &&
                    person.profile_id !== myProfileId ? (
                      <GroupAssignment
                        person={person}
                        groups={groups ?? []}
                        courseGroupIds={courseGroupIds}
                        assigning={assigning === person.profile_id}
                        onAssign={(sectionId) => void assignGroup(person, sectionId)}
                      />
                    ) : "—"}
                  </td>
                  <td>
                    {/* Removal deactivates the *membership*; it deliberately does
                        not touch profile_status, so showing profile_status alone
                        makes a removed person look untouched. On-the-course wins. */}
                    {person.membership_status && person.membership_status !== "active" ? (
                      <span class="pill warn">{t("people.removedLabel")}</span>
                    ) : (
                      <StatusPill state={person.profile_status ?? person.membership_status ?? ""} />
                    )}
                  </td>
                  <td>
                    {canHaveStudentNotes(person) ? (
                      <button
                        class="btn quiet"
                        type="button"
                        onClick={() => setSelectedNoteProfile(person)}
                      >
                        {t("studentNotes.open")}
                      </button>
                    ) : "—"}
                  </td>
                  <td>
                    {/* The server refuses self-removal and platform owners; hiding
                        the button for yourself just avoids an avoidable error. */}
                    <div class="row">
                      {person.course_role === "instructor" &&
                      person.profile_status === "invited" &&
                      !person.claimed ? (
                        <button
                          class="btn quiet"
                          type="button"
                          disabled={Boolean(inviting) || Boolean(removing)}
                          onClick={() => void resendInvitation(person)}
                        >
                          {inviting === person.profile_id
                            ? t("people.sendingInvitation")
                            : t("people.resendInvitation")}
                        </button>
                      ) : null}
                      {person.profile_id !== myProfileId && person.membership_status === "active" ? (
                        <button
                          class="btn quiet"
                          type="button"
                          disabled={removing === person.profile_id || Boolean(inviting)}
                          onClick={() => void removePerson(person.profile_id, person.full_name)}
                        >
                          {removing === person.profile_id ? t("people.removing") : t("people.remove")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedNoteProfile ? (
        <section class="card stack">
          <div class="row" style="justify-content: space-between;">
            <h2>{t("studentNotes.for", { name: selectedNoteProfile.full_name })}</h2>
            <button class="btn quiet" type="button" onClick={() => setSelectedNoteProfile(null)}>
              {t("studentNotes.close")}
            </button>
          </div>
          <StudentNoteHistory profileId={selectedNoteProfile.profile_id} />
        </section>
      ) : null}

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
