// CSV roster import: validate first, apply second. The professor always sees
// exactly what will happen before anything is written.
//
// Parsing lives in ./csv, which imports nothing so CI can test it directly.
// Shapes below were read off validateRosterRows / applyRoster in
// supabase/functions/course-roster-management/index.ts. See pitfalls #3.
import { callFn } from "./client";
import type { Role } from "./types";
import type { RosterRow } from "./csv";

export { parseCsv, rosterFromCsv, MAX_ROSTER_ROWS } from "./csv";
export type { RosterRow, ParsedRoster } from "./csv";

export interface AcceptedRow extends RosterRow {
  section_id: string;
  section_name: string;
}

export interface RejectedRow extends RosterRow {
  reason: string;
}

export interface RosterPreview {
  row_count: number;
  accepted_count: number;
  rejected_count: number;
  accepted_rows: AcceptedRow[];
  rejected_rows: RejectedRow[];
  allowed_domains: string[];
}

export interface RosterApplyResult extends RosterPreview {
  roster_import: {
    id: string;
    row_count: number;
    accepted_count: number;
    rejected_count: number;
    status: string;
    created_at?: string;
  };
}

export const ROSTER_ROLES: Role[] = ["student", "teaching_assistant", "instructor", "observer"];

export function previewRoster(rows: RosterRow[]) {
  return callFn<RosterPreview>("course-roster-management", { action: "preview_roster", rows });
}

export function applyRoster(rows: RosterRow[], source_filename: string) {
  return callFn<RosterApplyResult>("course-roster-management", {
    action: "apply_roster",
    rows,
    source_filename
  });
}
