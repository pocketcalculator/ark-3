import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/main.ts", "src/lib/announce.ts"],
      thresholds: {
        statements: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@ark-3/contracts": resolve(
        import.meta.dirname,
        "../../packages/contracts/src/index.ts",
      ),
    },
  },
});
