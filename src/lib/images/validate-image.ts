import sharp from "sharp";

import { AppError } from "@/lib/errors/app-error";

export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8_192;
// Sharp reports AVIF files as the HEIF container format, even when their media
// type is image/avif. The image is normalized to PNG before WordPress upload.
const acceptedFormats = new Set(["avif", "heif", "jpeg", "png", "webp"]);

export async function readSafeRemoteImage(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new AppError("IMAGE_TOO_LARGE");
  }

  if (!response.body) {
    throw new AppError("IMAGE_DOWNLOAD_INVALID");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      length += value.byteLength;

      if (length > MAX_REMOTE_IMAGE_BYTES) {
        throw new AppError("IMAGE_TOO_LARGE");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return validateImageBuffer(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export async function validateImageBuffer(buffer: Buffer) {
  if (buffer.byteLength === 0) {
    throw new AppError("IMAGE_DOWNLOAD_INVALID");
  }

  if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new AppError("IMAGE_TOO_LARGE");
  }

  try {
    const metadata = await sharp(buffer, { failOn: "error" }).metadata();

    if (
      !metadata.format ||
      !acceptedFormats.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION
    ) {
      throw new AppError("IMAGE_DOWNLOAD_INVALID");
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("IMAGE_DOWNLOAD_INVALID", { cause: error });
  }

  return buffer;
}
