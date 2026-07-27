// I1 Teach Home — the instructor landing: today's session front and center.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";
import { t, locale } from "../../i18n";

export function TeachHome() {
  const ctx = context.value;
  if (!ctx) return null;

  const sessions = ctx.teacher_sessions ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => (s.planned_date ?? "").slice(0, 10) === today);
  const upcoming = sessions
    .filter((s) => ["planned", "open", "live", "paused"].includes(s.state))
    .slice(0, 6);

  const name = ctx.profile?.preferred_name;

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">{t("teach.eyebrow")}</p>
        <h1>{name ? t("teach.welcomeNamed", { name }) : t("teach.welcome")}</h1>
      </div>

      {todaySessions.length ? (
        todaySessions.map((s) => (
          <div class="card" style="border-color: var(--primary); border-width: 2px;">
            <div class="row" style="justify-content: space-between;">
              <h2>
                {t("teach.todayClass", {
                  title: s.title || t("teach.sessionN", { n: s.sequence_number })
                })}
                {s.section_code ? t("teach.sectionSuffix", { code: s.section_code }) : ""}
              </h2>
              <StatusPill state={s.state} />
            </div>
            <p class="hint">{t("teach.runClassSoon")}</p>
          </div>
        ))
      ) : (
        <div class="card muted">
          <h3>{t("teach.noClassToday")}</h3>
          <p class="hint">{t("teach.noClassTodayBody")}</p>
        </div>
      )}

      <h2>{t("teach.upcoming")}</h2>
      {upcoming.length === 0 ? (
        <div class="empty-state card">
          <h3>{t("teach.noSessionsTitle")}</h3>
          <p>{t("teach.noSessionsBody")}</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>#</th>
                <th>{t("teach.col.class")}</th>
                <th>{t("teach.col.date")}</th>
                <th>{t("teach.col.section")}</th>
                <th>{t("teach.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((s) => (
                <tr>
                  <td class="num">{s.sequence_number}</td>
                  <td>{s.title ?? "—"}</td>
                  <td>{s.planned_date ? new Date(s.planned_date).toLocaleDateString(locale()) : "—"}</td>
                  <td>{s.section_code || "—"}</td>
                  <td><StatusPill state={s.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div class="grid-2">
        <a class="card" href="/teach/content" style="text-decoration:none;color:inherit;">
          <h3>{t("teach.card.content")}</h3>
          <p class="hint">{t("teach.card.contentBody")}</p>
        </a>
        <a class="card" href="/teach/grades" style="text-decoration:none;color:inherit;">
          <h3>{t("teach.card.grades")}</h3>
          <p class="hint">{t("teach.card.gradesBody")}</p>
        </a>
        <a class="card" href="/teach/people" style="text-decoration:none;color:inherit;">
          <h3>{t("teach.card.people")}</h3>
          <p class="hint">{t("teach.card.peopleBody")}</p>
        </a>
        <a class="card" href="/student" style="text-decoration:none;color:inherit;">
          <h3>{t("teach.card.asStudent")}</h3>
          <p class="hint">{t("teach.card.asStudentBody")}</p>
        </a>
      </div>
    </div>
  );
}
