// Exercises the CSV roster parser against the messy output real spreadsheets
// produce: legacy code pages, CRLF, a BOM from Excel, quoted fields containing
// commas and newlines, doubled quotes, accented headers, trailing blank lines.
//
// A roster import is the only bulk write in the product. A parser bug here does
// not throw — it quietly enrols the wrong people, or drops a row and nobody
// notices until a student cannot sign in.
//
// src/api/csv.ts imports nothing, which is what lets this run under plain node.
import { parseCsv, rosterFromCsv, decodeCsv } from "../src/api/csv.ts";

let failures = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.error(`  FAIL ${label}\n    expected ${e}\n    actual   ${a}`);
  }
}

// --------------------------------------------------------------- decodeCsv
// Excel's plain CSV export is Windows-1252. Decoding it as UTF-8 replaced every
// accent with U+FFFD and imported 26 students as "Mar<?>a", "Gonz<?>lez".
const latin1 = (text) => Uint8Array.from([...text].map((c) => c.codePointAt(0)));
check("windows-1252 accents survive", decodeCsv(latin1("Diana María Arámburo")), "Diana María Arámburo");
check("windows-1252 ñ survives", decodeCsv(latin1("Albert Wachi Peña")), "Albert Wachi Peña");
check("windows-1252 curly quote survives", decodeCsv(Uint8Array.from([0x92])), "’");
check("utf-8 still wins when valid", decodeCsv(new TextEncoder().encode("Ángela Godínez")), "Ángela Godínez");
check("plain ascii unaffected", decodeCsv(new TextEncoder().encode("a@tec.mx,401")), "a@tec.mx,401");
check(
  "utf-16le BOM honoured",
  decodeCsv(Uint8Array.from([0xff, 0xfe, 0x4d, 0x00, 0xed, 0x00, 0x61, 0x00])),
  "Mía"
);
check("no replacement character in the decoded roster", decodeCsv(latin1("Nájera")).includes("�"), false);

// ---------------------------------------------------------------- parseCsv
check("plain rows", parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
check("crlf line endings", parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
check("comma inside quotes", parseCsv('a,b\n"Ruiz, Ana",2'), [["a", "b"], ["Ruiz, Ana", "2"]]);
check("doubled quote", parseCsv('a\n"she said ""hi"""'), [["a"], ['she said "hi"']]);
check("newline inside quotes", parseCsv('a,b\n"l1\nl2",2'), [["a", "b"], ["l1\nl2", "2"]]);
check("trailing blank lines dropped", parseCsv("a,b\n1,2\n\n\n"), [["a", "b"], ["1", "2"]]);
check("excel BOM stripped", parseCsv("﻿email,name\nx@y.z,Ana")[0][0], "email");

// ------------------------------------------------------------ rosterFromCsv
const english = rosterFromCsv(
  "email,name,student_id,section,role\n" +
  "a@tec.mx,Ana Ruiz,A001,101,student\n" +
  "b@tec.mx,Beto Diaz,A002,101,\n"
);
check("english headers map cleanly", english.missing, []);
check("every data row parsed", english.rows.length, 2);
check("row_number matches the spreadsheet", english.rows[0].row_number, 2);
check("blank role defaults to student", english.rows[1].role, "student");

// A real Tec export: Spanish headers, accents, mixed case, padded cells.
const spanish = rosterFromCsv(
  "Correo Institucional,Nombre Completo,Matrícula,Grupo\n" +
  "  C@TEC.MX  ,  Carla Gómez  ,A003,102\n"
);
check("spanish headers map cleanly", spanish.missing, []);
check("email lowercased and trimmed", spanish.rows[0].institutional_email, "c@tec.mx");
check("name trimmed", spanish.rows[0].full_name, "Carla Gómez");
check("accented header matched", spanish.rows[0].student_identifier, "A003");

// A missing required column must be named, never silently imported.
const broken = rosterFromCsv("email,nickname\na@tec.mx,Ana");
check("missing columns reported", broken.missing, ["full_name", "section_code"]);
check("nothing parsed when a column is missing", broken.rows.length, 0);
check("original headers echoed for the error", broken.headers, ["email", "nickname"]);

const headerOnly = rosterFromCsv("email,name,section");
check("header-only file yields no rows", headerOnly.rows.length, 0);
check("header-only file still maps", headerOnly.missing, []);

const quoted = rosterFromCsv('email,name,section\nd@tec.mx,"Ruiz Peña, Ana",103');
check("quoted name with comma survives", quoted.rows[0].full_name, "Ruiz Peña, Ana");

if (failures > 0) {
  console.error(`verify-csv-roster: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("verify-csv-roster: OK (28 checks)");
