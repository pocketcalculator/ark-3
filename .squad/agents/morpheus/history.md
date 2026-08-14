# Project Context

- **Project:** ark-3
- **Created:** 2026-08-13
- **Requested by:** Paul Sczurek
- **Goal:** Portable camera captures text; AI/OCR extracts an Azure resource name; a guarded action can delete the matching resource.
- **Stack:** Prefer Node.js/TypeScript. Python is acceptable when materially better. No .NET or PowerShell.

## Learnings

Initial team setup complete.


📌 Team update (2026-08-13T16:33:16): Final release cycle: Morpheus completed first independent auth revision and integration pass. Fixed egg-info and .gitignore issues; auth scaffold defect remained (TokenProvider pattern not implemented, Bearer header static). Second-cycle rejection by Switch enforced; locked out due to auth scope mismatch requiring Neo's runtime pattern expertise. Concurrently completed full integration pass: Bicep model defaults corrected (gpt-5.4-mini/2026-03-17), container app env vars aligned with backend Config (ARK3_ prefixes), UAMI client ID wired, new required params added, device mypy cleaned (19 errors fixed). Shared contract scaffold merged: packages/contracts published with 27 passing unit tests, CSRF header-only policy enforced, OCR uncertainty field naming standardized. — orchestrated by Scribe
