import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@ark-3/contracts": resolve(
        __dirname,
        "../../packages/contracts/src/index.ts",
      ),
    },
  },
});
