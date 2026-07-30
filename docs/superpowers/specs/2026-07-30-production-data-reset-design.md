# Production Data Reset Design

**Approved:** 2026-07-30  
**Scope:** Supabase project `ojmbupftdikwmlqvibwt`

## Goal

Deliver the live TC2007B teaching platform with its reusable teaching assets
intact and no historical student, class, assessment, grade, note, or QA data.
The reset runs only after implementation, deployment, and full production QA,
so the QA records are removed as part of the same final operation.

## Retained teaching assets

The reset preserves:

- course id `tc2007b`, code `TC2007B`, and title `Information Security`;
- all `content_items`, including lecture decks and their storage objects;
- all current `question_banks`, `questions`, and `question_options`;
- `activity_templates`, because they describe reusable teaching activities;
- source `content_uploads` and `generation_jobs`, including their links to
  generated decks and question banks;
- the legacy question library:
  `quiz_courses`, `quiz_lectures`, `quiz_questions`, and `quiz_options`;
- the professor's platform-owner profile, authentication account, and active
  course-level owner/instructor access.

Retained rows must keep their identifiers. Storage objects are not moved or
deleted.

## Clean course structure

After the reset, TC2007B is the only course and is active. Its term label is
`Current semester`; it contains exactly four clean groups:

| Group code | Name | Initial status | Initial staff |
|---|---|---|---|
| `401` | `Group 401` | Active | Professor Mahdi Zareei |
| `402` | `Group 402` | Planned | None |
| `501` | `Group 501` | Planned | None |
| `502` | `Group 502` | Planned | None |

The owner remains a course-level `platform_owner` and `instructor`. The owner
also receives an instructor enrollment in Group 401. No student profile,
membership, enrollment, invitation, or authentication account remains.

The other three professors are not invented or pre-created. They will be added
later with their real identities and assigned to their groups.

The retained legacy `quiz_courses` row is normalized to
`TC2007B Question Library`; its lecture, question, and option identifiers remain
unchanged.

## Deleted operational and personal data

The reset deletes all rows from:

- `class_sessions` and `class_student_notes`;
- `content_releases` and `release_events`;
- `activity_instances`;
- `student_attempts` and `student_responses`;
- `pulse_rounds` and `pulse_answers`;
- `exit_tickets`, `course_exit_tickets`, `portfolio_entries`, and
  `course_portfolio_submissions`;
- `gradebook_categories`, `gradebook_items`, `gradebook_scores`,
  `grade_adjustments`, and `participation_events`;
- `roster_imports`, `profile_identity_confirmations`, and
  `external_access_grants`;
- `audit_log`;
- legacy `quiz_sessions`, `quiz_attempts`, `quiz_attempt_questions`, and
  `quiz_answers`;
- all existing sections and section enrollments before the four clean groups
  are inserted;
- all non-owner course memberships and profiles.

Authentication users linked to removed profiles are deleted from `auth.users`.
Any non-owner authentication user belonging to this platform is also removed,
so old QA/student credentials cannot sign back in and recreate identity rows.
The platform-owner authentication user is never deleted or unlinked.

## Implementation

The reset is a versioned, one-time SQL migration with a transaction and explicit
preconditions:

1. Require exactly one active platform-owner profile for TC2007B.
2. Record retained asset counts inside the transaction.
3. Delete dependent operational rows in foreign-key-safe order.
4. Delete non-owner profiles and their authentication users.
5. Normalize TC2007B metadata and recreate Groups 401, 402, 501, and 502.
6. Restore the owner's course-level roles and Group 401 instructor enrollment.
7. Assert that retained asset counts and identifiers are unchanged.
8. Assert that every historical-data table is empty and only the approved
   owner/course/groups/access rows remain.

Any failed precondition or postcondition rolls back the entire reset.

## Verification and rollout order

1. Finish and review the class-management release.
2. Finish and review the projector/controller release.
3. Finish and review combined grading and question timing.
4. Deploy all application, function, and schema changes.
5. Complete professor and student production rehearsals using QA records.
6. Capture count-only pre-reset evidence; do not export personal row contents.
7. Apply the reset migration once.
8. Capture exact post-reset counts.
9. Sign in as the retained professor and verify:
   - TC2007B opens;
   - Groups 401, 402, 501, and 502 are present as specified;
   - Classes, People/student roster, Gradebook history, Review releases, and
     notes are empty;
   - retained lectures open through the real gated Content entry point;
   - retained question banks are available to the professor;
   - a removed QA/student account cannot obtain course access.

The platform is not called clean until both the database assertions and the
signed-in clean-state browser checks pass.
