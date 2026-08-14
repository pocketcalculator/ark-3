import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import "@fastify/multipart";
import { DeviceUploadResponseSchema } from "@ark-3/contracts";
import type { AppDeps } from "../context.js";
import { ApiError } from "../errors.js";
import { parseBearerToken } from "../services/deviceAuth.js";
import { validateImage, MAX_IMAGE_BYTES } from "../validation/image.js";
import { newVersion } from "../providers/approvalState.js";
import { runOcrPipeline } from "../services/ocrPipeline.js";
import { correlationId } from "./guards.js";

function singleHeader(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

export function registerDeviceUploadRoute(app: FastifyInstance, deps: AppDeps): void {
  app.post("/api/device/upload", async (request, reply) => {
    const cid = correlationId(request);
    const deviceName = singleHeader(request, "x-device-name");
    if (deviceName === undefined || deviceName === "") {
      throw new ApiError("UNAUTHORIZED", "Missing X-Device-Name header");
    }

    // 1. Rate limit per device before doing any expensive work.
    if (!deps.deviceAuth.checkRateLimit(deviceName)) {
      return sendRateLimited(reply, cid);
    }

    // 2. Bearer token verification (constant time inside the service).
    const token = parseBearerToken(singleHeader(request, "authorization"));
    if (token === null) {
      throw new ApiError("UNAUTHORIZED", "Missing or malformed Authorization header");
    }
    const authorized = await deps.deviceAuth.verifyToken(token);
    if (!authorized) {
      throw new ApiError("UNAUTHORIZED", "Invalid device token");
    }

    // 3. Multipart parse — enforce that the file field is named exactly `image`.
    const file = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES } });
    if (file === undefined) {
      throw new ApiError("VALIDATION_FAILED", "Missing image field in multipart body");
    }
    if (file.fieldname !== "image") {
      throw new ApiError(
        "VALIDATION_FAILED",
        `Multipart file field must be named "image"; got "${file.fieldname}"`,
      );
    }
    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      throw new ApiError("VALIDATION_FAILED", "Image exceeds 5MB limit");
    }

    // 4. Image validation (magic bytes + type + size).
    const validated = validateImage(buffer, file.mimetype);

    // 5. Generate id, 6. store blob.
    const uploadId = randomUUID();
    await deps.blob.upload(uploadId, buffer, validated.contentType);

    const now = deps.now();
    const timestamp = now.toISOString();
    await deps.store.create({
      id: uploadId,
      imageId: uploadId,
      proposedName: "",
      canonicalRgId: "",
      subscriptionDisplayLabel: deps.config.azureSubscriptionDisplayLabel,
      tags: {},
      status: "ocr_pending",
      createdAt: timestamp,
      updatedAt: timestamp,
      version: newVersion(),
      nonce: "",
      nonceExpiresAt: "",
    });

    deps.audit.log("upload_received", { correlationId: cid, uploadId });
    deps.audit.log("ocr_dispatched", { correlationId: cid, uploadId });

    // 7. Dispatch OCR asynchronously; do not await.
    void runOcrPipeline(deps, uploadId, cid);

    // 8. Respond 202 immediately.
    const body = DeviceUploadResponseSchema.parse({
      uploadId,
      status: "ocr_pending",
      acceptedAt: timestamp,
    });
    return reply.code(202).send(body);
  });
}

function sendRateLimited(reply: FastifyReply, cid: string): FastifyReply {
  const error = new ApiError("CONFLICT", "Device rate limit exceeded", {
    statusCode: 429,
  });
  return reply
    .code(429)
    .header("Retry-After", "60")
    .send(error.toEnvelope(cid));
}
