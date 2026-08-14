import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../context.js";
import { requireAuth, noStore } from "./guards.js";

interface ImageParams {
  readonly id: string;
}

export function registerImagesRoute(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Params: ImageParams }>(
    "/api/images/:id",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      requireAuth(request, deps);
      const { id } = request.params;
      const blob = await deps.blob.download(id);
      noStore(reply);
      reply.header("Content-Type", blob.contentType);
      return reply.send(blob.data);
    },
  );
}
