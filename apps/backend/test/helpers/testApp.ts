import { randomBytes, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/index.js";
import type { Config } from "../../src/config.js";
import type { AppDeps } from "../../src/context.js";
import type { SecretProvider } from "../../src/providers/secret.js";
import { InMemoryBlobStorageProvider } from "../../src/providers/blob.js";
import {
  InMemoryApprovalStateStore,
  type ApprovalStateStore,
} from "../../src/providers/approvalState.js";
import { MockVisionProvider } from "../../src/providers/vision.js";
import type { ArmProvider, ResolvedResourceGroup } from "../../src/providers/arm.js";
import { ApiError } from "../../src/errors.js";
import { createAuditLogger } from "../../src/services/audit.js";
import { DeviceAuthService, RateLimiter } from "../../src/services/deviceAuth.js";

export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_SUBSCRIPTION_ID = "11111111-2222-3333-4444-555555555555";
export const TEST_RG_NAME = "rg-test-disposable";
export const TEST_RG_ID = `/subscriptions/${TEST_SUBSCRIPTION_ID}/resourceGroups/${TEST_RG_NAME}`;

class MapSecretProvider implements SecretProvider {
  private readonly secrets: Map<string, string>;

  public constructor(secrets: Record<string, string>) {
    this.secrets = new Map(Object.entries(secrets));
  }

  public getSecret(name: string): Promise<string> {
    const value = this.secrets.get(name);
    if (value === undefined) {
      return Promise.reject(new Error(`secret ${name} not set`));
    }
    return Promise.resolve(value);
  }
}

export function jpegBuffer(sizeBytes = 64): Buffer {
  const buf = Buffer.alloc(Math.max(sizeBytes, 3), 0x20);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

export function pngBuffer(sizeBytes = 64): Buffer {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const buf = Buffer.alloc(Math.max(sizeBytes, magic.length), 0x20);
  magic.forEach((byte, index) => {
    buf[index] = byte;
  });
  return buf;
}

/**
 * Test ARM provider that resolves lookups from an in-memory set and records
 * (successful) deletions. Unlike the production FakeArmProvider it is allowed to
 * "delete" so approval happy-paths can be exercised.
 */
export class RecordingArmProvider implements ArmProvider {
  public readonly deleted: string[] = [];
  private groups: ResolvedResourceGroup[];
  private failDelete = false;

  public constructor(groups: readonly ResolvedResourceGroup[]) {
    this.groups = [...groups];
  }

  public setGroups(groups: readonly ResolvedResourceGroup[]): void {
    this.groups = [...groups];
  }

  public setFailDelete(value: boolean): void {
    this.failDelete = value;
  }

  public lookupResourceGroup(
    nameInsensitive: string,
  ): Promise<ResolvedResourceGroup | null> {
    const target = nameInsensitive.toLowerCase();
    const matches = this.groups.filter((g) => g.name.toLowerCase() === target);
    if (matches.length === 0) {
      return Promise.resolve(null);
    }
    if (matches.length > 1) {
      throw new ApiError("RG_AMBIGUOUS", "ambiguous");
    }
    return Promise.resolve(matches[0] ?? null);
  }

  public deleteResourceGroup(canonicalId: string): Promise<void> {
    if (this.failDelete) {
      return Promise.reject(new Error("simulated deletion failure"));
    }
    this.deleted.push(canonicalId);
    return Promise.resolve();
  }
}

export interface TestOverrides {
  readonly dailyDeletionCap?: number;
  readonly deviceRateLimitRpm?: number;
  readonly armGroups?: readonly ResolvedResourceGroup[];
  readonly now?: () => Date;
  readonly authBypass?: boolean;
}

export interface TestHarness {
  readonly app: FastifyInstance;
  readonly deps: AppDeps;
  readonly config: Config;
  readonly store: InMemoryApprovalStateStore;
  readonly blob: InMemoryBlobStorageProvider;
  readonly vision: MockVisionProvider;
  readonly arm: RecordingArmProvider;
  readonly deviceToken: string;
  readonly deviceTokenHash: string;
}

export function makeConfig(overrides: TestOverrides = {}): Config {
  return {
    nodeEnv: "development",
    port: 0,
    azureSubscriptionId: TEST_SUBSCRIPTION_ID,
    azureSubscriptionDisplayLabel: "Test Sub",
    rgAllowlist: [TEST_RG_NAME],
    openaiEndpoint: "http://localhost:8080",
    openaiDeploymentName: "mock-vision",
    openaiApiVersion: "2026-03-17",
    storageAccountName: "devaccount1",
    storageTableName: "approvals",
    keyvaultUrl: "https://example.vault.azure.net/",
    deviceTokenSecretName: "ark3-device-token-hash",
    authBypass: overrides.authBypass ?? true,
    dailyDeletionCap: overrides.dailyDeletionCap ?? 10,
    deviceRateLimitRpm: overrides.deviceRateLimitRpm ?? 10,
    corsOrigin: TEST_ORIGIN,
    approverRole: "approver",
    blobStorageProvider: "memory",
    azuriteConnectionString: undefined,
  };
}

export function defaultArmGroups(): ResolvedResourceGroup[] {
  return [
    {
      name: TEST_RG_NAME,
      id: TEST_RG_ID,
      tags: { "ark3-disposable": "true" },
    },
  ];
}

export async function createTestHarness(
  overrides: TestOverrides = {},
): Promise<TestHarness> {
  const config = makeConfig(overrides);
  const deviceToken = "test-device-token-value";
  const deviceTokenHash = createHash("sha256").update(deviceToken).digest("hex");

  const secrets = new MapSecretProvider({
    [config.deviceTokenSecretName]: deviceTokenHash,
  });
  const store: ApprovalStateStore = new InMemoryApprovalStateStore();
  const blob = new InMemoryBlobStorageProvider();
  const vision = new MockVisionProvider({
    resourceGroupName: TEST_RG_NAME,
    uncertainty: 0.1,
    rawText: TEST_RG_NAME,
  });
  const arm = new RecordingArmProvider(overrides.armGroups ?? defaultArmGroups());

  const deps: AppDeps = {
    config,
    secrets,
    blob,
    store: store as InMemoryApprovalStateStore,
    vision,
    arm,
    audit: createAuditLogger(),
    deviceAuth: new DeviceAuthService(
      secrets,
      config.deviceTokenSecretName,
      new RateLimiter(config.deviceRateLimitRpm),
    ),
    now: overrides.now ?? (() => new Date()),
  };

  const app = await buildApp(deps);
  await app.ready();

  return {
    app,
    deps,
    config,
    store: store as InMemoryApprovalStateStore,
    blob,
    vision,
    arm,
    deviceToken,
    deviceTokenHash,
  };
}

export function multipartPayload(
  buffer: Buffer,
  filename: string,
  contentType: string,
): { payload: Buffer; headers: Record<string, string> } {
  return multipartPayloadWithField("image", buffer, filename, contentType);
}

/** Build a multipart body using an arbitrary field name (for negative tests). */
export function multipartPayloadWithField(
  fieldName: string,
  buffer: Buffer,
  filename: string,
  contentType: string,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----ark3test${randomBytes(8).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, buffer, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/** Polls the store until the record reaches the desired status (or times out). */
export async function waitForStatus(
  store: ApprovalStateStore,
  id: string,
  status: string,
  timeoutMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const record = await store.get(id);
    if (record !== null && record.status === status) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for ${id} to reach ${status} (last: ${record?.status ?? "none"})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export const CSRF_TOKEN = "test-csrf-token-value";

/** Seeds an awaiting_approval record with a known nonce and version. */
export async function seedApproval(
  store: InMemoryApprovalStateStore,
  overrides: {
    id: string;
    proposedName?: string;
    canonicalRgId?: string;
    nonce?: string;
    version?: string;
    nonceExpiresAt?: string;
  },
): Promise<{ id: string; nonce: string; version: string }> {
  const now = new Date();
  // Nonces must be exactly 64 lowercase hex digits (matches ApprovalNonceSchema).
  const nonce = overrides.nonce ?? randomBytes(32).toString("hex");
  const version = overrides.version ?? "seed-version";
  await store.create({
    id: overrides.id,
    imageId: overrides.id,
    proposedName: overrides.proposedName ?? TEST_RG_NAME,
    canonicalRgId: overrides.canonicalRgId ?? TEST_RG_ID,
    subscriptionDisplayLabel: "Test Sub",
    tags: { "ark3-disposable": "true" },
    status: "awaiting_approval",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version,
    nonce,
    nonceExpiresAt:
      overrides.nonceExpiresAt ?? new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
  });
  return { id: overrides.id, nonce, version };
}

/** Standard headers to satisfy CSRF double-submit + same-origin in tests. */
export function csrfHeaders(): Record<string, string> {
  return {
    cookie: `csrf-token=${CSRF_TOKEN}`,
    "x-csrf-token": CSRF_TOKEN,
    origin: TEST_ORIGIN,
    "content-type": "application/json",
  };
}
