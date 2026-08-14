import { describe, it, expect } from "vitest";
import { validateResourceGroup } from "../../src/validation/resourceGroup.js";
import { FakeArmProvider, type ResolvedResourceGroup } from "../../src/providers/arm.js";
import { ApiError } from "../../src/errors.js";

const DISPOSABLE: Record<string, string> = { "ark3-disposable": "true" };
const RG_ID = "/subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/rg-test-disposable";

function group(name: string, tags: Record<string, string>): ResolvedResourceGroup {
  return { name, id: `/subscriptions/x/resourceGroups/${name}`, tags };
}

describe("validateResourceGroup", () => {
  const allowlist = ["rg-test-disposable"];

  it("returns the canonical resolution when all gates pass", async () => {
    const arm = new FakeArmProvider([
      { name: "rg-test-disposable", id: RG_ID, tags: DISPOSABLE },
    ]);
    const result = await validateResourceGroup({
      name: "RG-TEST-DISPOSABLE",
      allowlist,
      arm,
    });
    expect(result.name).toBe("rg-test-disposable");
    expect(result.id).toBe(RG_ID);
  });

  it("rejects names failing the naming grammar", async () => {
    const arm = new FakeArmProvider([]);
    await expect(
      validateResourceGroup({ name: "bad name!", allowlist, arm }),
    ).rejects.toMatchObject({ code: "RG_NAME_INVALID" });
  });

  it("throws RG_NOT_FOUND when zero ARM matches", async () => {
    const arm = new FakeArmProvider([]);
    await expect(
      validateResourceGroup({ name: "rg-test-disposable", allowlist, arm }),
    ).rejects.toMatchObject({ code: "RG_NOT_FOUND" });
  });

  it("throws RG_AMBIGUOUS when multiple ARM matches", async () => {
    const arm = new FakeArmProvider([
      group("rg-test-disposable", DISPOSABLE),
      group("rg-test-disposable", DISPOSABLE),
    ]);
    await expect(
      validateResourceGroup({ name: "rg-test-disposable", allowlist, arm }),
    ).rejects.toMatchObject({ code: "RG_AMBIGUOUS" });
  });

  it("throws RG_NOT_ALLOWLISTED when not on the allowlist", async () => {
    const arm = new FakeArmProvider([group("rg-other", DISPOSABLE)]);
    await expect(
      validateResourceGroup({ name: "rg-other", allowlist, arm }),
    ).rejects.toMatchObject({ code: "RG_NOT_ALLOWLISTED" });
  });

  it("throws RG_NOT_DISPOSABLE when the disposable tag is missing", async () => {
    const arm = new FakeArmProvider([group("rg-test-disposable", {})]);
    await expect(
      validateResourceGroup({ name: "rg-test-disposable", allowlist, arm }),
    ).rejects.toMatchObject({ code: "RG_NOT_DISPOSABLE" });
  });

  it("re-reads live ARM state on each call (TOCTOU-safe)", async () => {
    const armEmpty = new FakeArmProvider([]);
    await expect(
      validateResourceGroup({ name: "rg-test-disposable", allowlist, arm: armEmpty }),
    ).rejects.toBeInstanceOf(ApiError);

    const armPresent = new FakeArmProvider([
      { name: "rg-test-disposable", id: RG_ID, tags: DISPOSABLE },
    ]);
    const result = await validateResourceGroup({
      name: "rg-test-disposable",
      allowlist,
      arm: armPresent,
    });
    expect(result.id).toBe(RG_ID);
  });
});
