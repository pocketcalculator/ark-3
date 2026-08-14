# Squad Decisions

## Active Decisions

### 2026-08-13: Limit first release to non-production Azure resources
**By:** Squad  
**What:** First version targets non-production Azure resources only. Production deletion is out of scope until the system has been validated.  
**Why:** Constrains the blast radius while OCR accuracy, authorization, confirmation, auditing, and recovery behavior are proven.

### 2026-08-13: Start with disposable non-production resource groups
**By:** Squad  
**What:** First prototype targets disposable, safe Azure resource types, beginning with a test resource group in a non-production scope.  
**Why:** A disposable test resource group provides a bounded proving ground for resolution, confirmation, audit, deletion, and recovery behavior.

### 2026-08-13: Use a supported multimodal model instead of Azure AI Vision OCR
**By:** Squad  
**What:** Use a supported multimodal AI model for image-to-text extraction instead of Azure AI Vision OCR. Verify current service and model lifecycle before selecting it.  
**Why:** Azure AI Vision OCR is approaching end of life; the design should avoid adopting a retiring dependency.

### 2026-08-13: Use an authenticated web confirmation gate
**By:** Squad  
**What:** Before deletion, require approval in a small authenticated web page that displays the captured photo and the exact resolved Azure resource ID.  
**Why:** A separate trusted interface lets the operator compare source evidence with the canonical Azure target before authorizing an irreversible action.

### 2026-08-13: Shared contract scaffold committed — packages/contracts published
**By:** Morpheus (Lead / Systems Architect)  
**What:** Created root npm workspace scaffold (`package.json`, `tsconfig.base.json`, `.editorconfig`, `.gitignore`, `.env.example`) and `packages/contracts` as a buildable TypeScript package. Contracts define all shared Zod schemas and TypeScript types for the ark-3 API: DeviceUploadResponse, OcrResult, ApprovalItem, PendingList, ApproveRequest, RejectRequest, OperationResult, ApiError envelope, UploadStatus enum with explicit transition table, ResourceGroupName grammar validation, and CanonicalRgId validation. All 27 unit tests pass.  
**Why:** Unblocks parallel implementation by backend (Neo) and web (Trinity) teams with a single source of truth for all wire types and status transitions.

### 2026-08-13: CSRF token is header-only — not in request body
**By:** Morpheus  
**What:** `ApproveRequest` and `RejectRequest` schemas do NOT include a CSRF token field. The CSRF token must be sent exclusively as the `X-CSRF-Token` HTTP request header.  
**Why:** Body-logging middleware (Azure Monitor, App Insights) could capture request bodies. Header-based CSRF tokens avoid accidental exposure in logs. This is enforced by the contract design, not by documentation alone.

### 2026-08-13: OCR uncertainty field replaces model confidence
**By:** Morpheus  
**What:** The OCR result schema uses `uncertainty` (0 = confident, 1 = uncertain) rather than `confidence`. No "trusted confidence" field exists.  
**Why:** Model-reported confidence is an uncalibrated indicator and must never gate approval decisions. The naming convention signals its limitations directly in the contract.

### 2026-08-13: Align Bicep container env vars with backend Config and fix device mypy
**By:** Morpheus (Lead / Systems Architect)  
**What:** Completed full integration pass on `squad/1-portable-ocr-azure-delete`: Bicep model defaults corrected (gpt-5.4-mini/2026-03-17), container app env vars aligned with backend Config ARK3_ prefixes (ARK3_AZURE_SUBSCRIPTION_ID, ARK3_OPENAI_ENDPOINT, ARK3_OPENAI_DEPLOYMENT_NAME, ARK3_STORAGE_ACCOUNT_NAME, ARK3_STORAGE_TABLE_NAME, ARK3_KEYVAULT_URL), UAMI client ID wired at deploy time, new required params added (corsOrigin, subscriptionDisplayLabel, rgAllowlist, openaiApiVersion), unused uploadsContainerName param removed, `.env.example` updated, device mypy cleaned (19 errors fixed).  
**Why:** Prior agent pass left env var names misaligned between Bicep and backend Config, causing Container App startup failure in production. Model defaults were incorrect. Device mypy had 19 errors blocking CI.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
