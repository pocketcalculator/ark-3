import { randomBytes } from "node:crypto";
import {
  TableClient,
  TableServiceClient,
  odata,
  type TableEntity,
} from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";
import type { UploadStatus } from "@ark-3/contracts";
import { ApiError } from "../errors.js";

export interface ApprovalRecord {
  readonly id: string;
  readonly imageId: string;
  readonly proposedName: string;
  readonly canonicalRgId: string;
  readonly subscriptionDisplayLabel: string;
  readonly tags: Record<string, string>;
  readonly status: UploadStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: string;
  /** One-time approval nonce; cleared to "" after use. */
  readonly nonce: string;
  /** ISO 8601 nonce expiry. */
  readonly nonceExpiresAt: string;
}

export interface ApprovalStateStore {
  create(record: ApprovalRecord): Promise<void>;
  get(id: string): Promise<ApprovalRecord | null>;
  update(
    id: string,
    patch: Partial<ApprovalRecord>,
    expectedVersion: string,
  ): Promise<ApprovalRecord>;
  listPending(): Promise<ApprovalRecord[]>;
  getDailyDeletionCount(date: string): Promise<number>;
  incrementDailyDeletionCount(date: string): Promise<void>;
}

export function newVersion(): string {
  return randomBytes(16).toString("hex");
}

function mergeRecord(
  current: ApprovalRecord,
  patch: Partial<ApprovalRecord>,
): ApprovalRecord {
  return {
    ...current,
    ...patch,
    version: newVersion(),
    updatedAt: new Date().toISOString(),
  };
}

/** In-memory store for unit and integration tests. */
export class InMemoryApprovalStateStore implements ApprovalStateStore {
  private readonly records = new Map<string, ApprovalRecord>();
  private readonly deletionCounts = new Map<string, number>();

  public create(record: ApprovalRecord): Promise<void> {
    if (this.records.has(record.id)) {
      throw new ApiError("CONFLICT", `Record ${record.id} already exists`);
    }
    this.records.set(record.id, record);
    return Promise.resolve();
  }

  public get(id: string): Promise<ApprovalRecord | null> {
    return Promise.resolve(this.records.get(id) ?? null);
  }

  public update(
    id: string,
    patch: Partial<ApprovalRecord>,
    expectedVersion: string,
  ): Promise<ApprovalRecord> {
    const current = this.records.get(id);
    if (current === undefined) {
      throw new ApiError("NOT_FOUND", `Record ${id} not found`);
    }
    if (current.version !== expectedVersion) {
      throw new ApiError(
        "VERSION_MISMATCH",
        "Record was modified concurrently; refresh and retry",
      );
    }
    const updated = mergeRecord(current, patch);
    this.records.set(id, updated);
    return Promise.resolve(updated);
  }

  public listPending(): Promise<ApprovalRecord[]> {
    const pending = [...this.records.values()].filter(
      (record) => record.status === "awaiting_approval",
    );
    return Promise.resolve(pending);
  }

  public getDailyDeletionCount(date: string): Promise<number> {
    return Promise.resolve(this.deletionCounts.get(date) ?? 0);
  }

  public incrementDailyDeletionCount(date: string): Promise<void> {
    this.deletionCounts.set(date, (this.deletionCounts.get(date) ?? 0) + 1);
    return Promise.resolve();
  }
}

interface ApprovalEntity extends TableEntity {
  imageId: string;
  proposedName: string;
  canonicalRgId: string;
  subscriptionDisplayLabel: string;
  tagsJson: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  nonce: string;
  nonceExpiresAt: string;
}

const APPROVAL_PARTITION = "approval";
const DELETION_PARTITION = "deletion-count";

/** Production store backed by Azure Table Storage. */
export class AzureTableApprovalStateStore implements ApprovalStateStore {
  private readonly client: TableClient;

  private constructor(client: TableClient) {
    this.client = client;
  }

  public static fromConnectionString(
    connectionString: string,
    tableName: string,
  ): AzureTableApprovalStateStore {
    const client = TableClient.fromConnectionString(connectionString, tableName);
    return new AzureTableApprovalStateStore(client);
  }

  public static fromAccount(
    accountName: string,
    tableName: string,
  ): AzureTableApprovalStateStore {
    const url = `https://${accountName}.table.core.windows.net`;
    const service = new TableServiceClient(url, new DefaultAzureCredential());
    void service;
    const client = new TableClient(url, tableName, new DefaultAzureCredential());
    return new AzureTableApprovalStateStore(client);
  }

