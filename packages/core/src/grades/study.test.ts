import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFORT_HOURS,
  deriveStudyTasks,
  effortHoursFor,
  formatStudyMinutes,
  studyRamp,
  studyRampDayLabel,
  studyRampOverflowNote,
  todayRampMinutes,
  upcomingStudyRamps,
  type StudyItem,
} from "./study";

const base: Omit<StudyItem, "id" | "focusMode" | "dueLocalDate"> = {
  title: "Essay",
  courseName: "History",
  kind: "assignment",
  scoreEarned: null,
  estimatedEffortHours: 6,
};

describe("deriveStudyTasks", () => {
  it("spreads effort evenly across remaining days", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", focusMode: "continuous", dueLocalDate: "2026-08-10" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 3 days out
    expect(tasks).toHaveLength(1);
    expect(tasks[0].durationMinutes).toBe(120); // 6h*60/3 = 120
    expect(tasks[0].priority).toBe(2); // within 3 days
  });

  it("clamps very large even shares to 120 minutes", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", estimatedEffortHours: 10, focusMode: "continuous", dueLocalDate: "2026-08-08" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 1 day
    expect(tasks[0].durationMinutes).toBe(120);
    expect(tasks[0].priority).toBe(1); // due tomorrow
  });

  it("excludes graded and past-due items", () => {
    const items: StudyItem[] = [
      { ...base, id: "graded", scoreEarned: 90, focusMode: "continuous", dueLocalDate: "2026-08-09" },
      { ...base, id: "past", focusMode: "continuous", dueLocalDate: "2026-08-05" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07")).toHaveLength(0);
  });

  it("sizes items with no effort estimate by their kind default", () => {
    const items: StudyItem[] = [
      { ...base, id: "exam", kind: "exam", estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-13" },
      { ...base, id: "quiz", kind: "quiz", estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-10" },
      { ...base, id: "hw", kind: "assignment", estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-13" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    const byId = new Map(tasks.map((t) => [t.id, t.durationMinutes]));
    expect(byId.get("exam")).toBe(35); // 6h on day 2 of a 7-day ramp (weight 4/3 of 13)
    expect(byId.get("quiz")).toBe(20); // 2h on day 1 of a 3-day ramp (1/6)
    expect(byId.get("hw")).toBe(30); // 3h even over 6 days
  });

  it("uses the student's own estimate over the kind default", () => {
    const items: StudyItem[] = [
      { ...base, id: "exam", kind: "exam", estimatedEffortHours: 12, focusMode: "continuous", dueLocalDate: "2026-08-13" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 6 days out
    expect(tasks[0].durationMinutes).toBe(120); // 12h over 6 days fills every day to the cap
  });

  it("still excludes items with an explicit estimate of 0", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", kind: "exam", estimatedEffortHours: 0, focusMode: "continuous", dueLocalDate: "2026-08-09" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07")).toHaveLength(0);
  });

  it("front-loads and prioritizes finish_first ahead of continuous", () => {
    const items: StudyItem[] = [
      { ...base, id: "cont", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-08-13" },
      { ...base, id: "ff", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-13" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 6 days out
    expect(tasks[0].id).toBe("ff");
    expect(tasks[0].priority).toBe(1);
    // ff evenShare = 3*60/6 = 30 -> finish_first max(45, 60)=60
    expect(tasks[0].durationMinutes).toBe(60);
  });

  it("suppresses deferred items while an active finish_first exists", () => {
    const items: StudyItem[] = [
      { ...base, id: "ff", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-12" },
      { ...base, id: "def", estimatedEffortHours: 4, focusMode: "deferred", dueLocalDate: "2026-08-11" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks.map((t) => t.id)).toEqual(["ff"]);
  });

  it("runs a deferred item as continuous when no finish_first is active", () => {
    const items: StudyItem[] = [
      { ...base, id: "def", estimatedEffortHours: 4, focusMode: "deferred", dueLocalDate: "2026-08-11" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("def");
  });

  it("respects the horizon", () => {
    const items: StudyItem[] = [
      { ...base, id: "far", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-09-01" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07", 7)).toHaveLength(0);
  });

  it("sorts finish_first items by due date even when passed out of order", () => {
    const items: StudyItem[] = [
      { ...base, id: "ff-later", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-13" },
      { ...base, id: "ff-earlier", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-10" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks[0].id).toBe("ff-earlier");
    expect(tasks[1].id).toBe("ff-later");
  });

  it("sorts same-priority continuous items by due date even when passed out of order", () => {
    const items: StudyItem[] = [
      { ...base, id: "cont-later", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-08-14" },
      { ...base, id: "cont-earlier", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-08-12" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks[0].id).toBe("cont-earlier");
    expect(tasks[1].id).toBe("cont-later");
  });
});

describe("study ramp in deriveStudyTasks", () => {
  const exam: StudyItem = {
    ...base, id: "exam", title: "Midterm", courseName: "Chemistry", kind: "exam",
    estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-14",
  };

  it("grows the exam block toward the exam day when earlier days were done", () => {
    const minutes = [
      ["2026-08-07", 0],
      ["2026-08-10", 25 + 35 + 45],
      ["2026-08-13", 25 + 35 + 45 + 50 + 60 + 70],
    ].map(([today, done]) => deriveStudyTasks([exam], today as string, 7, { exam: done as number })[0].durationMinutes);
    expect(minutes).toEqual([25, 50, 75]);
  });

  it("moves the whole estimate onto the days left when nothing was checked off", () => {
    expect(deriveStudyTasks([exam], "2026-08-10")[0].durationMinutes).toBe(70); // 360 over days 4-7
    expect(deriveStudyTasks([exam], "2026-08-13")[0].durationMinutes).toBe(120); // capped
  });

  it("names the ramp day in the reason", () => {
    const [task] = deriveStudyTasks([exam], "2026-08-11");
    expect(task.reason).toBe("Chemistry · Exam in 3 days · day 5 of 7 of your study ramp.");
    const [quiz] = deriveStudyTasks([{ ...exam, kind: "quiz" }], "2026-08-13");
    expect(quiz.reason).toBe("Chemistry · Quiz tomorrow · day 3 of 3 of your study ramp.");
  });

  it("keeps assignment reasons plain", () => {
    const [task] = deriveStudyTasks([{ ...exam, kind: "assignment" }], "2026-08-11");
    expect(task.reason).toBe("Chemistry · Due in 3 days · reserving study time.");
  });

  it("waits for a quiz's ramp to start unless it is finish_first", () => {
    const quiz: StudyItem = { ...exam, kind: "quiz", dueLocalDate: "2026-08-12" };
    expect(deriveStudyTasks([quiz], "2026-08-07")).toHaveLength(0);
    const [task] = deriveStudyTasks([{ ...quiz, focusMode: "finish_first" }], "2026-08-07");
    expect(task.priority).toBe(1);
    expect(task.durationMinutes).toBe(50); // even share 24 min, doubled and rounded to 5
    expect(task.reason).toBe("Chemistry · Quiz in 5 days · reserving study time.");
  });

  it("redistributes what's left after study done on earlier days", () => {
    const fresh = deriveStudyTasks([exam], "2026-08-11")[0].durationMinutes;
    const after = deriveStudyTasks([exam], "2026-08-11", 7, { exam: 160 })[0].durationMinutes;
    expect(fresh).toBe(120); // 360 min over days 5-7 fills each to the cap
    expect(after).toBe(60); // 200 min left: 200 * (7/3) / 8 = 58.3
  });

  it("drops an item once its effort is fully studied", () => {
    expect(deriveStudyTasks([exam], "2026-08-11", 7, { exam: 360 })).toHaveLength(0);
    expect(deriveStudyTasks([{ ...exam, focusMode: "finish_first" }], "2026-08-11", 7, { exam: 400 })).toHaveLength(0);
  });

  it("caps a finish_first block at what's left to study", () => {
    const [task] = deriveStudyTasks([{ ...exam, focusMode: "finish_first" }], "2026-08-11", 7, { exam: 340 });
    expect(task.durationMinutes).toBe(20);
  });
});

describe("studyRamp", () => {
  const exam = { id: "exam", kind: "exam" as const, estimatedEffortHours: null, dueLocalDate: "2026-08-14" };

  it("spreads an exam over the 7 days before it, largest the day before", () => {
    const ramp = studyRamp(exam, "2026-08-07");
    expect(ramp.leadDays).toBe(7);
    expect(ramp.days.map((day) => day.localDate)).toEqual([
      "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13",
    ]);
    expect(ramp.days.map((day) => day.minutes)).toEqual([25, 35, 45, 50, 60, 70, 75]);
    expect(ramp.days.reduce((sum, day) => sum + day.minutes, 0)).toBe(360);
    expect(ramp.days[0].isToday).toBe(true);
    expect(todayRampMinutes(ramp)).toBe(25);
  });

  it("starts the ramp at its first day when the exam is further out", () => {
    const ramp = studyRamp({ ...exam, dueLocalDate: "2026-08-20" }, "2026-08-07");
    expect(ramp.days[0]).toMatchObject({ localDate: "2026-08-13", dayNumber: 1, isToday: false });
    expect(todayRampMinutes(ramp)).toBe(0);
  });

  it("gives a quiz a 3-day ramp", () => {
    const ramp = studyRamp({ ...exam, kind: "quiz" }, "2026-08-07");
    expect(ramp.days.map((day) => [day.localDate, day.dayNumber, day.minutes])).toEqual([
      ["2026-08-11", 1, 20],
      ["2026-08-12", 2, 40],
      ["2026-08-13", 3, 60],
    ]);
  });

  it("keeps assignments even", () => {
    const ramp = studyRamp({ ...exam, kind: "assignment", estimatedEffortHours: 3.5 }, "2026-08-07");
    expect(ramp.days.map((day) => day.minutes)).toEqual([30, 30, 30, 30, 30, 30, 30]);
  });

  it("keeps every day within 15-120 minutes in 5-minute steps", () => {
    for (const hours of [0.5, 1, 2.5, 6, 9, 14, 30]) {
      for (const kind of ["exam", "quiz", "assignment"] as const) {
        const ramp = studyRamp({ ...exam, kind, estimatedEffortHours: hours }, "2026-08-07");
        for (const day of ramp.days) {
          expect(day.minutes % 5).toBe(0);
          expect(day.minutes).toBeGreaterThanOrEqual(15);
          expect(day.minutes).toBeLessThanOrEqual(120);
        }
        const total = ramp.days.reduce((sum, day) => sum + day.minutes, 0);
        const cap = ramp.days.length * 120;
        expect(Math.abs(total - Math.min(hours * 60, cap))).toBeLessThanOrEqual(Math.max(15, ramp.days.length * 2.5));
      }
    }
  });

  it("drops the earliest days when too little is left to give each 15 minutes", () => {
    const ramp = studyRamp(exam, "2026-08-07", 320);
    expect(ramp.remainingMinutes).toBe(40);
    expect(ramp.days.map((day) => [day.dayNumber, day.minutes])).toEqual([[6, 20], [7, 20]]);
  });

  it("puts what's left into one block on the due date and nothing after", () => {
    const dueToday = studyRamp(exam, "2026-08-14");
    expect(dueToday.days).toEqual([{ localDate: "2026-08-14", dayNumber: 0, minutes: 120, isToday: true }]);
    expect(dueToday.unscheduledMinutes).toBe(240);
    expect(studyRamp(exam, "2026-08-15").days).toEqual([]);
    expect(studyRamp(exam, "2026-08-10", 360).days).toEqual([]);
  });
});

describe("unscheduled study", () => {
  const exam = { id: "exam", kind: "exam" as const, estimatedEffortHours: 12, dueLocalDate: "2026-08-14" };

  it("reports effort beyond 120 minutes a day instead of dropping it silently", () => {
    const ramp = studyRamp(exam, "2026-08-11"); // 3 days left, 720 min
    expect(ramp.days.map((day) => day.minutes)).toEqual([120, 120, 120]);
    expect(ramp.unscheduledMinutes).toBe(360);
    expect(studyRampOverflowNote(ramp)).toBe("6 h won't fit before the exam at 2 h a day. Start studying earlier.");
  });

  it("reports nothing when it all fits", () => {
    const ramp = studyRamp(exam, "2026-08-07");
    expect(ramp.unscheduledMinutes).toBe(0);
    expect(studyRampOverflowNote(ramp)).toBeNull();
    expect(studyRampOverflowNote({ kind: "quiz", unscheduledMinutes: 150 })).toBe(
      "2 h 30 min won't fit before the quiz at 2 h a day. Start studying earlier.",
    );
  });
});

describe("upcomingStudyRamps", () => {
  const item = (overrides: Partial<StudyItem>): StudyItem => ({
    ...base, id: "x", kind: "exam", estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-12", ...overrides,
  });

  it("returns ramps for unscored upcoming exams and quizzes only", () => {
    const ramps = upcomingStudyRamps(
      [
        item({ id: "exam" }),
        item({ id: "quiz", kind: "quiz" }),
        item({ id: "hw", kind: "assignment" }),
        item({ id: "graded", scoreEarned: 80 }),
        item({ id: "past", dueLocalDate: "2026-08-01" }),
        item({ id: "none", estimatedEffortHours: 0 }),
        item({ id: "studied" }),
      ],
      "2026-08-07",
      { studied: 360 },
    );
    expect(Object.keys(ramps).sort()).toEqual(["exam", "quiz"]);
    expect(ramps.exam.days.map((day) => day.dayNumber)).toEqual([3, 4, 5, 6, 7]);
  });

  it("holds deferred items back while a finish_first item is active, like Today", () => {
    const items = [
      item({ id: "deferred", focusMode: "deferred" }),
      item({ id: "ff-hw", kind: "assignment", focusMode: "finish_first" }),
    ];
    expect(Object.keys(upcomingStudyRamps(items, "2026-08-07"))).toEqual([]);
    expect(Object.keys(upcomingStudyRamps([items[0]], "2026-08-07"))).toEqual(["deferred"]);
  });

  it("shows a finish_first item's front-loaded block today, matching Today's block", () => {
    const ff = item({ id: "ff", kind: "quiz", focusMode: "finish_first" }); // quiz in 5 days, ramp not started
    const ramps = upcomingStudyRamps([ff], "2026-08-07");
    const [task] = deriveStudyTasks([ff], "2026-08-07");
    expect(ramps.ff.days[0]).toEqual({ localDate: "2026-08-07", dayNumber: 0, minutes: task.durationMinutes, isToday: true });
    expect(ramps.ff.days.slice(1).map((day) => day.dayNumber)).toEqual([1, 2, 3]);

    const inRamp = item({ id: "ff", focusMode: "finish_first" }); // exam in 5 days, day 3 of 7
    const [inRampTask] = deriveStudyTasks([inRamp], "2026-08-07");
    expect(upcomingStudyRamps([inRamp], "2026-08-07").ff.days[0]).toMatchObject({
      dayNumber: 3,
      minutes: inRampTask.durationMinutes,
      isToday: true,
    });
  });
});

describe("study ramp labels", () => {
  it("names nearby days and formats minutes", () => {
    expect(studyRampDayLabel("2026-10-19", "2026-10-19")).toBe("Today");
    expect(studyRampDayLabel("2026-10-20", "2026-10-19")).toBe("Tomorrow");
    expect(studyRampDayLabel("2026-10-21", "2026-10-19")).toBe("Wed Oct 21");
    expect(formatStudyMinutes(45)).toBe("45 min");
    expect(formatStudyMinutes(120)).toBe("2 h");
    expect(formatStudyMinutes(95)).toBe("1 h 35 min");
  });
});

describe("effortHoursFor", () => {
  it("defaults by kind when there is no estimate", () => {
    expect(DEFAULT_EFFORT_HOURS).toEqual({ exam: 6, quiz: 2, assignment: 3 });
    expect(effortHoursFor({ kind: "exam", estimatedEffortHours: null })).toBe(6);
    expect(effortHoursFor({ kind: "quiz", estimatedEffortHours: null })).toBe(2);
    expect(effortHoursFor({ kind: "assignment", estimatedEffortHours: null })).toBe(3);
  });

  it("returns a positive own estimate unchanged", () => {
    expect(effortHoursFor({ kind: "exam", estimatedEffortHours: 1.5 })).toBe(1.5);
  });
});
