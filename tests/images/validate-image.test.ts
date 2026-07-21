import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { AppError } from "@/lib/errors/app-error";
import { MAX_REMOTE_IMAGE_BYTES, readSafeRemoteImage, validateImageBuffer } from "@/lib/images/validate-image";

test("accepts a real, supported image after inspecting its bytes", async () => {
  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#5a3b22" },
  })
    .png()
    .toBuffer();

  const result = await validateImageBuffer(png);
  assert.equal(result.byteLength, png.byteLength);
});

test("rejects a non-image response even if an upstream provider returned bytes", async () => {
  await assert.rejects(
    () => validateImageBuffer(Buffer.from("<html>not an image</html>")),
    (error) => error instanceof AppError && error.code === "IMAGE_DOWNLOAD_INVALID",
  );
});

test("rejects declared remote images above the download limit before buffering them", async () => {
  const response = new Response("small body", {
    headers: { "content-length": String(MAX_REMOTE_IMAGE_BYTES + 1) },
  });

  await assert.rejects(
    () => readSafeRemoteImage(response),
    (error) => error instanceof AppError && error.code === "IMAGE_TOO_LARGE",
  );
});
