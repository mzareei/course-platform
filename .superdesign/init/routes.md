# Route map

Routing is config-based through `preact-iso` in `src/app.tsx`.

## Instructor surface

- `/teach` → `src/screens/instructor/Home.tsx`, instructor top bar and tab navigation
- `/teach/classes` → `src/screens/instructor/Classes.tsx`, instructor shell
- `/teach/content` → `src/screens/instructor/Content.tsx`, instructor shell
- `/teach/grades` → `src/screens/instructor/Gradebook.tsx`, instructor shell
- `/teach/people` → `src/screens/instructor/People.tsx`, instructor shell
- `/teach/run/:sessionId` → `src/screens/instructor/RunClass.tsx`, instructor shell
- `/admin` → `src/screens/instructor/Admin.tsx`, owner-only instructor shell
- `/student`, `/student/review`, `/student/grades` → student preview shell

## Student surface

- `/` → `src/screens/student/Today.tsx`, student shell
- `/review` → `src/screens/student/Review.tsx`, student shell
- `/grades` → `src/screens/student/Grades.tsx`, student shell
- `/live` → `src/screens/student/Live.tsx`, student shell
- `/join/:joinCode` → `src/screens/student/JoinClass.tsx`
- `/view/:releaseId` → `src/screens/Viewer.tsx`

## Full router configuration

```tsx
import { LocationProvider, Router, Route, useLocation } from "preact-iso";
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
import { People } from "./screens/instructor/People";
import { Classes } from "./screens/instructor/Classes";
import { Content } from "./screens/instructor/Content";
import { Admin } from "./screens/instructor/Admin";
import { Viewer } from "./screens/Viewer";
import { Live } from "./screens/student/Live";
import { JoinClass } from "./screens/student/JoinClass";
import { RunClass } from "./screens/instructor/RunClass";
import { StudentShell } from "./components/StudentShell";

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

function JoinRouteShell() {
  return (
    <LocationProvider>
      <Topbar />
      <main class="shell">
        <Router>
          <Route path="/join/:joinCode" component={JoinClass} />
          <Route default component={SignIn} />
        </Router>
      </main>
    </LocationProvider>
  );
}

export function App() {
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
  if (location.pathname.startsWith("/join/")) {
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
```

