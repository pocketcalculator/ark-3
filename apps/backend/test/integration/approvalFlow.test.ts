import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createTestHarness,
  seedApproval,
  csrfHeaders,
  TEST_RG_ID,
  TEST_RG_NAME,
} from "../helpers/testApp.js";
import type { ResolvedResourceGroup } from "../../src/providers/arm.js";

function disposable(name: string, id: string): ResolvedResourceGroup {
  return { name, id, tags: { "ark3-disposable": "true" } };
}

describe("approval flow", () => {
  it("approves: all gates pass and deletion is executed", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; canonicalRgId?: string };
    expect(body.success).toBe(true);
    expect(body.canonicalRgId).toBe(TEST_RG_ID);
    expect(h.arm.deleted).toContain(TEST_RG_ID);
    expect((await h.store.get(id))?.status).toBe("deleted");

    await h.app.close();
  });

  it("rejects: transitions to rejected without deletion", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/reject/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version, reason: "no" }),
    });

    expect(res.statusCode).toBe(200);
    expect(h.arm.deleted).toHaveLength(0);
    expect((await h.store.get(id))?.status).toBe("rejected");

    await h.app.close();
  });

  it("replaying a consumed nonce returns 409", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const first = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(first.statusCode).toBe(200);

    const replay = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(replay.statusCode).toBe(409);

    await h.app.close();
  });

  it("version mismatch returns 409", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: "wrong-version" }),
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe("VERSION_MISMATCH");

    await h.app.close();
  });

  it("non-allowlisted resource group returns 422", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const name = "rg-not-allowed";
    const rgId = `/subscriptions/x/resourceGroups/${name}`;
    h.arm.setGroups([disposable(name, rgId)]);
    const seed = await seedApproval(h.store, { id, proposedName: name, canonicalRgId: rgId });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(res.statusCode).toBe(422);

    await h.app.close();
  });

  it("missing disposable tag returns 422", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    h.arm.setGroups([{ name: TEST_RG_NAME, id: TEST_RG_ID, tags: {} }]);
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(res.statusCode).toBe(422);

    await h.app.close();
  });

  it("zero ARM matches returns 422", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    h.arm.setGroups([]);
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(res.statusCode).toBe(422);

    await h.app.close();
  });

  it("multiple ARM matches returns 422", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    h.arm.setGroups([
      disposable(TEST_RG_NAME, TEST_RG_ID),
      disposable(TEST_RG_NAME, `${TEST_RG_ID}-dup`),
    ]);
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(res.statusCode).toBe(422);

    await h.app.close();
  });

  it("exceeding the daily deletion cap returns 429", async () => {
    const h = await createTestHarness({ dailyDeletionCap: 1 });
    const date = new Date().toISOString().slice(0, 10);
    await h.store.incrementDailyDeletionCount(date);

    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(res.statusCode).toBe(429);

    await h.app.close();
  });

  it("rejects a mutating request with a missing CSRF token", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe("CSRF_INVALID");

    await h.app.close();
  });

  it("pending list exposes nonce for authenticated users", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({ method: "GET", url: "/api/pending" });
    expect(res.statusCode).toBe(200);
    const list = res.json() as { items: Array<{ nonce: string; version: string }> };
    const item = list.items.find((i) => i.nonce === seed.nonce);
    expect(item).toBeDefined();
    expect(item?.nonce).toMatch(/^[0-9a-f]{64}$/);

    await h.app.close();
  });

  it("nonce differs from version in the pending response", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const res = await h.app.inject({ method: "GET", url: "/api/pending" });
    const list = res.json() as { items: Array<{ nonce: string; version: string }> };
    const item = list.items.find((i) => i.nonce === seed.nonce);
    expect(item).toBeDefined();
    expect(item?.nonce).not.toBe(item?.version);

    await h.app.close();
  });

  it("expired nonce returns 409", async () => {
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, {
      id,
      nonceExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${id}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seed.nonce, version: seed.version }),
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe("NONCE_EXPIRED");

    await h.app.close();
  });

  it("concurrent approvals: only one succeeds and deletion fires exactly once", async () => {
    // Both requests share the same version. The first winner transitions to
    // deleting and updates the version; the second finds a mismatch → 409.
    const h = await createTestHarness();
    const id = randomUUID();
    const seed = await seedApproval(h.store, { id });

    const payload = JSON.stringify({ nonce: seed.nonce, version: seed.version });
    const [r1, r2] = await Promise.all([
      h.app.inject({
        method: "POST",
        url: `/api/approve/${id}`,
        headers: csrfHeaders(),
        payload,
      }),
      h.app.inject({
        method: "POST",
        url: `/api/approve/${id}`,
        headers: csrfHeaders(),
        payload,
      }),
    ]);

    const statuses = [r1.statusCode, r2.statusCode].sort();
    // Exactly one 200 and one 409.
    expect(statuses).toEqual([200, 409]);
    // Deletion fired exactly once.
    expect(h.arm.deleted).toHaveLength(1);
    expect(h.arm.deleted[0]).toBe(TEST_RG_ID);

    await h.app.close();
  });

  it("nonce for wrong item is rejected", async () => {
    const h = await createTestHarness();
    const idA = randomUUID();
    const idB = randomUUID();
    const seedA = await seedApproval(h.store, { id: idA });
    const seedB = await seedApproval(h.store, { id: idB });

    // Use A's nonce to approve B — must fail.
    const res = await h.app.inject({
      method: "POST",
      url: `/api/approve/${idB}`,
      headers: csrfHeaders(),
      payload: JSON.stringify({ nonce: seedA.nonce, version: seedB.version }),
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe("NONCE_INVALID");

    await h.app.close();
  });
});
