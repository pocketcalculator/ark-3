import { ApiError } from "../errors.js";

export type SupportedImageContentType = "image/jpeg" | "image/png";

export interface ValidatedImage {
  readonly contentType: SupportedImageContentType;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function hasPrefix(data: Buffer, prefix: Buffer): boolean {
  if (data.length < prefix.length) {
    return false;
  }
  return data.subarray(0, prefix.length).equals(prefix);
}

/**
 * Validates an uploaded image by size, declared content-type, and magic bytes.
 * The magic bytes are authoritative — a mismatching content-type is rejected.
 */
export function validateImage(
  data: Buffer,
  declaredContentType: string,
): ValidatedImage {
  if (data.length === 0) {
    throw new ApiError("VALIDATION_FAILED", "Image payload is empty");
  }
  if (data.length > MAX_IMAGE_BYTES) {
    throw new ApiError("VALIDATION_FAILED", "Image exceeds 5MB limit");
  }

  const normalizedType = declaredContentType.split(";")[0]?.trim().toLowerCase() ?? "";

  const isJpeg = hasPrefix(data, JPEG_MAGIC);
  const isPng = hasPrefix(data, PNG_MAGIC);

  if (!isJpeg && !isPng) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Image content is not a valid JPEG or PNG",
    );
  }

  if (isJpeg) {
    if (normalizedType !== "image/jpeg" && normalizedType !== "image/jpg") {
      throw new ApiError(
        "VALIDATION_FAILED",
        "Content-Type does not match JPEG image bytes",
      );
    }
    return { contentType: "image/jpeg" };
  }

  if (normalizedType !== "image/png") {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Content-Type does not match PNG image bytes",
    );
  }
  return { contentType: "image/png" };
}
