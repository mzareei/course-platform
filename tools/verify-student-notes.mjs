// Guards the private instructor-note workflow. These checks deliberately keep
// note calls out of student screens and make a note's class + student scope
// explicit at each instructor entry point.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const read = (file) => readFileSync(file, "utf8");
const composer = read("src/components/StudentNoteComposer.tsx");
const history = read("src/components/StudentNoteHistory.tsx");
const gradebook = read("src/screens/instructor/Gradebook.tsx");
const people = read("src/screens/instructor/People.tsx");

assert.match(composer, /createStudentNote/);
assert.match(composer, /<textarea/);
assert.match(composer, /noteText\.trim\(\)/);
assert.match(composer, /needs_follow_up/);

assert.match(history, /listStudentNotes/);
assert.match(history, /listSessionNotes/);
assert.match(history, /resolveStudentNote/);
assert.match(history, /needs_follow_up && !note\.resolved_at/);
assert.match(history, /author_name/);
assert.match(history, /session_title/);

assert.match(gradebook, /StudentNoteComposer/);
assert.match(gradebook, /StudentNoteHistory/);
assert.match(gradebook, /classSessionId=\{sessionId\}/);
assert.match(gradebook, /profileId=\{selectedStudentId\}/);

assert.match(people, /StudentNoteHistory/);
assert.match(people, /profileId=\{selectedNoteProfile\.profile_id\}/);

function studentScreenFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    return entry.isDirectory() ? studentScreenFiles(child) : [child];
  });
}

for (const file of studentScreenFiles("src/screens/student")) {
  const source = read(file);
  assert.doesNotMatch(source, /studentNotes|course-student-notes/);
}

console.log("verify-student-notes: OK");
