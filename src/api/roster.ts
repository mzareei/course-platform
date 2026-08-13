// CSV roster import: validate first, apply second. The professor always sees
// exactly what will happen before anything is written.
//
// Parsing lives in ./csv, which imports nothing so CI can test it directly.
// Shapes below were read off validateRosterRows / applyRoster in
// supabase/functions/course-roster-management/index.ts. See pitfalls #3.
import { callFn } from "./client";
import type { Role, RosterOverview } from "./types";
import type { RosterRow } from "./csv";

export { parseCsv, rosterFromCsv, decodeCsv, MAX_ROSTER_ROWS } from "./csv";
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

export function listRoster() {
  return callFn<RosterOverview>("course-roster-management");
}

export function addRosterPerson(input: {
  institutional_email: string;
  full_name: string;
  student_identifier?: string;
  role: Role;
  section_code: string;
  external_access_reason?: string;
}) {
  return callFn<{
    added: boolean;
    reason?: string;
    invite_email_sent?: boolean | null;
    invite_email_method?: "invitation" | "magic_link" | null;
  }>("course-roster-management", {
    action: "add_person",
    ...input
  });
}

export function removeRosterPerson(profileId: string) {
  return callFn<{ removed: boolean; roster: RosterOverview["roster"] }>(
    "course-roster-management",
    { action: "remove_person", profile_id: profileId }
  );
}

/**
 * Clear a student's sign-in PIN so they can set a new one.
 *
 * Deliberately narrow: it touches the PIN and nothing else. Attendance,
 * answers, quiz attempts, reflections and grades all survive, so a forgotten
 * PIN never costs a student their record. They set a new one by scanning the QR
 * code at the next live class.
 */
export function resetStudentPin(profileId: string) {
  return callFn<{ reset: boolean; profile_id: string }>(
    "course-roster-management",
    { action: "reset_student_pin", profile_id: profileId }
  );
}

export function resendInstructorInvitation(profileId: string) {
  return callFn<{
    sent: boolean;
    method: "invitation" | "magic_link" | null;
    email: string;
    full_name: string;
  }>("course-roster-management", {
    action: "resend_instructor_invitation",
    profile_id: profileId
  });
}

export function assignPersonSection(profileId: string, sectionId: string) {
  return callFn<{
    assignment: {
      profile_id: string;
      before_section_ids: string[];
      target_section_id: string;
      target_section_code: string;
    };
    roster: RosterOverview["roster"];
  }>("course-roster-management", {
    action: "assign_person_section",
    profile_id: profileId,
    section_id: sectionId
  });
}

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
