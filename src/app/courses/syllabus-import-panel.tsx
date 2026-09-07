"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type {
  SyllabusCategoryDraft,
  SyllabusDraft,
  SyllabusItemDraft,
  SyllabusItemKind,
} from "@/lib/courses/syllabus-parse";

type ParseResponse = { draft: SyllabusDraft } | { error: string };
type ApplyResponse = { courseId: string; applied: { categories: number; items: number } } | { error: string };

const KIND_OPTIONS: SyllabusItemKind[] = ["assignment", "quiz", "exam"];

function isErrorResponse(value: ParseResponse | ApplyResponse): value is { error: string } {
  return "error" in value;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// ISO timestamp -> value for <input type="datetime-local"> in the viewer's local time.
function isoToLocalInput(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function SyllabusImportPanel({ geminiConfigured }: { geminiConfigured: boolean }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<SyllabusDraft | null>(null);
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const canParse = geminiConfigured && !isParsing && (Boolean(file) || text.trim().length >= 8);

  const weightSum = draft ? draft.categories.reduce((sum, category) => sum + (Number(category.weight) || 0), 0) : 0;
  const weightOff = draft !== null && draft.categories.length > 0 && Math.abs(weightSum - 100) > 0.5;

  function updateCourse(field: keyof SyllabusDraft["course"], value: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current.course } as SyllabusDraft["course"];
      if (field === "target_grade") {
        next.target_grade = value.trim() === "" ? null : Number(value);
      } else {
        (next[field] as string | null) = value.trim() === "" ? null : value;
      }
      // name should never be null.
      if (field === "name") {
        next.name = value;
      }
      return { ...current, course: next };
    });
  }

  function updateCategory(index: number, patch: Partial<SyllabusCategoryDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const categories = current.categories.map((category, i) => (i === index ? { ...category, ...patch } : category));
      return { ...current, categories };
    });
  }

  function removeCategory(index: number) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, categories: current.categories.filter((_, i) => i !== index) };
    });
  }

  function addCategory() {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        categories: [...current.categories, { name: "", weight: 0, position: current.categories.length }],
      };
    });
  }

  function updateItem(index: number, patch: Partial<SyllabusItemDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const items = current.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
      return { ...current, items };
    });
  }

  function removeItem(index: number) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, items: current.items.filter((_, i) => i !== index) };
    });
  }

  async function handleParse() {
    setError("");
    setDraft(null);
    setIsParsing(true);

    try {
      const body = new FormData();
      if (file) {
        body.append("file", file);
      }
      if (text.trim()) {
        body.append("text", text.trim());
      }

      const response = await fetch("/api/courses/parse", { method: "POST", body });
      const payload = (await response.json()) as ParseResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to parse syllabus.");
      }

      setDraft(payload.draft);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Unable to parse syllabus.");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleApply() {
    if (!draft) return;
    if (!draft.course.name.trim()) {
      setError("Give the course a name before creating it.");
      return;
    }

    setError("");
    setIsApplying(true);

    try {
      const response = await fetch("/api/courses/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const payload = (await response.json()) as ApplyResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to create course.");
      }

      router.push(`/courses/${payload.courseId}`);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unable to create course.");
      setIsApplying(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Import from syllabus</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Upload a syllabus (PDF, image, or Word .docx) or paste its text. AI fills in the course, weighted categories,
          and dated assignments for you to review before saving.
        </p>
      </div>

      {!geminiConfigured ? (
        <p className="rounded-lg border border-warning bg-surface px-3 py-2 text-sm text-warning">
          Syllabus import is unavailable until GEMINI_API_KEY is configured.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="syllabus-file">
            Syllabus file
          </label>
          <input
            accept=".pdf,.docx,image/*"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1 file:text-sm file:text-ink"
            disabled={!geminiConfigured}
            id="syllabus-file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            ref={fileInputRef}
            type="file"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="syllabus-text">
            …or paste syllabus text
          </label>
          <textarea
            className="min-h-20 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            disabled={!geminiConfigured}
            id="syllabus-text"
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste the grading breakdown and schedule…"
            value={text}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canParse}
          onClick={handleParse}
          type="button"
        >
          {isParsing ? "Parsing…" : "Parse syllabus"}
        </button>
        {file ? <span className="text-xs text-ink-muted">{file.name}</span> : null}
      </div>

      {error ? <p className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{error}</p> : null}

      {draft ? (
        <div className="space-y-5 rounded-lg bg-surface2 p-4">
          {/* Course */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs text-ink-muted" htmlFor="draft-name">
                Course name
              </label>
              <input
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                id="draft-name"
                onChange={(event) => updateCourse("name", event.target.value)}
                value={draft.course.name}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-ink-muted" htmlFor="draft-code">
                Code
              </label>
              <input
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                id="draft-code"
                onChange={(event) => updateCourse("code", event.target.value)}
                value={draft.course.code ?? ""}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-ink-muted" htmlFor="draft-term">
                Term
              </label>
              <input
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                id="draft-term"
                onChange={(event) => updateCourse("term", event.target.value)}
                value={draft.course.term ?? ""}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-ink-muted" htmlFor="draft-target">
                Target grade
              </label>
              <input
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                id="draft-target"
                max={100}
                min={0}
                onChange={(event) => updateCourse("target_grade", event.target.value)}
                type="number"
                value={draft.course.target_grade ?? ""}
              />
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Weighted categories</h3>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${weightOff ? "bg-surface text-warning" : "bg-teal text-on-teal"}`}
              >
                {Math.round(weightSum)}% total
              </span>
            </div>
            {draft.categories.map((category, index) => (
              <div className="flex flex-wrap items-end gap-2" key={index}>
                <div className="min-w-[140px] flex-1 space-y-1">
                  <input
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                    onChange={(event) => updateCategory(index, { name: event.target.value })}
                    placeholder="Category name"
                    value={category.name}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <input
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono text-ink"
                    max={100}
                    min={0}
                    onChange={(event) => updateCategory(index, { weight: Number(event.target.value) })}
                    placeholder="Weight %"
                    type="number"
                    value={category.weight}
                  />
                </div>
                <button
                  className="rounded-lg border border-line px-3 py-2 text-sm text-danger transition hover:bg-surface"
                  onClick={() => removeCategory(index)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface"
              onClick={addCategory}
              type="button"
            >
              Add category
            </button>
          </div>

          {/* Items */}
          {draft.items.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">Assignments, quizzes &amp; exams</h3>
              {draft.items.map((item, index) => (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2" key={index}>
                  <input
                    checked={item.include}
                    className="h-4 w-4"
                    disabled={!item.due_at}
                    onChange={(event) => updateItem(index, { include: event.target.checked })}
                    title={item.due_at ? "Include this item" : "Add a due date to include"}
                    type="checkbox"
                  />
                  <select
                    className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
                    onChange={(event) => updateItem(index, { kind: event.target.value as SyllabusItemKind })}
                    value={item.kind}
                  >
                    {KIND_OPTIONS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                  <input
                    className="min-w-[140px] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                    onChange={(event) => updateItem(index, { title: event.target.value })}
                    placeholder="Title"
                    value={item.title}
                  />
                  <input
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                    onChange={(event) => {
                      const iso = localInputToIso(event.target.value);
                      updateItem(index, { due_at: iso, include: iso ? item.include : false });
                    }}
                    type="datetime-local"
                    value={isoToLocalInput(item.due_at)}
                  />
                  <select
                    className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
                    onChange={(event) => updateItem(index, { categoryName: event.target.value || null })}
                    value={item.categoryName ?? ""}
                  >
                    <option value="">No category</option>
                    {draft.categories.map((category, catIndex) => (
                      <option key={catIndex} value={category.name}>
                        {category.name || "(unnamed)"}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-lg border border-line px-3 py-2 text-sm text-danger transition hover:bg-surface2"
                    onClick={() => removeItem(index)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {draft.warnings.length ? (
            <div className="rounded-lg border border-warning bg-surface px-3 py-2 text-sm text-warning">
              <p className="font-medium">Review notes</p>
              <ul className="mt-1 list-disc pl-5">
                {draft.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isApplying}
            onClick={handleApply}
            type="button"
          >
            {isApplying ? "Creating…" : "Create course"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
