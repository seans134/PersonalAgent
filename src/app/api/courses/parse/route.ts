import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { parseSyllabus } from "@/lib/courses/syllabus-parse";
import type { GeminiPart } from "@/lib/gemini/client";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { SYLLABUS_IMPORT_LIMIT_STATUS } from "@personal-agent/core";
import { proLimitsEnforced } from "@/lib/subscription/config";
import { syllabusImportLimitBody, syllabusImportUsage } from "@/lib/subscription/usage";

export const runtime = "nodejs";

// Vercel rejects serverless request bodies over ~4.5 MB before the handler runs, so cap uploads
// there and answer with a readable 413 instead of letting clients hit an opaque platform error.
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;
// Multipart framing and the optional pasted text ride along with the file in the request body.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const TOO_LARGE_MESSAGE =
  "That file is too large to upload. Please use a syllabus under 4.5 MB, or paste the text instead.";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Gemini reads these natively as inlineData; docx is extracted to text first.
const INLINE_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

function inferMimeType(file: File): string {
  if (file.type) {
    return file.type;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) return DOCX_MIME;
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function tooLarge() {
  return NextResponse.json({ error: TOO_LARGE_MESSAGE }, { status: 413 });
}

async function fileToParts(file: File): Promise<GeminiPart[]> {
  const mimeType = inferMimeType(file);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (mimeType === DOCX_MIME || file.name.toLowerCase().endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    if (!text) {
      throw new Error("That Word document had no readable text.");
    }
    return [{ text: `Syllabus text:\n${text}` }];
  }

  if (INLINE_MIME_TYPES.has(mimeType)) {
    return [{ inlineData: { mimeType, data: buffer.toString("base64") } }];
  }

  throw new Error("Unsupported file type. Upload a PDF, image, or Word (.docx) file, or paste the text instead.");
}

// Mobile app depends on this response shape (re-exported as /api/mobile/courses/import/parse) — see src/app/api/mobile-contract.test.ts before changing the envelope.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return tooLarge();
  }

  // Free accounts get FREE_SYLLABUS_IMPORTS_PER_TERM imports a term once PRO_ENFORCE_LIMITS is on.
  // Checked before parsing so a blocked import doesn't spend an AI call; apply checks again.
  if (proLimitsEnforced()) {
    const usage = await syllabusImportUsage(auth.supabase, auth.user.id);
    if (!usage.allowed) {
      return NextResponse.json(syllabusImportLimitBody(usage), { status: SYLLABUS_IMPORT_LIMIT_STATUS });
    }
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const pastedText = typeof form.get("text") === "string" ? (form.get("text") as string).trim() : "";

    let parts: GeminiPart[];
    if (file instanceof File && file.size > MAX_UPLOAD_BYTES) {
      return tooLarge();
    }

    if (file instanceof File && file.size > 0) {
      parts = await fileToParts(file);
    } else if (pastedText.length > 0) {
      parts = [{ text: `Syllabus text:\n${pastedText}` }];
    } else {
      return NextResponse.json({ error: "Upload a syllabus file or paste some text first." }, { status: 400 });
    }

    const { data: profile } = await auth.supabase
      .from("user_profiles")
      .select("timezone")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    const timezone =
      typeof profile?.timezone === "string" && profile.timezone.trim() ? profile.timezone.trim() : "America/Toronto";
    const today = new Date().toISOString().slice(0, 10);

    const draft = await parseSyllabus({ parts, timezone, today });
    return NextResponse.json({ draft }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse syllabus.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
