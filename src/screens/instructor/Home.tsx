// I1 Teach Home — the instructor landing: today's session front and center.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";

export function TeachHome() {
  const ctx = context.value;
  if (!ctx) return null;

  const sessions = ctx.teacher_sessions ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => (s.planned_date ?? "").slice(0, 10) === today);
  const upcoming = sessions
    .filter((s) => ["planned", "open", "live", "paused"].includes(s.state))
    .slice(0, 6);

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">Instructor</p>
        <h1>Welcome back{ctx.profile?.preferred_name ? `, ${ctx.profile.preferred_name}` : ""}</h1>
      </div>

      {todaySessions.length ? (
        todaySessions.map((s) => (
          <div class="card" style="border-color: var(--primary); border-width: 2px;">
            <div class="row" style="justify-content: space-between;">
              <h2>Today's class — session {s.sequence_number}{s.section_code ? ` · Section ${s.section_code}` : ""}</h2>
              <StatusPill state={s.state} />
            </div>
            <p class="hint">
              The guided Run Class flow (start → release → pulses → quiz → reflections → end)
              arrives in Phase 3. Until then, manage the session from the current course app.
            </p>
          </div>
        ))
      ) : (
        <div class="card muted">
          <h3>No class scheduled today</h3>
          <p class="hint">Your next sessions are below. Running a class is a one-button flow once it's scheduled.</p>
        </div>
      )}

      <h2>Upcoming sessions</h2>
      {upcoming.length === 0 ? (
        <div class="empty-state card">
          <h3>No sessions planned</h3>
          <p>Sessions are created per class meeting; each one gets a QR join code for students.</p>
        </div>
      ) : (
        <div class="table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Section</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((s) => (
                <tr>
                  <td class="num">{s.sequence_number}</td>
                  <td>{s.planned_date ? new Date(s.planned_date).toLocaleDateString() : "—"}</td>
                  <td>{s.section_code ?? "—"}</td>
                  <td><StatusPill state={s.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div class="grid-2">
        <a class="card" href="/teach/content" style="text-decoration:none;color:inherit;">
          <h3>Content</h3>
          <p class="hint">Weekly materials, release control, and (soon) PDF upload.</p>
        </a>
        <a class="card" href="/teach/grades" style="text-decoration:none;color:inherit;">
          <h3>Gradebook</h3>
          <p class="hint">Semester matrix, per-class review, weights.</p>
        </a>
        <a class="card" href="/teach/people" style="text-decoration:none;color:inherit;">
          <h3>People</h3>
          <p class="hint">Roster, sections, guests and QA accounts.</p>
        </a>
        <a class="card" href="/student" style="text-decoration:none;color:inherit;">
          <h3>View as student</h3>
          <p class="hint">See exactly what your students see.</p>
        </a>
      </div>
    </div>
  );
}
