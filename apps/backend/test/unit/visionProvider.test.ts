import { describe, it, expect } from "vitest";
import { parseVisionJson, MockVisionProvider } from "../../src/providers/vision.js";

describe("parseVisionJson", () => {
  it("parses a valid OCR JSON payload", () => {
    const text = JSON.stringify({
      resourceGroupName: "rg-test-disposable",
      rawText: "rg-test-disposable",
      uncertainty: 0.2,
    });
    const result = parseVisionJson(text);
    expect(result.resourceGroupName).toBe("rg-test-disposable");
    expect(result.uncertainty).toBe(0.2);
    expect(result.rawText).toBe("rg-test-disposable");
  });

  it("accepts a null resource group name", () => {
    const text = JSON.stringify({
      resourceGroupName: null,
      rawText: "illegible",
      uncertainty: 0.9,
    });
    const result = parseVisionJson(text);
    expect(result.resourceGroupName).toBeNull();
    expect(result.uncertainty).toBe(0.9);
  });

  it("fails closed on malformed JSON", () => {
    const result = parseVisionJson("not json {");
    expect(result).toEqual({ resourceGroupName: null, uncertainty: 1, rawText: "" });
  });

  it("fails closed when the schema does not match", () => {
    const text = JSON.stringify({ resourceGroupName: "ok", uncertainty: 5 });
    const result = parseVisionJson(text);
    expect(result).toEqual({ resourceGroupName: null, uncertainty: 1, rawText: "" });
  });

  it("fails closed on an invalid resource group name grammar", () => {
    const text = JSON.stringify({
      resourceGroupName: "bad name!",
      rawText: "bad name!",
      uncertainty: 0.1,
    });
    const result = parseVisionJson(text);
    expect(result.resourceGroupName).toBeNull();
  });
});

describe("MockVisionProvider", () => {
  it("returns the configured result", async () => {
    const provider = new MockVisionProvider({
      resourceGroupName: "rg-x",
      uncertainty: 0.3,
      rawText: "rg-x",
    });
    await expect(provider.extractResourceGroupName(Buffer.from([]))).resolves.toEqual({
      resourceGroupName: "rg-x",
      uncertainty: 0.3,
      rawText: "rg-x",
    });
  });

  it("can be reconfigured", async () => {
    const provider = new MockVisionProvider({
      resourceGroupName: null,
      uncertainty: 1,
      rawText: "",
    });
    provider.setResult({ resourceGroupName: "rg-y", uncertainty: 0, rawText: "rg-y" });
    const result = await provider.extractResourceGroupName(Buffer.from([]));
    expect(result.resourceGroupName).toBe("rg-y");
  });
});
