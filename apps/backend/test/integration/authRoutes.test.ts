import { describe, it, expect } from "vitest";
import {
  createTestHarness,
  multipartPayload,
  jpegBuffer,
} from "../helpers/testApp.js";
import { loadConfig } from "../../src/config.js";

function clientPrincipal(roles: string[]): string {
  const json = JSON.stringify({ userId: "user-123", userRoles: roles });
  return Buffer.from(json, "utf8").toString("base64");
}

describe("device upload auth", () => {
  it("rejects a request with no Authorization header", async () => {
    const h = await createTestHarness();
    const { payload, headers } = multipartPayload(jpegBuffer(), "p.jpg", "image/jpeg");
    const res = await h.app.inject({
      method: "POST",
      url: "/api/device/upload",
      headers: { "x-device-name": "device-x", ...headers },
      payload,
    });
    expect(res.statusCode).toBe(401);
    await h.app.close();
  });

  it("rejects a wrong bearer token", async () => {
    const h = await createTestHarness();
    const { payload, headers } = multipartPayload(jpegBuffer(), "p.jpg", "image/jpeg");
    const res = await h.app.inject({
      method: "POST",
      url: "/api/device/upload",
      headers: {
        authorization: "Bearer not-the-real-token",
        "x-device-name": "device-x",
        ...headers,
      },
      payload,
    });
    expect(res.statusCode).toBe(401);
    await h.app.close();
  });
});

describe("Easy Auth on read routes (bypass disabled)", () => {
  it("rejects /api/pending with no client principal", async () => {
    const h = await createTestHarness({ authBypass: false });
    const res = await h.app.inject({ method: "GET", url: "/api/pending" });
    expect(res.statusCode).toBe(401);
    await h.app.close();
  });

  it("allows /api/pending with an approver principal", async () => {
    const h = await createTestHarness({ authBypass: false });
    const res = await h.app.inject({
      method: "GET",
      url: "/api/pending",
      headers: { "x-ms-client-principal": clientPrincipal(["approver"]) },
    });
    expect(res.statusCode).toBe(200);
    await h.app.close();
  });

  it("forbids /api/pending for a principal lacking the approver role", async () => {
    const h = await createTestHarness({ authBypass: false });
    const res = await h.app.inject({
      method: "GET",
      url: "/api/pending",
      headers: { "x-ms-client-principal": clientPrincipal(["viewer"]) },
    });
    expect(res.statusCode).toBe(403);
    await h.app.close();
  });
});

describe("production startup safety", () => {
  it("refuses to start when auth bypass is set outside development", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        ARK3_AUTH_BYPASS: "true",
        ARK3_AZURE_SUBSCRIPTION_ID: "sub",
        ARK3_AZURE_SUBSCRIPTION_DISPLAY_LABEL: "Prod",
        ARK3_RG_ALLOWLIST: "rg-x",
        ARK3_OPENAI_ENDPOINT: "https://x.openai.azure.com/",
        ARK3_OPENAI_DEPLOYMENT_NAME: "gpt",
        ARK3_STORAGE_ACCOUNT_NAME: "acct",
        ARK3_KEYVAULT_URL: "https://x.vault.azure.net/",
        ARK3_CORS_ORIGIN: "https://app.example",
      }),
    ).toThrowError(/ARK3_AUTH_BYPASS/);
  });

  it("refuses bypass when a managed identity endpoint is present", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "development",
        ARK3_AUTH_BYPASS: "true",
        IDENTITY_ENDPOINT: "http://169.254.169.254/",
      }),
    ).toThrowError(/managed identity/);
  });

  it("fails fast on missing production configuration", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production" }),
    ).toThrowError(/Missing required production configuration/);
  });
});
