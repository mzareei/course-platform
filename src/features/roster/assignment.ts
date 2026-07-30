export const ASSIGNABLE_GROUP_STATES = new Set(["planned", "active"]);
export const ASSIGNABLE_STUDENT_PROFILE_STATUSES = new Set(["active", "invited"]);

export function isAssignableGroupStatus(status: string) {
  return ASSIGNABLE_GROUP_STATES.has(status);
}

export function isAssignableStudentProfileStatus(status: string | undefined) {
  return typeof status === "string" && ASSIGNABLE_STUDENT_PROFILE_STATUSES.has(status);
}

export function assignmentErrorKey(code?: string) {
  if (code === "group_not_assignable") return "people.assignGroupUnavailable" as const;
  if (code === "student_not_assignable") return "people.assignStudentUnavailable" as const;
  if (code === "student_role_required") return "people.assignRoleUnavailable" as const;
  return "people.assignGroupFailed" as const;
}
