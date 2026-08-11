// How a class grade is printed — in one place, because it is printed in three.
//
// The professor's grading table, the student's My Grades screen, and the
// semester matrix all show the same stored number. They used to disagree: the
// two detail views rounded to one decimal while the matrix printed the raw
// value, so a grade stored as 73.96 appeared as "74" beside a "73.96" and
// invited a student to think one of the screens was wrong.
//
// Two decimals matches how the grade is computed and stored (round2 in
// supabase/functions/_shared/class-grade.ts). Trailing zeros are dropped so a
// clean 100 does not render as "100.00".

/** A class grade, printed exactly as stored. `null` renders as an em dash. */
export function formatGrade(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return String(Math.round(value * 100) / 100);
}

/** A percentage that carries the same precision as a grade. */
export function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100) / 100}%`;
}
