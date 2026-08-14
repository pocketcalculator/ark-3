/**
 * Vitest global test setup.
 * Provides DOM globals via jsdom and installs fetch mock stubs.
 */

// Stub URL.createObjectURL / revokeObjectURL (not present in jsdom)
if (typeof URL.createObjectURL === "undefined") {
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: () => `blob:mock-${++counter}`,
  });
}

if (typeof URL.revokeObjectURL === "undefined") {
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    value: () => undefined,
  });
}
