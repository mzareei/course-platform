// Grades used to reach a student only when the professor pressed "Post to the
// gradebook" on that class's record. He did not, so a room that had answered
// every question, sat the quiz and written the reflection was shown "No grades
// yet" — reported 2026-08-14 with a screenshot of exactly that.
//
// Posting is now a consequence of finishing, not a chore. These are the four
// moments it has to happen, and the two traps in doing it that way.
import { readFileSync } from "node:fs";
import { backendPath, hasBackend } from "./lib/backend-root.mjs";

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const fn = (name) => backendPath(`supabase/functions/${name}`);
const backend = hasBackend("supabase/functions/_shared/class-grade.ts");

// ------------------------------------------------------------------ frontend
const classRecord = readFileSync("src/screens/instructor/ClassRecord.tsx", "utf8");
const classRecordApi = readFileSync("src/api/classRecord.ts", "utf8");
const reflectionApi = readFileSync("src/api/reflection.ts", "utf8");
const live = readFileSync("src/screens/student/Live.tsx", "utf8");
const strings = readFileSync("src/i18n/strings.ts", "utf8");

// The manual path is gone, not merely hidden. A button left in the code is a
// button that comes back the next time the screen is edited.
check(
  !/post_to_gradebook/.test(classRecordApi),
  "the manual post_to_gradebook call must be gone from the API module"
);
check(
  !/postClassGradesToGradebook/.test(classRecord + classRecordApi),
  "nothing may still call the manual posting endpoint"
);
check(
  !/classRecord\.postToGradebook/.test(strings + classRecord),
  "the Post to the gradebook button and its label must be gone"
);
check(
  /classRecord\.autoPosted/.test(classRecord) && /"classRecord\.autoPosted"/.test(strings),
  "the class record must say plainly that grades post themselves"
);

// The student's own grade rides back on the submit response. Re-fetching it
// would race the write that just happened.
check(
  /class_grade/.test(reflectionApi),
  "submitReflection must carry the class grade back from the server"
);
check(
  /live\.gradeLabel/.test(live) && /"live\.gradeLabel"/.test(strings),
  "the done screen must show the grade, not just link to My Grades"
);
check(
  /classGrade\.grade !== null/.test(live),
  "a class with nothing to grade has a null grade — the done screen must not print it as 0"
);

// ------------------------------------------------------------------- backend
if (backend) {
  const shared = readFileSync(fn("_shared/class-grade.ts"), "utf8");
  const ticket = readFileSync(fn("course-exit-ticket/index.ts"), "utf8");
  const sessions = readFileSync(fn("course-session-management/index.ts"), "utf8");
  const record = readFileSync(fn("course-class-record/index.ts"), "utf8");

  // One implementation of the rule. Three functions post now, and an edge
  // function cannot import another edge function, so it has to live in _shared.
  check(
    /export async function postClassGrades\(/.test(shared),
    "posting must live in _shared/class-grade.ts, beside the rule it publishes"
  );
  check(
    /export async function classGradingRows\(/.test(shared),
    "the roster grading rows must be shared, not re-implemented per caller"
  );
  check(
    !/function classGradingRows|function computeGrade/.test(record),
    "course-class-record must import the grading rule, never restate it"
  );

  // THE trap. Posting the whole roster when one student finishes hands every
  // classmate still writing a grade carrying the 20% missing-submission
  // penalty — for something they have not failed to do yet.
  check(
    /profileIds/.test(shared),
    "postClassGrades must be able to write a single student's row"
  );
  check(
    /profileIds: \[profileId\]/.test(ticket),
    "the exit ticket must post ONLY the student who submitted it"
  );
  check(
    !/trigger: "reflection_submitted"[\s\S]{0,400}profileIds: undefined/.test(ticket),
    "the reflection must never trigger a roster-wide post"
  );

  // Everyone else — including whoever never wrote a reflection, whose grade
  // carries the penalty and who deliberately did not see it until now.
  check(
    /trigger: "class_closed"/.test(sessions),
    "ending the class must post the whole roster"
  );
  check(
    !/profileIds/.test(sessions),
    "the close must post everyone, not a subset"
  );

  // A correction the student never sees is worse than no correction.
  check(
    /trigger: "grade_override"/.test(record),
    "overriding a grade must re-post it to that student"
  );

  // The second trap: with no button left, a post that fails on close would
  // strand the class with nothing to press (pitfall #70, a state with no exit).
  check(
    /export async function postClassGradesQuietly\(/.test(shared),
    "posting must never be able to fail a reflection submit or a class close"
  );
  check(
    /session\.state === "closed"[\s\S]{0,200}postClassGradesQuietly/.test(record),
    "opening a closed class's record must repair a posting that never landed"
  );

  // The snapshot taken before writing an override must not go through the
  // repairing path — it would post the pre-override grade one line before the
  // override exists, putting the wrong number on the phone in between.
  check(
    /const current = await classGradingRows\(db, session\)/.test(record),
    "the override snapshot must read the rows directly, not through gradingTable"
  );
} else {
  console.log("verify-auto-posted-grades: backend repo not checked out, skipping edge-function checks");
}

if (failures.length) {
  console.error("auto-posted grades verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-auto-posted-grades: OK");
