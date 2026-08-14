import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/app/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
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
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
