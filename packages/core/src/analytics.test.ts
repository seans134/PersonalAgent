import { describe, expect, it } from "vitest";
import { analyticsEvents, hasCoursesReady, syllabusImportSource } from "./analytics";

describe("analyticsEvents", () => {
  it("uses unique snake_case names", () => {
    const names = Object.values(analyticsEvents);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(analyticsEvents.syllabusImported).toBe("syllabus_imported");
  });
});

describe("syllabusImportSource", () => {
  it("classifies files by type, then extension", () => {
    expect(syllabusImportSource(null)).toBe("text");
    expect(syllabusImportSource({ name: "syllabus.jpg", type: "image/jpeg" })).toBe("photo");
    expect(syllabusImportSource({ name: "IMG_0001.HEIC", type: "" })).toBe("photo");
    expect(syllabusImportSource({ name: "bio.pdf", type: "application/pdf" })).toBe("pdf");
    expect(
      syllabusImportSource({
        name: "x",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("docx");
    expect(syllabusImportSource({ name: "Chem.docx" })).toBe("docx");
  });
});

describe("hasCoursesReady", () => {
  it("needs a course and class times", () => {
    expect(hasCoursesReady({ courseCount: 1, classTimeCount: 2 })).toBe(true);
    expect(hasCoursesReady({ courseCount: 1, classTimeCount: 0 })).toBe(false);
    expect(hasCoursesReady({ courseCount: 0, classTimeCount: 3 })).toBe(false);
  });
});
