// The professor cannot see how full the room is from the cockpit. He asked for
// the number above the QR code so he can watch it climb as the class scans in.
//
// The trap this guards is pitfall #67 in reverse: `present` (class_attendance)
// and `enrolled` (section_enrollments) are different questions, and a counter
// that quietly showed the roster would tell him the room was full before anyone
// had walked in.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

// ------------------------------------------------------------------- frontend
const runClass = readFileSync("src/screens/instructor/RunClass.tsx", "utf8");
const pulseApi = readFileSync("src/api/pulse.ts", "utf8");
const strings = readFileSync("src/i18n/strings.ts", "utf8");

check(
  /classAttendanceCount\(/.test(pulseApi),
  "src/api/pulse.ts must expose the attendance count call"
);
check(
  /action: "attendance"/.test(pulseApi),
  "the count must go through course-pulse's attendance action — the browser never queries a table"
);
check(
  /classAttendanceCount\(sessionId\)/.test(runClass),
  "Run Class must ask for the count of the class it is running"
);
check(
  /ATTENDANCE_POLL_MS/.test(runClass),
  "the count must be polled — a number fetched once stops climbing"
);

// A reply for the previous class must not land on the new class's counter. The
// results poll already learned this lesson; so must this one.
check(
  /count\.class_session_id === sessionId/.test(runClass),
  "a late reply must be dropped unless it is for the session on screen"
);

// The card renders in two places (pre-live and live). Both must show the count,
// and neither may show it for a closed class, which cannot be joined at all.
const joinCards = runClass.match(/<JoinCard\b[\s\S]*?\/>/g) || [];
check(
  joinCards.length === 2,
  `expected the join card in both the pre-live and live layouts, found ${joinCards.length}`
);
for (const card of joinCards) {
  check(
    /joined=\{joined\}/.test(card),
    "every join card must carry the count — the professor looks at whichever one is on screen"
  );
}
check(
  /const showJoinCard = Boolean\(joinUrl\) && !ended/.test(runClass),
  "one condition must govern both showing the card and polling for its count"
);

// Null, not zero, before the first reply lands. "0 in the room" on a full
// classroom is a worse lie than showing nothing for a second.
check(
  /joined \? \(/.test(runClass),
  "the counter must be hidden until a real count has arrived, never defaulted to 0"
);

check(
  /"run\.join\.joinedLabel"/.test(strings) && /"run\.join\.joinedOfRoster"/.test(strings),
  "the counter's labels must live in the bilingual dictionary"
);

// ------------------------------------------------------------------ backend
// The edge function lives in the other repo. Check it when it is checked out;
// skip rather than fail when only this repo is present (CI clones one).
const pulseFn = "../mzareei.github.io/supabase/functions/course-pulse/index.ts";
if (existsSync(pulseFn)) {
  const fn = readFileSync(pulseFn, "utf8");
  check(
    /case "attendance":/.test(fn),
    "course-pulse must handle the attendance action"
  );
  check(
    /async function loadAttendanceCount/.test(fn),
    "course-pulse must have a dedicated loader — folding this into `current` would cost four queries every five seconds"
  );
  check(
    /\["push", "rounds", "current", "attendance"\]/.test(fn),
    "the attendance action resolves its section from class_session_id, so it must be in the list that does"
  );
  // Since 0048 a class resumed on a second day has an attendance row per day.
  // Counting them all shows a fuller room than the one in front of him.
  const loader = fn.slice(fn.indexOf("async function loadAttendanceCount"));
  const body = loader.slice(0, loader.indexOf("\n}\n") + 3);
  check(
    /attendance_date/.test(body),
    "the count must be scoped to today's class day, the way loadResults counts `present`"
  );
  check(
    /class_attendance/.test(body) && /section_enrollments/.test(body),
    "present comes from class_attendance and enrolled from section_enrollments — they are different questions"
  );
  check(
    /head: true/.test(body),
    "this is polled for the whole hour; it must count rows, not fetch them"
  );
} else {
  console.log("verify-live-attendance-count: backend repo not checked out, skipping edge-function checks");
}

if (failures.length) {
  console.error("live attendance count verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
assert.ok(true);
console.log("verify-live-attendance-count: OK");
