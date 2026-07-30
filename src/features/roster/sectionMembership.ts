export type SectionEnrollment = {
  section_id: string;
  role: string;
  status: string;
};

export function hasActiveStudentEnrollment(
  enrollments: readonly SectionEnrollment[] | undefined,
  sectionId: string
) {
  return (enrollments ?? []).some(
    (enrollment) =>
      enrollment.section_id === sectionId &&
      enrollment.role === "student" &&
      enrollment.status === "active"
  );
}

export function currentCourseStudentSectionId(
  enrollments: readonly SectionEnrollment[] | undefined,
  courseGroupIds: ReadonlySet<string>
) {
  return (enrollments ?? []).find(
    (enrollment) =>
      courseGroupIds.has(enrollment.section_id) &&
      enrollment.role === "student" &&
      enrollment.status === "active"
  )?.section_id || "";
}
