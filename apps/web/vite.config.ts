import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/app/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
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
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
