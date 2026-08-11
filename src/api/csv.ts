// CSV parsing for roster import. Deliberately free of every import — no network
// module, no i18n — so tools/verify-csv-roster.mjs can import it directly and
// exercise it in CI. Keep it that way.

/** The server caps an import at 500 rows; the parser mirrors it so the count
 *  shown to the professor is the count that will actually be applied. */
export const MAX_ROSTER_ROWS = 500;

/** What the parser produces and the server validates. */
export interface RosterRow {
  row_number: number;
  institutional_email: string;
  full_name: string;
  student_identifier: string;
  section_code: string;
  role: string;
}

export interface ParsedRoster {
  rows: RosterRow[];
  /** Required columns we could not find a header for. Empty means clean. */
  missing: string[];
  /** The file's own headers, so an error can show what was actually there. */
  headers: string[];
}

/**
 * Excel's plain "CSV (comma delimited)" is not UTF-8 — it is the machine's
 * legacy code page, Windows-1252 on the Spanish Windows the professors use.
 * Reading those bytes as UTF-8 (what `File.text()` does, unconditionally) turns
 * every accent into a replacement character: "María" arrives as "Mar�a"
 * and gets imported that way, because a mangled name is still a valid name.
 *
 * So sniff instead of assuming: honour a UTF-16 BOM, try strict UTF-8, and fall
 * back to Windows-1252 when the bytes cannot be UTF-8. Accented Latin-1 bytes
 * are never valid UTF-8 sequences, which is what makes the fallback safe —
 * a genuine UTF-8 file always decodes on the first attempt.
 */
export function decodeCsv(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // Excel's "Unicode Text" and some LMS exports are UTF-16 with a BOM.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Minimal RFC-4180 CSV: quoted fields, doubled quotes inside them, commas and
 * newlines inside quotes. Written out rather than pulled in because the app has
 * no runtime dependencies beyond Preact and supabase-js.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // A BOM from Excel would otherwise become part of the first header name.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n pair.
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  // Drop blank lines, which every spreadsheet export leaves at the end.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Header spellings accepted for each column, so a professor's own export
 *  usually just works instead of demanding an exact template. */
const HEADER_ALIASES: Record<keyof Omit<RosterRow, "row_number">, string[]> = {
  institutional_email: ["institutional_email", "email", "correo", "correo institucional", "e-mail", "mail"],
  full_name: ["full_name", "name", "nombre", "nombre completo", "student name"],
  student_identifier: ["student_identifier", "student_id", "matricula", "matrícula", "id", "student id"],
  section_code: ["section_code", "section", "seccion", "sección", "grupo", "group"],
  role: ["role", "rol"]
};

const REQUIRED = ["institutional_email", "full_name", "section_code"] as const;

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Turn raw CSV text into roster rows. Only email, name and section are
 * required — role defaults to student and student id is optional.
 */
export function rosterFromCsv(text: string): ParsedRoster {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], missing: [...REQUIRED], headers: [] };

  const headers = table[0].map(normaliseHeader);
  const indexOf = (field: keyof typeof HEADER_ALIASES) => {
    for (const alias of HEADER_ALIASES[field]) {
      const found = headers.indexOf(alias);
      if (found !== -1) return found;
    }
    return -1;
  };

  const columns = {
    institutional_email: indexOf("institutional_email"),
    full_name: indexOf("full_name"),
    student_identifier: indexOf("student_identifier"),
    section_code: indexOf("section_code"),
    role: indexOf("role")
  };

  const missing = REQUIRED.filter((field) => columns[field] === -1);
  if (missing.length) return { rows: [], missing: [...missing], headers: table[0] };

  const cell = (row: string[], index: number) => (index === -1 ? "" : (row[index] ?? "").trim());

  const rows = table.slice(1, MAX_ROSTER_ROWS + 1).map((raw, i) => ({
    row_number: i + 2, // +2: 1-based, and row 1 is the header — matches the spreadsheet.
    institutional_email: cell(raw, columns.institutional_email).toLowerCase(),
    full_name: cell(raw, columns.full_name),
    student_identifier: cell(raw, columns.student_identifier),
    section_code: cell(raw, columns.section_code),
    role: cell(raw, columns.role).toLowerCase() || "student"
  }));

  return { rows, missing: [], headers: table[0] };
}