  private static toEntity(record: ApprovalRecord): ApprovalEntity {
    return {
      partitionKey: APPROVAL_PARTITION,
      rowKey: record.id,
      imageId: record.imageId,
      proposedName: record.proposedName,
      canonicalRgId: record.canonicalRgId,
      subscriptionDisplayLabel: record.subscriptionDisplayLabel,
      tagsJson: JSON.stringify(record.tags),
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      version: record.version,
      nonce: record.nonce,
      nonceExpiresAt: record.nonceExpiresAt,
    };
  }

  private static fromEntity(entity: ApprovalEntity): ApprovalRecord {
    const parsedTags: unknown = JSON.parse(entity.tagsJson);
    const tags: Record<string, string> = {};
    if (parsedTags !== null && typeof parsedTags === "object") {
      for (const [key, value] of Object.entries(parsedTags)) {
        if (typeof value === "string") {
          tags[key] = value;
        }
      }
    }
    return {
      id: entity.rowKey,
      imageId: entity.imageId,
      proposedName: entity.proposedName,
      canonicalRgId: entity.canonicalRgId,
      subscriptionDisplayLabel: entity.subscriptionDisplayLabel,
      tags,
      status: entity.status as UploadStatus,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      version: entity.version,
      nonce: entity.nonce,
      nonceExpiresAt: entity.nonceExpiresAt,
    };
  }

  public async create(record: ApprovalRecord): Promise<void> {
    await this.client.createTable();
    await this.client.createEntity(AzureTableApprovalStateStore.toEntity(record));
  }

  public async get(id: string): Promise<ApprovalRecord | null> {
    try {
      const entity = await this.client.getEntity<ApprovalEntity>(
        APPROVAL_PARTITION,
        id,
      );
      return AzureTableApprovalStateStore.fromEntity(entity);
    } catch {
      return null;
    }
  }

  public async update(
    id: string,
    patch: Partial<ApprovalRecord>,
    expectedVersion: string,
  ): Promise<ApprovalRecord> {
    // Fetch entity directly to capture the service ETag for atomic conditional update.
    let rawEntity: ApprovalEntity & { etag?: string };
    try {
      rawEntity = await this.client.getEntity<ApprovalEntity>(APPROVAL_PARTITION, id);
    } catch {
      throw new ApiError("NOT_FOUND", `Record ${id} not found`);
    }

    // Application-level version guard (fast-fail before the network write).
    if (rawEntity.version !== expectedVersion) {
      throw new ApiError(
        "VERSION_MISMATCH",
        "Record was modified concurrently; refresh and retry",
      );
    }

    const current = AzureTableApprovalStateStore.fromEntity(rawEntity);
    const updated = mergeRecord(current, patch);

    // Atomic conditional replace: If-Match on the ETag we just read.
    // A concurrent write changes the ETag; the service returns 412 which we
    // translate to VERSION_MISMATCH so callers see a stable error code.
    const ifMatch = rawEntity.etag;
    if (ifMatch === undefined || ifMatch === "*") {
      // ETag missing or wildcard would bypass the guard — refuse rather than
      // silently fall back to an unconditional overwrite.
      throw new ApiError(
        "VERSION_MISMATCH",
        "Service did not return an ETag; cannot perform safe conditional update",
      );
    }

    try {
      await this.client.updateEntity(
        AzureTableApprovalStateStore.toEntity(updated),
        "Replace",
        { etag: ifMatch },
      );
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "statusCode" in err &&
        (err as { statusCode: number }).statusCode === 412
      ) {
        throw new ApiError(
          "VERSION_MISMATCH",
          "Record was modified concurrently; refresh and retry",
        );
      }
      throw err;
    }

    return updated;
  }

  public async listPending(): Promise<ApprovalRecord[]> {
    const results: ApprovalRecord[] = [];
    const iterator = this.client.listEntities<ApprovalEntity>({
      queryOptions: {
        filter: odata`PartitionKey eq ${APPROVAL_PARTITION} and status eq ${"awaiting_approval"}`,
      },
    });
    for await (const entity of iterator) {
      results.push(AzureTableApprovalStateStore.fromEntity(entity));
    }
    return results;
  }

  public async getDailyDeletionCount(date: string): Promise<number> {
    try {
      const entity = await this.client.getEntity<TableEntity & { count: number }>(
        DELETION_PARTITION,
        date,
      );
      return entity.count;
    } catch {
      return 0;
    }
  }

  public async incrementDailyDeletionCount(date: string): Promise<void> {
    await this.client.createTable();
    const current = await this.getDailyDeletionCount(date);
    await this.client.upsertEntity(
      { partitionKey: DELETION_PARTITION, rowKey: date, count: current + 1 },
      "Replace",
    );
  }
}
