import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import pino from "pino";
import { loadConfig, redactConfigForLog, type Config } from "./config.js";
import type { AppDeps } from "./context.js";
import { ApiError, isApiError } from "./errors.js";
import { MAX_IMAGE_BYTES } from "./validation/image.js";
import {
  buildCsrfCookie,
  generateCsrfToken,
} from "./services/csrf.js";
import { createAuditLogger } from "./services/audit.js";
import {
  DeviceAuthService,
  RateLimiter,
} from "./services/deviceAuth.js";
import { resolvePrincipal } from "./services/easyAuth.js";
import {
  AzureKeyVaultSecretProvider,
  EnvSecretProvider,
  type SecretProvider,
} from "./providers/secret.js";
import {
  AzureBlobStorageProvider,
  InMemoryBlobStorageProvider,
  type BlobStorageProvider,
} from "./providers/blob.js";
import {
  AzureTableApprovalStateStore,
  InMemoryApprovalStateStore,
  type ApprovalStateStore,
} from "./providers/approvalState.js";
import {
  AzureOpenAIVisionProvider,
  MockVisionProvider,
  type VisionProvider,
} from "./providers/vision.js";
import { AzureArmProvider, FakeArmProvider, type ArmProvider } from "./providers/arm.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerDeviceUploadRoute } from "./routes/deviceUpload.js";
import { registerPendingRoute } from "./routes/pending.js";
import { registerImagesRoute } from "./routes/images.js";
import { registerApproveRoute } from "./routes/approve.js";
import { registerRejectRoute } from "./routes/reject.js";
import { registerOcrRetryRoute } from "./routes/ocrRetry.js";

const WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

function shouldIssueCsrf(method: string, url: string): boolean {
  if (method !== "GET") {
    return false;
  }
  if (url === "/api/health" || url.startsWith("/api/health?")) {
    return false;
  }
  return url.startsWith("/api/") || url === "/app" || url.startsWith("/app/");
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: MAX_IMAGE_BYTES + 1024 * 1024,
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  });

  // Correlation id + CSRF cookie issuance.
  app.addHook("onRequest", (request, reply, done) => {
    reply.header("X-Request-Id", request.id);
    if (shouldIssueCsrf(request.method, request.url)) {
      const secure = deps.config.nodeEnv === "production";
      reply.header("Set-Cookie", buildCsrfCookie(generateCsrfToken(), { secure }));
    }
    done();
  });

  registerHealthRoute(app, deps);
  registerDeviceUploadRoute(app, deps);
  registerPendingRoute(app, deps);
  registerImagesRoute(app, deps);
  registerApproveRoute(app, deps);
  registerRejectRoute(app, deps);
  registerOcrRetryRoute(app, deps);

  // Register the error handler before any plugins that might override it
  // (notably @fastify/static in Fastify v5). All API routes registered above
  // will use this handler.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;
    if (isApiError(error)) {
      return reply.code(error.statusCode).send(error.toEnvelope(requestId));
    }
    if (error.validation !== undefined) {
      const apiError = new ApiError("VALIDATION_FAILED", "Request validation failed");
      return reply.code(apiError.statusCode).send(apiError.toEnvelope(requestId));
    }
    const statusCode = error.statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      const apiError = new ApiError("VALIDATION_FAILED", error.message, {
        statusCode,
      });
      return reply.code(statusCode).send(apiError.toEnvelope(requestId));
    }
    const apiError = new ApiError("UNKNOWN", "Internal server error");
    return reply.code(500).send(apiError.toEnvelope(requestId));
  });

  // Static SPA assets, Easy Auth protected.
  if (existsSync(WEB_DIST)) {
    app.addHook("onRequest", (request, _reply, done) => {
      if (request.url === "/app" || request.url.startsWith("/app/")) {
        resolvePrincipal(request, deps.config);
      }
      done();
    });
    await app.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: "/app/",
      decorateReply: false,
    });
    app.get("/app", async (_request, reply) => reply.redirect("/app/"));
  }

  return app;
}

function buildSecretProvider(config: Config): SecretProvider {
  if (config.nodeEnv === "production") {
    return new AzureKeyVaultSecretProvider(config.keyvaultUrl);
  }
  return new EnvSecretProvider();
}

function buildBlobProvider(config: Config): BlobStorageProvider {
  if (config.blobStorageProvider === "memory") {
    return new InMemoryBlobStorageProvider();
  }
  if (config.blobStorageProvider === "azurite") {
    if (config.azuriteConnectionString === undefined) {
      throw new Error("AZURITE_CONNECTION_STRING is required for the azurite blob provider");
    }
    return AzureBlobStorageProvider.fromConnectionString(config.azuriteConnectionString);
  }
  return AzureBlobStorageProvider.fromAccount(config.storageAccountName);
}

function buildStateStore(config: Config): ApprovalStateStore {
  if (config.nodeEnv !== "production" && config.azuriteConnectionString !== undefined) {
    return AzureTableApprovalStateStore.fromConnectionString(
      config.azuriteConnectionString,
      config.storageTableName,
    );
  }
  if (config.nodeEnv !== "production") {
    return new InMemoryApprovalStateStore();
  }
  return AzureTableApprovalStateStore.fromAccount(
    config.storageAccountName,
    config.storageTableName,
  );
}

function buildVisionProvider(config: Config): VisionProvider {
  if (config.nodeEnv === "production") {
    return new AzureOpenAIVisionProvider(config);
  }
  return new MockVisionProvider({
    resourceGroupName: null,
    uncertainty: 1,
    rawText: "",
  });
}

function buildArmProvider(config: Config): ArmProvider {
  if (config.nodeEnv === "production") {
    return new AzureArmProvider(config.azureSubscriptionId);
  }
  // Local/dev: never performs live deletion.
  return new FakeArmProvider([]);
}

export function buildDeps(config: Config): AppDeps {
  const secrets = buildSecretProvider(config);
  return {
    config,
    secrets,
    blob: buildBlobProvider(config),
    store: buildStateStore(config),
    vision: buildVisionProvider(config),
    arm: buildArmProvider(config),
    audit: createAuditLogger(),
    deviceAuth: new DeviceAuthService(
      secrets,
      config.deviceTokenSecretName,
      new RateLimiter(config.deviceRateLimitRpm),
    ),
    now: () => new Date(),
  };
}

async function start(): Promise<void> {
  const log = pino({ name: "ark3-backend" });
  const config = loadConfig();
  log.info({ config: redactConfigForLog(config) }, "ark-3 backend starting");

  const deps = buildDeps(config);
  const app = await buildApp(deps);

  await app.listen({ port: config.port, host: "0.0.0.0" });
  log.info({ port: config.port }, "ark-3 backend listening");
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;

if (isMain) {
  start().catch((error: unknown) => {
    const log = pino({ name: "ark3-backend" });
    log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "fatal startup error",
    );
    process.exitCode = 1;
  });
}
