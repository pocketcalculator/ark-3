/**
 * Unit tests for AzureTableApprovalStateStore.update() conditional write
 * behaviour using a mocked TableClient.
 *
 * Assertions:
 *  - The ETag returned by getEntity is forwarded as ifMatch to updateEntity.
 *  - A 412 response from the service translates to VERSION_MISMATCH.
 *  - A stale application-level version check throws VERSION_MISMATCH before any
 *    write attempt.
 *  - Only one of two concurrent approvals can advance (first wins).
 */
import { describe, it, expect, vi, type Mock } from "vitest";
import { randomBytes } from "node:crypto";
import { ApiError } from "../../src/errors.js";
import type { ApprovalStateStore } from "../../src/providers/approvalState.js";

// ---------------------------------------------------------------------------
// Minimal TableClient mock factory
// ---------------------------------------------------------------------------

interface FakeEntity {
  partitionKey: string;
  rowKey: string;
  etag: string;
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

function makeEntity(overrides: Partial<FakeEntity> = {}): FakeEntity {
  return {
    partitionKey: "approval",
    rowKey: "id-1",
    etag: '"etag-v1"',
    imageId: "img-1",
    proposedName: "rg-test",
    canonicalRgId: "/subscriptions/x/resourceGroups/rg-test",
    subscriptionDisplayLabel: "Test",
    tagsJson: "{}",
    status: "awaiting_approval",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: "v1",
    nonce: randomBytes(32).toString("hex"),
    nonceExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

function makeClient(entity: FakeEntity) {
  const getEntity: Mock = vi.fn().mockResolvedValue(entity);
  const updateEntity: Mock = vi.fn().mockResolvedValue({});
  const createTable: Mock = vi.fn().mockResolvedValue({});
  return { getEntity, updateEntity, createTable };
}

// ---------------------------------------------------------------------------
// Import the store class by injecting a fake client via the private constructor.
// We cast to `any` to bypass TypeScript's private-constructor guard in tests.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConstructor = new (...args: any[]) => any;

async function buildStore(client: object) {
  const mod = await import("../../src/providers/approvalState.js");
  const store = new (mod.AzureTableApprovalStateStore as unknown as AnyConstructor)(client);
  return store as ApprovalStateStore;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AzureTableApprovalStateStore.update() – conditional ETag write", () => {
  it("passes the service ETag as ifMatch to updateEntity", async () => {
    const entity = makeEntity({ version: "v1", etag: '"etag-v1"' });
    const client = makeClient(entity);
    const store = await buildStore(client);

    await store.update("id-1", { status: "deleting" as const }, "v1");

    expect(client.updateEntity).toHaveBeenCalledOnce();
    const [, , options] = client.updateEntity.mock.calls[0] as [
      unknown,
      unknown,
      { etag: string },
    ];
    expect(options.etag).toBe('"etag-v1"');
    // Must NOT be the wildcard – that would bypass atomicity.
    expect(options.etag).not.toBe("*");
  });

  it("translates a 412 response from the service to VERSION_MISMATCH", async () => {
    const entity = makeEntity({ version: "v1", etag: '"etag-v1"' });
    const client = makeClient(entity);
    // Simulate a concurrent write: service returns 412.
    const preconditionFailed = Object.assign(new Error("412 precondition failed"), {
      statusCode: 412,
    });
    client.updateEntity.mockRejectedValueOnce(preconditionFailed);

    const store = await buildStore(client);

    await expect(store.update("id-1", { status: "deleting" as const }, "v1")).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ApiError &&
        e.code === "VERSION_MISMATCH",
    );
  });

  it("throws VERSION_MISMATCH on stale app version without calling updateEntity", async () => {
    const entity = makeEntity({ version: "v2", etag: '"etag-v2"' });
    const client = makeClient(entity);
    const store = await buildStore(client);

    await expect(
      store.update("id-1", { status: "deleting" as const }, "v1-stale"),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.code === "VERSION_MISMATCH",
    );
    // No write should have been attempted.
    expect(client.updateEntity).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when getEntity fails (entity absent)", async () => {
    const client = {
      getEntity: vi.fn().mockRejectedValue(new Error("entity not found")),
      updateEntity: vi.fn(),
      createTable: vi.fn(),
    };
    const store = await buildStore(client);

    await expect(store.update("missing-id", {}, "v1")).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.code === "NOT_FOUND",
    );
    expect(client.updateEntity).not.toHaveBeenCalled();
  });

  it("refuses to update when the service returns a wildcard ETag", async () => {
    const entity = makeEntity({ version: "v1", etag: "*" });
    const client = makeClient(entity);
    const store = await buildStore(client);

    await expect(store.update("id-1", { status: "deleting" as const }, "v1")).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && e.code === "VERSION_MISMATCH",
    );
    expect(client.updateEntity).not.toHaveBeenCalled();
  });

  it("only the first of two concurrent approvals advances (second loses ETag race)", async () => {
    const entity = makeEntity({ version: "v1", etag: '"etag-v1"' });
    const client = makeClient(entity);

    // First call succeeds; second call simulates a changed ETag → 412.
    client.updateEntity
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("412"), { statusCode: 412 }));

    const storeA = await buildStore(client);
    const storeB = await buildStore(client);

    const first = storeA.update("id-1", { status: "deleting" as const }, "v1");
    const second = storeB.update("id-1", { status: "deleting" as const }, "v1");

    const [resultA, resultB] = await Promise.allSettled([first, second]);

    expect(resultA.status).toBe("fulfilled");
    expect(resultB.status).toBe("rejected");
    if (resultB.status === "rejected") {
      expect(resultB.reason).toBeInstanceOf(ApiError);
      expect((resultB.reason as ApiError).code).toBe("VERSION_MISMATCH");
    }
    // updateEntity was called exactly twice (once per store).
    expect(client.updateEntity).toHaveBeenCalledTimes(2);
  });
});
