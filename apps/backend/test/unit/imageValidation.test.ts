import { describe, it, expect } from "vitest";
import { validateImage, MAX_IMAGE_BYTES } from "../../src/validation/image.js";
import { ApiError } from "../../src/errors.js";

function jpeg(size = 32): Buffer {
  const buf = Buffer.alloc(size, 0x00);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function png(size = 32): Buffer {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const buf = Buffer.alloc(size, 0x00);
  magic.forEach((b, i) => {
    buf[i] = b;
  });
  return buf;
}

describe("validateImage", () => {
  it("accepts a valid JPEG", () => {
    expect(validateImage(jpeg(), "image/jpeg")).toEqual({ contentType: "image/jpeg" });
  });

  it("accepts a valid PNG", () => {
    expect(validateImage(png(), "image/png")).toEqual({ contentType: "image/png" });
  });

  it("rejects an oversized image", () => {
    const big = jpeg(MAX_IMAGE_BYTES + 1);
    expect(() => validateImage(big, "image/jpeg")).toThrowError(/5MB/);
  });

  it("rejects an empty payload", () => {
    expect(() => validateImage(Buffer.alloc(0), "image/jpeg")).toThrow(ApiError);
  });

  it("rejects bytes that are neither JPEG nor PNG", () => {
    const bogus = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(() => validateImage(bogus, "image/jpeg")).toThrowError(/valid JPEG or PNG/);
  });

  it("rejects a content-type that disagrees with JPEG magic bytes", () => {
    expect(() => validateImage(jpeg(), "image/png")).toThrowError(/does not match JPEG/);
  });

  it("rejects a content-type that disagrees with PNG magic bytes", () => {
    expect(() => validateImage(png(), "image/jpeg")).toThrowError(/does not match PNG/);
  });
});
