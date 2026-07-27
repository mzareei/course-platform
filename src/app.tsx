import { LocationProvider, Router, Route, useLocation } from "preact-iso";
import { booting, session, context, contextError, surface, isOwner, refreshContext } from "./state/session";
import { signOut } from "./auth/auth";
import { ThemeToggle } from "./components/ThemeToggle";
import { SignIn } from "./screens/SignIn";
import { NotEnrolled } from "./screens/NotEnrolled";
import { Today } from "./screens/student/Today";
import { Review } from "./screens/student/Review";
import { Grades } from "./screens/student/Grades";
import { TeachHome } from "./screens/instructor/Home";
import { Gradebook } from "./screens/instructor/Gradebook";
import { People } from "./screens/instructor/People";
import { Viewer } from "./screens/Viewer";

function StudentNav() {
  const { path } = useLocation();
  const items = [
    { href: "/", glyph: "📅", label: "Today" },
    { href: "/review", glyph: "📚", label: "Review" },
    { href: "/grades", glyph: "✅", label: "My Grades" }
  ];
  return (
    <nav class="bottom-nav" aria-label="Main">
      {items.map((item) => (
        <a href={item.href} aria-current={path === item.href ? "page" : undefined}>
          <span class="glyph" aria-hidden="true">{item.glyph}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function InstructorNav() {
  const { path } = useLocation();
  const items = [
    { href: "/teach", label: "Home" },
    { href: "/teach/content", label: "Content" },
    { href: "/teach/grades", label: "Gradebook" },
    { href: "/teach/people", label: "People" }
  ];
  return (
    <nav class="nav-tabs" aria-label="Main">
      {items.map((item) => (
        <a href={item.href} aria-current={path === item.href ? "page" : undefined}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function Topbar() {
  const profile = context.value?.profile;
  return (
    <header class="topbar">
      <a class="brand" href={surface.value === "instructor" ? "/teach" : "/"}>Course Platform</a>
      <span class="spacer" />
      {profile ? <span class="hint">{profile.preferred_name || profile.full_name}</span> : null}
      <ThemeToggle />
      {session.value ? (
        <button
          class="btn quiet"
          type="button"
          onClick={async () => {
            await signOut();
            location.href = "/";
          }}
        >
          Sign out
        </button>
      ) : null}
    </header>
  );
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div class="empty-state card">
      <h3>{title}</h3>
      <p>{note}</p>
    </div>
  );
}

export function App() {
  if (booting.value) {
    return (
      <div class="shell">
        <div class="empty-state">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!session.value) {
    return (
      <LocationProvider>
        <Topbar />
        <main class="shell">
          <SignIn />
        </main>
      </LocationProvider>
    );
  }

  if (contextError.value) {
    return (
      <LocationProvider>
        <Topbar />
        <main class="shell">
          <div class="card">
            <h2>We couldn't load your course</h2>
            <p class="error-text">{contextError.value}</p>
            <div class="row">
              <button class="btn primary" type="button" onClick={() => void refreshContext()}>
                Try again
              </button>
            </div>
          </div>
        </main>
      </LocationProvider>
    );
  }

  const ctx = context.value;
  if (ctx && ctx.roster_status !== "active") {
    return (
      <LocationProvider>
        <Topbar />
        <main class="shell">
          <NotEnrolled status={ctx.roster_status} email={ctx.user.email} />
        </main>
      </LocationProvider>
    );
  }

  const teacherSurface = surface.value === "instructor";

  return (
    <LocationProvider>
      <Topbar />
      <main class="shell">
        {teacherSurface ? <InstructorNav /> : null}
        {teacherSurface ? (
          <Router>
            <Route path="/teach" component={TeachHome} />
            <Route
              path="/teach/content"
              component={() => (
                <Placeholder
                  title="Content"
                  note="Your weekly materials move here in Phase 2 — hidden until you release them, with the PDF upload zone arriving in Phase 5."
                />
              )}
            />
            <Route path="/teach/grades" component={Gradebook} />
            <Route path="/teach/people" component={People} />
            <Route
              path="/admin"
              component={() =>
                isOwner.value ? (
                  <Placeholder title="Platform admin" note="Professor and course management arrives in Phase 5." />
                ) : (
                  <TeachHome />
                )
              }
            />
            {/* Instructors can still walk the student surface explicitly. */}
            <Route path="/student" component={Today} />
            <Route path="/view/:releaseId" component={Viewer} />
            <Route default component={TeachHome} />
          </Router>
        ) : (
          <Router>
            <Route path="/" component={Today} />
            <Route path="/review" component={Review} />
            <Route path="/grades" component={Grades} />
            <Route path="/view/:releaseId" component={Viewer} />
            <Route default component={Today} />
          </Router>
        )}
      </main>
      {teacherSurface ? null : <StudentNav />}
    </LocationProvider>
  );
}
