import type { OperationResult } from "@ark-3/contracts";
import type { AppDeps } from "../context.js";
import type { ApprovalRecord } from "../providers/approvalState.js";
import type { ResolvedResourceGroup } from "../providers/arm.js";
import { ApiError } from "../errors.js";
import { validateResourceGroup } from "../validation/resourceGroup.js";
import { runOcrPipeline } from "./ocrPipeline.js";

export interface ApproveInput {
  readonly nonce: string;
  readonly version: string;
  readonly actorId: string;
  readonly correlationId: string;
}

export interface RejectInput {
  readonly nonce: string;
  readonly version: string;
  readonly reason?: string;
  readonly actorId: string;
  readonly correlationId: string;
}

function assertAwaitingApproval(record: ApprovalRecord): void {
  if (record.status !== "awaiting_approval") {
    throw new ApiError(
      "TRANSITION_INVALID",
      `Record is ${record.status}, not awaiting_approval`,
    );
  }
}

function assertNonce(record: ApprovalRecord, provided: string, now: Date): void {
  if (record.nonce === "" || record.nonce !== provided) {
    throw new ApiError("NONCE_INVALID", "Approval nonce is invalid or already used");
  }
  if (now.getTime() > new Date(record.nonceExpiresAt).getTime()) {
    throw new ApiError("NONCE_EXPIRED", "Approval nonce has expired");
  }
}

function assertVersion(record: ApprovalRecord, provided: string): void {
  if (record.version !== provided) {
    throw new ApiError("VERSION_MISMATCH", "Record version does not match");
  }
}

export class ApprovalService {
  private readonly deps: AppDeps;

  public constructor(deps: AppDeps) {
    this.deps = deps;
  }

  public async approve(id: string, input: ApproveInput): Promise<OperationResult> {
    const now = this.deps.now();
    const record = await this.requireRecord(id);
    assertAwaitingApproval(record);
    assertNonce(record, input.nonce, now);
    assertVersion(record, input.version);

    const date = now.toISOString().slice(0, 10);
    const deletionCount = await this.deps.store.getDailyDeletionCount(date);
    if (deletionCount >= this.deps.config.dailyDeletionCap) {
      throw new ApiError("CONFLICT", "Daily deletion cap reached", {
        statusCode: 429,
      });
    }

    // Transition to `deleting`, consuming the nonce (optimistic concurrency).
    let current = await this.deps.store.update(
      id,
      { status: "deleting", nonce: "" },
      record.version,
    );
    this.deps.audit.log("deletion_started", {
      correlationId: input.correlationId,
      actorId: input.actorId,
      uploadId: id,
      canonicalRgId: record.canonicalRgId,
    });

    // TOCTOU re-validation: re-run every gate against live ARM state.
    let resolved: ResolvedResourceGroup;
    try {
      resolved = await validateResourceGroup({
        name: record.proposedName,
        allowlist: this.deps.config.rgAllowlist,
        arm: this.deps.arm,
      });
    } catch (error) {
      await this.safeFail(id, current.version);
      this.deps.audit.log("revalidation_failed", {
        correlationId: input.correlationId,
        actorId: input.actorId,
        uploadId: id,
        error: error instanceof ApiError ? error.code : "UNKNOWN",
      });
      throw new ApiError(
        "REVALIDATION_FAILED",
        "Resource group failed re-validation before deletion",
      );
    }

    try {
      await this.deps.arm.deleteResourceGroup(resolved.id);
    } catch (error) {
      await this.safeFail(id, current.version);
      this.deps.audit.log("deletion_failed", {
        correlationId: input.correlationId,
        actorId: input.actorId,
        uploadId: id,
        canonicalRgId: resolved.id,
        error: error instanceof Error ? error.message : "unknown",
      });
      throw new ApiError("DELETION_FAILED", "Resource group deletion failed");
    }

    await this.deps.store.incrementDailyDeletionCount(date);
    current = await this.deps.store.update(
      id,
      { status: "deleted" },
      current.version,
    );

    this.deps.audit.log("deletion_succeeded", {
      correlationId: input.correlationId,
      actorId: input.actorId,
      uploadId: id,
      canonicalRgId: resolved.id,
      status: current.status,
    });
    this.deps.audit.log("approval_granted", {
      correlationId: input.correlationId,
      actorId: input.actorId,
      uploadId: id,
      canonicalRgId: resolved.id,
    });

    return {
      success: true,
      canonicalRgId: resolved.id,
      completedAt: this.deps.now().toISOString(),
      message: `Deleted ${resolved.name}`,
    };
  }

  public async reject(id: string, input: RejectInput): Promise<OperationResult> {
    const now = this.deps.now();
    const record = await this.requireRecord(id);
    assertAwaitingApproval(record);
    assertNonce(record, input.nonce, now);
    assertVersion(record, input.version);

    await this.deps.store.update(
      id,
      { status: "rejected", nonce: "" },
      record.version,
    );

    this.deps.audit.log("approval_rejected", {
      correlationId: input.correlationId,
      actorId: input.actorId,
      uploadId: id,
      ...(input.reason !== undefined ? { status: input.reason } : {}),
    });

    return {
      success: true,
      completedAt: now.toISOString(),
      message: "Rejected",
    };
  }

  public async ocrRetry(id: string, correlationId: string): Promise<OperationResult> {
    const record = await this.requireRecord(id);
    if (record.status !== "ocr_pending") {
      throw new ApiError(
        "TRANSITION_INVALID",
        `OCR retry is only valid for ocr_pending records (got ${record.status})`,
      );
    }

    this.deps.audit.log("ocr_dispatched", { correlationId, uploadId: id });
    // Fire-and-forget re-dispatch; failures are captured in the record state.
    void runOcrPipeline(this.deps, id, correlationId);

    return {
      success: true,
      completedAt: this.deps.now().toISOString(),
      message: "OCR retry dispatched",
    };
  }

  private async requireRecord(id: string): Promise<ApprovalRecord> {
    const record = await this.deps.store.get(id);
    if (record === null) {
      throw new ApiError("NOT_FOUND", `Record ${id} not found`);
    }
    return record;
  }

  private async safeFail(id: string, expectedVersion: string): Promise<void> {
    try {
      await this.deps.store.update(id, { status: "failed" }, expectedVersion);
    } catch {
      // Concurrent writer already advanced the record; nothing to do.
    }
  }
}
