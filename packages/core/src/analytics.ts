// Core-loop analytics event names shared by web and mobile, so both surfaces report
// identical events. Properties are counts and enums only, never names, emails or free text.
export const analyticsEvents = {
  onboardingCompleted: "onboarding_completed",
  coursesReady: "courses_ready",
  courseCreated: "course_created",
  syllabusImported: "syllabus_imported",
  planGenerated: "plan_generated",
  planAccepted: "plan_accepted",
  planItemCompleted: "plan_item_completed",
  neededScoreViewed: "needed_score_viewed",
  scheduleImportParsed: "schedule_import_parsed",
  scheduleImportCompleted: "schedule_import_completed",
  scheduleImportFailed: "schedule_import_failed",
  scheduleAdded: "schedule_added",
  // Properties: week_count, crunch_week_count.
  semesterViewed: "semester_viewed",
  // Properties: term_count, course_count (courses counted in GPA).
  gpaViewed: "gpa_viewed",
  // A share link was created for a course (no properties).
  courseShared: "course_shared",
  // A classmate added a shared course. Properties: item_count.
  courseJoined: "course_joined",
  // A study session was saved (timer stopped or time logged). Properties: minutes_bucket
  // ("<15" | "15-30" | "30-60" | "60+", see studyMinutesBucket), source ("timer" | "manual").
  studySessionCompleted: "study_session_completed",
} as const;

export type AnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];

export type SyllabusImportSource = "photo" | "pdf" | "docx" | "text";

/** Where an imported syllabus came from: the uploaded file's type, or pasted text when there's no file. */
export function syllabusImportSource(file: { name: string; type?: string | null } | null): SyllabusImportSource {
  if (!file) return "text";
  const type = (file.type ?? "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif)$/.test(name)) return "photo";
  if (type.includes("wordprocessingml") || name.endsWith(".docx")) return "docx";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "text";
}

/** A student is ready for a study plan once they have at least one course and some class times. */
export function hasCoursesReady(progress: { courseCount: number; classTimeCount: number }): boolean {
  return progress.courseCount > 0 && progress.classTimeCount > 0;
}
