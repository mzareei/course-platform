// Platform admin — the screen that lets a second professor exist.
//
// Everything here is gated server-side on an active platform_owner membership;
// hiding the tab is a courtesy, not the control. There is no "send invitation"
// step to get wrong: inviting writes a profile + membership, and the person
// claims it themselves the first time they sign in with that address.
import { useEffect, useState } from "preact/hooks";
import {
  listCourses, createCourse, listProfessors, inviteProfessor, deactivateMembership,
  type AdminCourse, type AdminProfessor
} from "../../api/admin";
import { StatusPill } from "../../components/StatusPill";
import { ConfirmButton } from "../../components/ConfirmButton";
import { t, apiErrorText } from "../../i18n";

type InviteRole = "instructor" | "teaching_assistant";
const INVITE_ROLES: InviteRole[] = ["instructor", "teaching_assistant"];

function roleLabel(role: string) {
  if (role === "instructor") return t("admin.role.instructor");
  if (role === "teaching_assistant") return t("admin.role.teaching_assistant");
  if (role === "platform_owner") return t("admin.role.platform_owner");
  return role;
}

export function Admin() {
  const [courses, setCourses] = useState<AdminCourse[] | null>(null);
  const [staff, setStaff] = useState<AdminProfessor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create-a-course form
  const [newId, setNewId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTerm, setNewTerm] = useState("");

  // Invite form + staff filter
  const [filterCourse, setFilterCourse] = useState("");
  const [inviteCourse, setInviteCourse] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("instructor");

  async function load() {
    try {
      const [courseData, staffData] = await Promise.all([listCourses(), listProfessors()]);
      setCourses(courseData.courses);
      setStaff(staffData.professors);
      // Default the invite form to the first course so the common case is one click.
      setInviteCourse((current) => current || courseData.courses[0]?.id || "");
    } catch (e) {
      setError(apiErrorText(e, "admin.loadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreateCourse() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { course } = await createCourse({
        id: newId.trim(),
        code: newCode.trim(),
        title: newTitle.trim(),
        term_label: newTerm.trim()
      });
      setNotice(t("admin.createdCourse", { title: course.title }));
      setNewId("");
      setNewCode("");
      setNewTitle("");
      setNewTerm("");
      setInviteCourse(course.id);
      await load();
    } catch (e) {
      setError(apiErrorText(e, "admin.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onInvite() {
    setError(null);
    setNotice(null);
    if (!inviteCourse) {
      setError(t("admin.pickCourseFirst"));
      return;
    }
    setBusy(true);
    try {
      await inviteProfessor({
        course_id: inviteCourse,
        email: inviteEmail.trim(),
        full_name: inviteName.trim() || undefined,
        role: inviteRole
      });
      setNotice(t("admin.invited", { email: inviteEmail.trim(), course: inviteCourse }));
      setInviteEmail("");
      setInviteName("");
      await load();
    } catch (e) {
      setError(apiErrorText(e, "admin.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(person: AdminProfessor) {
    const name = person.full_name || person.email || "";
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await deactivateMembership(person.membership_id);
      setNotice(t("admin.removed", { name, course: person.course_id }));
      await load();
    } catch (e) {
      setError(apiErrorText(e, "admin.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (error && !courses) {
    return (
      <div class="card">
        <h2>{t("admin.title")}</h2>
        <p class="error-text" role="alert">{error}</p>
      </div>
    );
  }
  if (!courses || !staff) {
    return <div class="empty-state"><p>{t("admin.loading")}</p></div>;
  }

  const activeStaff = staff.filter((person) => person.membership_status === "active");
  const staffCount = (courseId: string) =>
    activeStaff.filter((person) => person.course_id === courseId).length;
  const visibleStaff = filterCourse
    ? staff.filter((person) => person.course_id === filterCourse)
    : staff;

  const canCreate =
    !busy && newId.trim() && newCode.trim().length >= 2 &&
    newTitle.trim().length >= 2 && newTerm.trim().length >= 2;
  const canInvite = !busy && inviteEmail.trim().includes("@") && inviteCourse;

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">{t("admin.eyebrow")}</p>
        <h1>{t("admin.title")}</h1>
        <p class="hint">{t("admin.lede")}</p>
      </div>

      {notice ? <p class="hint" role="status">{notice}</p> : null}
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      <section class="stack">
        <h2>{t("admin.courses")}</h2>
        {!courses.length ? (
          <div class="empty-state card">
            <h3>{t("admin.courses.empty")}</h3>
            <p>{t("admin.courses.emptyBody")}</p>
          </div>
        ) : (
          <div class="table-scroll">
            <table class="data">
              <thead>
                <tr>
                  <th>{t("admin.col.code")}</th>
                  <th>{t("admin.col.title")}</th>
                  <th>{t("admin.col.term")}</th>
                  <th>{t("grades.status")}</th>
                  <th>{t("admin.col.staff")}</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr>
                    <td>
                      {course.code}
                      <br />
                      <span class="hint" style="font-size: 0.78rem;">{course.id}</span>
                    </td>
                    <td>{course.title}</td>
                    <td>{course.term_label}</td>
                    <td><StatusPill state={course.status} /></td>
                    <td class="num">{staffCount(course.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section class="card">
        <h2>{t("admin.newCourse")}</h2>
        <div class="grid-2">
          <label class="field">
            {t("admin.field.id")}
            <input
              type="text"
              value={newId}
              onInput={(e) => setNewId((e.target as HTMLInputElement).value)}
            />
            <span class="hint">{t("admin.field.idHint")}</span>
          </label>
          <label class="field">
            {t("admin.field.code")}
            <input
              type="text"
              value={newCode}
              onInput={(e) => setNewCode((e.target as HTMLInputElement).value)}
            />
            <span class="hint">{t("admin.field.codeHint")}</span>
          </label>
          <label class="field">
            {t("admin.field.courseTitle")}
            <input
              type="text"
              value={newTitle}
              onInput={(e) => setNewTitle((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            {t("admin.field.term")}
            <input
              type="text"
              value={newTerm}
              onInput={(e) => setNewTerm((e.target as HTMLInputElement).value)}
            />
            <span class="hint">{t("admin.field.termHint")}</span>
          </label>
        </div>
        <div class="row">
          <button class="btn primary" type="button" disabled={!canCreate} onClick={onCreateCourse}>
            {busy ? t("admin.creating") : t("admin.createCourse")}
          </button>
        </div>
      </section>

      <section class="stack">
        <div class="row" style="justify-content: space-between; align-items: flex-end;">
          <h2>{t("admin.staff")}</h2>
          <label class="field" style="flex: 0 0 auto; min-width: 14rem;">
            {t("admin.filter.course")}
            <select
              value={filterCourse}
              onChange={(e) => setFilterCourse((e.target as HTMLSelectElement).value)}
            >
              <option value="">{t("admin.filter.allCourses")}</option>
              {courses.map((course) => (
                <option value={course.id}>{course.code}</option>
              ))}
            </select>
          </label>
        </div>
        {!visibleStaff.length ? (
          <div class="empty-state card">
            <h3>{t("admin.staff.empty")}</h3>
            <p>{t("admin.staff.emptyBody")}</p>
          </div>
        ) : (
          <div class="table-scroll">
            <table class="data">
              <thead>
                <tr>
                  <th>{t("admin.col.person")}</th>
                  <th>{t("admin.col.code")}</th>
                  <th>{t("admin.col.role")}</th>
                  <th>{t("admin.col.account")}</th>
                  <th>{t("grades.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((person) => (
                  <tr>
                    <td>
                      {person.full_name || "—"}
                      <br />
                      <span class="hint" style="font-size: 0.78rem;">{person.email || "—"}</span>
                    </td>
                    <td>{person.course_id}</td>
                    <td>{roleLabel(person.role)}</td>
                    <td><StatusPill state={person.profile_status ?? ""} /></td>
                    <td><StatusPill state={person.membership_status} /></td>
                    <td>
                      {person.membership_status === "active" && person.role !== "platform_owner" ? (
                        <ConfirmButton
                          label={busy ? t("admin.removing") : t("admin.remove")}
                          confirmLabel={t("app.pressAgainConfirm")}
                          className="btn quiet"
                          disabled={busy}
                          onConfirm={() => void onRemove(person)}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section class="card">
        <h2>{t("admin.invite")}</h2>
        <div class="grid-2">
          <label class="field">
            {t("admin.field.email")}
            <input
              type="email"
              value={inviteEmail}
              onInput={(e) => setInviteEmail((e.target as HTMLInputElement).value)}
            />
            <span class="hint">{t("admin.field.emailHint")}</span>
          </label>
          <label class="field">
            {t("admin.field.fullName")}
            <input
              type="text"
              placeholder={t("admin.field.fullNameOptional")}
              value={inviteName}
              onInput={(e) => setInviteName((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            {t("admin.filter.course")}
            <select
              value={inviteCourse}
              onChange={(e) => setInviteCourse((e.target as HTMLSelectElement).value)}
            >
              {courses.map((course) => (
                <option value={course.id}>{course.code} · {course.title}</option>
              ))}
            </select>
          </label>
          <label class="field">
            {t("admin.field.role")}
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole((e.target as HTMLSelectElement).value as InviteRole)}
            >
              {INVITE_ROLES.map((role) => (
                <option value={role}>{roleLabel(role)}</option>
              ))}
            </select>
          </label>
        </div>
        <div class="row">
          <button class="btn primary" type="button" disabled={!canInvite} onClick={onInvite}>
            {busy ? t("admin.inviting") : t("admin.sendInvite")}
          </button>
        </div>
      </section>
    </div>
  );
}
