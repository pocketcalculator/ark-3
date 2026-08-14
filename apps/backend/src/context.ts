import type { Config } from "./config.js";
import type { SecretProvider } from "./providers/secret.js";
import type { BlobStorageProvider } from "./providers/blob.js";
import type { ApprovalStateStore } from "./providers/approvalState.js";
import type { VisionProvider } from "./providers/vision.js";
import type { ArmProvider } from "./providers/arm.js";
import type { AuditLogger } from "./services/audit.js";
import type { DeviceAuthService } from "./services/deviceAuth.js";

/** Fully-wired dependency bundle passed to the app factory and every route. */
export interface AppDeps {
  readonly config: Config;
  readonly secrets: SecretProvider;
  readonly blob: BlobStorageProvider;
  readonly store: ApprovalStateStore;
  readonly vision: VisionProvider;
  readonly arm: ArmProvider;
  readonly audit: AuditLogger;
  readonly deviceAuth: DeviceAuthService;
  /** Injectable clock for deterministic tests. */
  readonly now: () => Date;
}
