import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../context.js";
import { ApprovalService } from "../services/approvalService.js";
import { requireAuth, enforceCsrf, noStore } from "./guards.js";

interface IdParams {
  readonly id: string;
}

export function registerOcrRetryRoute(app: FastifyInstance, deps: AppDeps): void {
  const service = new ApprovalService(deps);

  app.post<{ Params: IdParams }>(
    "/api/ocr-retry/:id",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const auth = requireAuth(request, deps);
      enforceCsrf(request, deps);

      const result = await service.ocrRetry(request.params.id, auth.correlationId);

      noStore(reply);
      return reply.send(result);
    },
  );
}
