import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { SYLLABUS_MAX_UPLOAD_BYTES, type MobileSyllabusImportFile } from "./api";

const PDF_TYPE = "application/pdf";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Each pass shrinks the longest side and quality further; most phone photos fit on the first.
const PHOTO_PASSES = [
  { maxSide: 2000, compress: 0.7 },
  { maxSide: 1600, compress: 0.55 },
  { maxSide: 1200, compress: 0.45 },
];

type PickedPhoto = Pick<ImagePicker.ImagePickerAsset, "uri" | "width" | "height">;

function fileSize(uri: string): number | null {
  try {
    return new File(uri).size || null;
  } catch {
    return null;
  }
}

/** Re-encodes a photo as JPEG, stepping down size/quality until it fits the upload limit. */
export async function compressSyllabusPhoto(photo: PickedPhoto, maxBytes = SYLLABUS_MAX_UPLOAD_BYTES): Promise<MobileSyllabusImportFile> {
  let last: MobileSyllabusImportFile | null = null;

  for (const pass of PHOTO_PASSES) {
    const context = ImageManipulator.manipulate(photo.uri);
    if (Math.max(photo.width, photo.height) > pass.maxSide) {
      context.resize(photo.width >= photo.height ? { width: pass.maxSide } : { height: pass.maxSide });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: pass.compress, format: SaveFormat.JPEG });
    last = { uri: saved.uri, name: "syllabus.jpg", type: "image/jpeg", size: fileSize(saved.uri) };
    // Unknown size: upload as is; a server 413 maps to the same too-large message.
    if (!last.size || last.size <= maxBytes) return last;
  }

  // Still too large after every pass: parseSyllabusImport rejects it before uploading.
  return last!;
}

/** Opens the camera. Resolves null when the student cancels. */
export async function takeSyllabusPhoto(maxBytes = SYLLABUS_MAX_UPLOAD_BYTES): Promise<MobileSyllabusImportFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Camera access is off. Allow it in Settings, or choose a photo or file instead.");
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  return compressSyllabusPhoto(result.assets[0], maxBytes);
}

/** Opens the photo library (the system picker needs no permission prompt). Resolves null on cancel. */
export async function chooseSyllabusPhoto(maxBytes = SYLLABUS_MAX_UPLOAD_BYTES): Promise<MobileSyllabusImportFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  return compressSyllabusPhoto(result.assets[0], maxBytes);
}

/** Opens the document picker for a PDF or Word (.docx) file. Resolves null on cancel. */
export async function chooseSyllabusDocument(): Promise<MobileSyllabusImportFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: [PDF_TYPE, DOCX_TYPE],
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  // Some Android providers omit the MIME type; fall back to the extension.
  const type = asset.mimeType ?? (asset.name.toLowerCase().endsWith(".docx") ? DOCX_TYPE : PDF_TYPE);
  return { uri: asset.uri, name: asset.name, type, size: asset.size ?? fileSize(asset.uri) };
}
