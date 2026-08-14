import type { AppDeps } from "../context.js";
import { ApiError } from "../errors.js";
import { validateResourceGroup } from "../validation/resourceGroup.js";
import { generateNonce, nonceExpiry } from "./nonce.js";

/**
 * Runs the asynchronous OCR + validation pipeline for a single upload record.
 *
 * On success the record transitions ocr_pending → awaiting_approval with a
 * freshly issued nonce and the canonical resolution. On any failure it
 * transitions to the terminal `failed` state. This never throws to its caller;
 * it is fire-and-forget from the upload handler.
 */
export async function runOcrPipeline(
  deps: AppDeps,
  recordId: string,
  correlationId: string,
): Promise<void> {
  const record = await deps.store.get(recordId);
  if (record === null) {
    return;
  }
  if (record.status !== "ocr_pending") {
    return;
  }

  try {
    const image = await deps.blob.download(record.imageId);
    const extraction = await deps.vision.extractResourceGroupName(image.data);

    if (extraction.resourceGroupName === null) {
      await failRecord(deps, recordId, record.version, correlationId, "OCR produced no name");
      deps.audit.log("ocr_failed", { correlationId, uploadId: recordId });
      return;
    }

    deps.audit.log("ocr_succeeded", { correlationId, uploadId: recordId });

    const resolved = await validateResourceGroup({
      name: extraction.resourceGroupName,
      allowlist: deps.config.rgAllowlist,
      arm: deps.arm,
    });

    const now = deps.now();
    await deps.store.update(
      recordId,
      {
        status: "awaiting_approval",
        proposedName: resolved.name,
        canonicalRgId: resolved.id,
        subscriptionDisplayLabel: deps.config.azureSubscriptionDisplayLabel,
        tags: resolved.tags,
        nonce: generateNonce(),
        nonceExpiresAt: nonceExpiry(now),
      },
      record.version,
    );

    deps.audit.log("validation_passed", {
      correlationId,
      uploadId: recordId,
      canonicalRgId: resolved.id,
      proposedName: resolved.name,
    });
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "OCR pipeline error";
    await failRecord(deps, recordId, record.version, correlationId, message);
    deps.audit.log("validation_failed", {
      correlationId,
      uploadId: recordId,
      error: error instanceof ApiError ? error.code : "UNKNOWN",
    });
  }
}

async function failRecord(
  deps: AppDeps,
  recordId: string,
  expectedVersion: string,
  correlationId: string,
  reason: string,
): Promise<void> {
  try {
    await deps.store.update(recordId, { status: "failed" }, expectedVersion);
  } catch {
    // Best-effort terminal transition; a concurrent writer already advanced it.
  }
  deps.audit.log("ocr_failed", { correlationId, uploadId: recordId, error: reason });
}
