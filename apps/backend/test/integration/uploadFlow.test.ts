import { describe, it, expect } from "vitest";
import {
  createTestHarness,
  multipartPayload,
  multipartPayloadWithField,
  jpegBuffer,
  waitForStatus,
  TEST_RG_NAME,
} from "../helpers/testApp.js";

function uploadHeaders(
  token: string,
  deviceName: string,
  multipartHeaders: Record<string, string>,
): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "x-device-name": deviceName,
    ...multipartHeaders,
  };
}

describe("device upload → OCR → pending", () => {
  it("accepts an upload and advances to awaiting_approval", async () => {
    const h = await createTestHarness();
    const { payload, headers } = multipartPayload(jpegBuffer(), "photo.jpg", "image/jpeg");

    const res = await h.app.inject({
      method: "POST",
      url: "/api/device/upload",
      headers: uploadHeaders(h.deviceToken, "device-1", headers),
      payload,
    });

    expect(res.statusCode).toBe(202);
    const body = res.json() as { uploadId: string; status: string };
    expect(body.status).toBe("ocr_pending");
    expect(body.uploadId).toMatch(/[0-9a-f-]{36}/);

    await waitForStatus(h.store, body.uploadId, "awaiting_approval");

    const pending = await h.app.inject({
      method: "GET",
      url: "/api/pending",
    });
    expect(pending.statusCode).toBe(200);
    const list = pending.json() as {
      items: Array<{ id: string; proposedName: string; imageRoute: string }>;
      total: number;
    };
    expect(list.total).toBe(1);
    expect(list.items[0]?.proposedName).toBe(TEST_RG_NAME);
    expect(list.items[0]?.imageRoute).toBe(`/api/images/${body.uploadId}`);

    await h.app.close();
  });

  it("marks the record failed when OCR yields no name", async () => {
    const h = await createTestHarness();
    h.vision.setResult({ resourceGroupName: null, uncertainty: 1, rawText: "" });
    const { payload, headers } = multipartPayload(jpegBuffer(), "photo.jpg", "image/jpeg");

    const res = await h.app.inject({
      method: "POST",
      url: "/api/device/upload",
      headers: uploadHeaders(h.deviceToken, "device-2", headers),
      payload,
    });
    const body = res.json() as { uploadId: string };

    await waitForStatus(h.store, body.uploadId, "failed");
    const record = await h.store.get(body.uploadId);
    expect(record?.status).toBe("failed");

    const pending = await h.app.inject({ method: "GET", url: "/api/pending" });
    expect((pending.json() as { total: number }).total).toBe(0);

    await h.app.close();
  });

  it("serves the stored image with a no-store cache policy", async () => {
    const h = await createTestHarness();
    const { payload, headers } = multipartPayload(jpegBuffer(), "photo.jpg", "image/jpeg");
    const res = await h.app.inject({
      method: "POST",
      url: "/api/device/upload",
      headers: uploadHeaders(h.deviceToken, "device-3", headers),
      payload,
    });
    const body = res.json() as { uploadId: string };

    const image = await h.app.inject({
      method: "GET",
      url: `/api/images/${body.uploadId}`,
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/jpeg");
    expect(String(image.headers["cache-control"])).toContain("no-store");

    await h.app.close();
  });

  it("rejects upload when the multipart field is not named 'image'", async () => {
    const h = await createTestHarness();
    const { payload, headers } = multipartPayloadWithField(
      "photo",
      jpegBuffer(),
      "photo.jpg",
      "image/jpeg",
    );

    const res = await h.app.inject({
      method: "POST",
      url: "/api/device/upload",
      headers: uploadHeaders(h.deviceToken, "device-4", headers),
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe(
      "VALIDATION_FAILED",
    );

    await h.app.close();
  });
});
