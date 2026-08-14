import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../context.js";

export const APP_VERSION = process.env["npm_package_version"] ?? "0.0.0";

export function registerHealthRoute(app: FastifyInstance, _deps: AppDeps): void {
  app.get("/api/health", async (_request, reply) => {
    return reply.send({ status: "ok", version: APP_VERSION });
  });
}
