import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { parseSyllabus } from "@/lib/courses/syllabus-parse";
import type { GeminiPart } from "@/lib/gemini/client";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB; note Vercel serverless bodies cap around 4.5 MB.
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

async function fileToParts(file: File): Promise<GeminiPart[]> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That file is too large. Please upload a syllabus under 15 MB.");
  }

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

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const pastedText = typeof form.get("text") === "string" ? (form.get("text") as string).trim() : "";

    let parts: GeminiPart[];
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
