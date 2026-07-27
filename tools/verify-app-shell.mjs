// Verifies the Phase 1 app-shell contract: role-shaped surfaces, sign-in flow,
// plain-language status labels, and the security posture (no service keys).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}
function requireFile(rel) {
  if (!existsSync(path.join(root, rel))) failures.push(`Missing file: ${rel}`);
}
function requireMarker(rel, marker, why) {
  if (!existsSync(path.join(root, rel))) {
    failures.push(`Missing file: ${rel}`);
    return;
  }
  if (!read(rel).includes(marker)) failures.push(`${rel} is missing "${marker}" (${why})`);
}
function forbidMarker(rel, marker, why) {
  if (existsSync(path.join(root, rel)) && read(rel).includes(marker)) {
    failures.push(`${rel} contains forbidden "${marker}" (${why})`);
  }
}

// Structure
for (const rel of [
  "index.html",
  "src/main.tsx",
  "src/app.tsx",
  "src/config.ts",
  "src/api/client.ts",
  "src/api/types.ts",
  "src/auth/auth.ts",
  "src/state/session.ts",
  "src/styles/app.css",
  "src/screens/SignIn.tsx",
  "src/screens/NotEnrolled.tsx",
  "src/screens/student/Today.tsx",
  "src/screens/student/Review.tsx",
  "src/screens/student/Grades.tsx",
  "src/screens/instructor/Home.tsx",
  "src/screens/instructor/Gradebook.tsx",
  "src/screens/instructor/People.tsx",
  "public/_headers"
]) {
  requireFile(rel);
}

// Auth flow keeps the roster-gated OTP contract
requireMarker("src/auth/auth.ts", "signInWithOtp", "passwordless email OTP is the only sign-in");
requireMarker("src/auth/auth.ts", "course-test-signin", "test sign-in must go through the server gate");
requireMarker("src/auth/auth.ts", "captureTestAccessFromUrl", "per-device QA unlock");
requireMarker("src/state/session.ts", "course-auth-context", "context load is the single role source");
requireMarker("src/app.tsx", "roster_status", "not-enrolled accounts must land on the enrollment panel");

// Role-shaped surfaces, no role picker
requireMarker("src/state/session.ts", "platform_owner", "surface routing from memberships");
requireMarker("src/app.tsx", "InstructorNav", "instructor surface");
requireMarker("src/app.tsx", "StudentNav", "student surface");

// Plain-language labels — raw state machine words must never reach the UI.
// The words themselves live in the bilingual dictionary; the pill only maps
// states to keys and styles.
requireMarker("src/i18n/strings.ts", '"state.draft": ["Hidden"', "draft reads as Hidden");
requireMarker("src/i18n/strings.ts", '"state.released": ["Open now"', "released reads as Open now");
requireMarker("src/i18n/strings.ts", '"state.review_only": ["Review only"', "review_only reads plainly");
requireMarker("src/components/StatusPill.tsx", "state.", "the pill resolves states through the dictionary");

// Security posture: anon key only, never a service key
const configSource = read("src/config.ts");
const jwtMatch = configSource.match(/"(eyJ[\w-]+\.[\w-]+\.[\w-]+)"/);
if (!jwtMatch) {
  failures.push("src/config.ts has no Supabase key configured");
} else {
  try {
    const payload = JSON.parse(Buffer.from(jwtMatch[1].split(".")[1], "base64url").toString("utf8"));
    if (payload.role !== "anon") {
      failures.push(`src/config.ts key has role "${payload.role}" — only the anon key may be committed`);
    }
  } catch {
    failures.push("src/config.ts Supabase key payload could not be decoded");
  }
}
for (const rel of ["src/config.ts", "src/api/client.ts", "src/auth/auth.ts"]) {
  forbidMarker(rel, "service_role", "service credentials never ship to the browser");
  forbidMarker(rel, "SUPABASE_SERVICE", "service credentials never ship to the browser");
}

// The one-primary-action dock exists for students
requireMarker("src/styles/app.css", "action-dock", "bottom-anchored primary action");
requireMarker("src/screens/student/Today.tsx", "action-dock", "Today has exactly one primary action");

if (failures.length) {
  console.error("App shell verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-app-shell: OK");
