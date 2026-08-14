import { createHash } from "node:crypto";
import pino, { type Logger } from "pino";

export type AuditEvent =
  | "upload_received"
  | "ocr_dispatched"
  | "ocr_succeeded"
  | "ocr_failed"
  | "validation_passed"
  | "validation_failed"
  | "approval_granted"
  | "approval_rejected"
  | "deletion_started"
  | "deletion_succeeded"
  | "deletion_failed"
  | "revalidation_failed";

export interface AuditFields {
  readonly correlationId: string;
  readonly requestId?: string;
  /** Hash of the principal identity — never the raw claim. */
  readonly actorId?: string;
  readonly uploadId?: string;
  readonly canonicalRgId?: string;
  readonly proposedName?: string;
  readonly status?: string;
  readonly error?: string;
}

/**
 * Structured JSON audit logger. Callers pass only non-sensitive fields; raw
 * images, model responses, full principal claims, and secrets never appear.
 */
export class AuditLogger {
  private readonly logger: Logger;

  public constructor(logger: Logger) {
    this.logger = logger;
  }

  public log(event: AuditEvent, fields: AuditFields): void {
    this.logger.info({
      event,
      timestamp: new Date().toISOString(),
      ...fields,
    });
  }
}

export function createAuditLogger(logger?: Logger): AuditLogger {
  return new AuditLogger(logger ?? pino({ name: "ark3-audit" }));
}

/** Deterministic, non-reversible principal identifier for audit correlation. */
export function hashPrincipal(principalId: string): string {
  return createHash("sha256").update(principalId).digest("hex");
}
