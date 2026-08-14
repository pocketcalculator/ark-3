import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/errors.ts",
        "src/routes/**/*.ts",
        "src/services/**/*.ts",
        "src/validation/**/*.ts",
      ],
      thresholds: {
        statements: 80,
        lines: 80,
      },
    },
  },
});
