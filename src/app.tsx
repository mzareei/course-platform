import { LocationProvider, Router, Route, useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { booting, session, context, contextError, surface, isOwner, refreshContext } from "./state/session";
import { signOut } from "./auth/auth";
import { t } from "./i18n";
import { ThemeToggle } from "./components/ThemeToggle";
import { LanguageToggle } from "./components/LanguageToggle";
import { SignIn } from "./screens/SignIn";
import { NotEnrolled } from "./screens/NotEnrolled";
import { Today } from "./screens/student/Today";
import { Review } from "./screens/student/Review";
import { Grades } from "./screens/student/Grades";
import { TeachHome } from "./screens/instructor/Home";
import { Gradebook } from "./screens/instructor/Gradebook";
import { ClassRecordRoute } from "./screens/instructor/ClassRecord";
import { People } from "./screens/instructor/People";
import { Classes } from "./screens/instructor/Classes";
import { Content } from "./screens/instructor/Content";
import { Admin } from "./screens/instructor/Admin";
import { Viewer } from "./screens/Viewer";
import { Live } from "./screens/student/Live";
import { JoinClass } from "./screens/student/JoinClass";
import { RunClass } from "./screens/instructor/RunClass";
import { Projector } from "./screens/instructor/Projector";
import { StudentShell } from "./components/StudentShell";
import { ScopeSwitcher } from "./components/ScopeSwitcher";
import { loadScopeGroups } from "./state/scope";

function isProjectorRoute(path: string) {
  return /^\/teach\/run\/[^/]+\/projector\/?$/.test(path);
}

function InstructorNav() {
  const { path } = useLocation();
  const items = [
    { href: "/teach", label: t("teach.nav.home") },
    { href: "/teach/classes", label: t("teach.nav.classes") },
    { href: "/teach/content", label: t("teach.nav.content") },
    { href: "/teach/grades", label: t("teach.nav.grades") },
    { href: "/teach/people", label: t("teach.nav.people") },
    // Owners only. Without this link /admin is reachable only by typing the URL,
    // which is how a whole feature once shipped that no user could get to.
    ...(isOwner.value ? [{ href: "/admin", label: t("teach.nav.admin") }] : [])
  ];
  return (
    <nav class="nav-tabs" aria-label={t("nav.main")}>
      {items.map((item) => (
        <a href={item.href} aria-current={path === item.href ? "page" : undefined}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/** Module scope on purpose — an inline arrow here gets a new component identity
 *  on every App render and remounts the whole screen. See pitfalls #4. */
function AdminRoute() {
  return isOwner.value ? <Admin /> : <TeachHome />;
}

function StudentTodayPreview() {
  return <StudentShell preview><Today /></StudentShell>;
}

function StudentReviewPreview() {
  return <StudentShell preview><Review /></StudentShell>;
}

function StudentGradesPreview() {
  return <StudentShell preview><Grades /></StudentShell>;
}

function InstructorSurface() {
  const { path } = useLocation();

  useEffect(() => {
    void loadScopeGroups();
  }, []);

  const studentPreview =
    path === "/student" || path.startsWith("/student/");

  return (
    <>
      {studentPreview ? null : <InstructorNav />}
      <Router>
        <Route path="/teach" component={TeachHome} />
        <Route path="/teach/classes" component={Classes} />
        <Route path="/teach/content" component={Content} />
        <Route path="/teach/grades" component={Gradebook} />
        <Route path="/teach/people" component={People} />
        <Route path="/admin" component={AdminRoute} />
        <Route path="/student" component={StudentTodayPreview} />
        <Route path="/student/review" component={StudentReviewPreview} />
        <Route path="/student/grades" component={StudentGradesPreview} />
        <Route path="/teach/run/:sessionId" component={RunClass} />
        <Route path="/teach/class/:sessionId" component={ClassRecordRoute} />
        <Route path="/view/:releaseId" component={Viewer} />
        <Route default component={TeachHome} />
      </Router>
    </>
  );
}

function Topbar() {
  const profile = context.value?.profile;
  return (
    <header class="topbar">
      <a class="brand" href={surface.value === "instructor" ? "/teach" : "/"}>{t("app.name")}</a>
      {surface.value === "instructor" ? <ScopeSwitcher /> : null}
      <span class="spacer" />
      {profile ? <span class="hint">{profile.preferred_name || profile.full_name}</span> : null}
      <LanguageToggle />
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
          {t("app.signOut")}
        </button>
      ) : null}
    </header>
  );
}

/** The one URL-driven branch App takes is "/join/*", and App reads the global
 *  `location`, which is not reactive. When JoinClass finishes and calls
 *  `route("/live")`, only the Router inside JoinRouteShell re-renders — App
 *  keeps rendering the join shell, whose fallback used to be the sign-in
 *  screen. Every first-time student hit that: claim a PIN, land on /live, see
 *  "Sign in" until a manual reload. This signal is App's reactive view of the
 *  path; PathSync keeps it current from inside the shell's LocationProvider. */
const currentPath = signal(location.pathname);

function PathSync() {
  const { path } = useLocation();
  useEffect(() => {
    currentPath.value = path;
  }, [path]);
  return null;
}

/** Signed out, any route → sign in. Signed in, the join shell is only for
 *  /join/* — for anything else PathSync is about to hand control back to App,
 *  so show a quiet loading beat, never a sign-in form to a signed-in student. */
function JoinFallback() {
  if (!session.value) return <SignIn />;
  return (
    <div class="empty-state card" role="status">
      <p>{t("app.loading")}</p>
    </div>
  );
}

function JoinRouteShell() {
  return (
    <LocationProvider>
      <PathSync />
      <Topbar />
      <main class="shell">
        <Router>
          <Route path="/join/:joinCode" component={JoinClass} />
          <Route default component={JoinFallback} />
        </Router>
      </main>
    </LocationProvider>
  );
}

function ProjectorUnavailable({ loading = false }: { loading?: boolean }) {
  return (
    <main class="projector-screen projector-empty">
      <div class="card" role={loading ? "status" : "alert"}>
        <h1>{loading ? t("projector.loading") : t("projector.unavailableTitle")}</h1>
        {!loading ? <p class="hint">{t("projector.unavailableBody")}</p> : null}
      </div>
    </main>
  );
}

function ProjectorRoute() {
  const ctx = context.value;
  const authorized = !booting.value
    && Boolean(session.value)
    && !contextError.value
    && ctx?.roster_status === "active"
    && surface.value === "instructor";
  if (!authorized) return <ProjectorUnavailable loading={booting.value} />;

  return (
    <LocationProvider>
      <Router>
        <Route path="/teach/run/:sessionId/projector" component={Projector} />
        <Route default component={ProjectorUnavailable} />
      </Router>
    </LocationProvider>
  );
}

export function App() {
  // Claim this URL before boot, sign-in, roster, and surface branches. The
  // dedicated route still verifies authorization before mounting Projector.
  if (isProjectorRoute(location.pathname)) return <ProjectorRoute />;

  if (booting.value) {
    return (
      <div class="shell">
        <div class="empty-state">
          <p>{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (!session.value) {
    return <JoinRouteShell />;
  }

  // Joining must reach its own authenticated authorization boundary before
  // course-context and roster gates so missing/unenrolled users get the
  // join-specific access explanation and consume any stored auth return.
  // `currentPath` (not `location.pathname`) so the in-app route("/live") after
  // a successful join re-renders App out of the join shell.
  if (currentPath.value.startsWith("/join/")) {
    return <JoinRouteShell />;
  }

  if (contextError.value) {
    return (
      <LocationProvider>
        <Topbar />
        <main class="shell">
          <div class="card">
            <h2>{t("app.contextError.title")}</h2>
            <p class="error-text">{contextError.value}</p>
            <div class="row">
              <button class="btn primary" type="button" onClick={() => void refreshContext()}>
                {t("app.tryAgain")}
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
        {teacherSurface ? (
          <InstructorSurface />
        ) : (
          <StudentShell preview={false}>
            <Router>
              <Route path="/" component={Today} />
              <Route path="/review" component={Review} />
              <Route path="/grades" component={Grades} />
              <Route path="/live" component={Live} />
              <Route path="/join/:joinCode" component={JoinClass} />
              <Route path="/view/:releaseId" component={Viewer} />
              <Route default component={Today} />
            </Router>
          </StudentShell>
        )}
      </main>
    </LocationProvider>
  );
}
