# Changelog and Evidence

## Phase 1 — Product Contracts, Currency Math, Gateway Matrix & Privacy (Completed)
- Authored formal domain contracts in `server/src/contracts/index.ts`:
  - `MoneySchema`, `formatMoney`, and `addMoney` strictly enforcing non-negative integer minor units and single-currency arithmetic.
  - `AccessPackageSchema` with integer second durations and structured pricing.
  - `SessionStateSchema` and `VALID_SESSION_TRANSITIONS` encoding server-authoritative state transitions.
  - `getGatewayCapabilities` explicitly providing honest capabilities and disclosures for Limited Owner Mode and Managed Gateway Mode.
  - `redactSensitiveData` utility protecting tokens, secrets, credentials, and API keys.
- Added comprehensive contract unit test suite in `server/src/contracts/contracts.test.ts` (7 tests).
- Documented full architectural contracts in `.ai/01_PRODUCT_CONTRACTS_SPEC.md`.
- Evidence:
  - Vitest test suite grew from 3 to 10 tests, all passing with zero errors.
  - TypeScript compilation clean across workspace.

## Phase 0 — Kernel Baseline Audit and Repair (Completed)
- Executed `npm test` across server and client suites.
- Identified and fixed missing `@types/supertest` causing TypeScript build failures in server test suite.
- Identified and fixed brittle relative path resolution `src/theme.css` in `client/src/theme.test.ts` using `import.meta.url`.
- Updated `server/tsconfig.json` to exclude `src/**/*.test.ts` from compilation output.
- Configured unified full-stack server runtime in `server.ts` to bridge Express API (`/api/v1/*`) and Vite client on port 3000.
- Added root `package.json` test runner orchestrating both vitest suites.
- Verified all baseline tests pass (3/3 unit tests passing, 0 typecheck errors, production builds clean).
- Evidence:
  - `server/src/app.test.ts`: 2 passed (honest capability flags, structured 404)
  - `client/src/theme.test.ts`: 1 passed (centralized tokens validated)
  - `GET /api/v1/health`: HTTP 200 with `persistentStorage: false`, `paymentVerification: false`, `hotspotEnforcement: false`
  - `GET /api/v1`: HTTP 200 with status "kernel"
  - `GET /`: Serves rendered client HTML with active status badge

## Initial kernel scaffold
- Added React/TypeScript/Vite client and centralized responsive design tokens.
- Added Express/TypeScript API with versioned root and health endpoints.
- Added basic API tests and optional PostgreSQL Compose service.
- Added product, architecture, security, payment, gateway, AI, UX, testing and phase instructions.
- Explicitly disclosed that persistence, authentication, payments, gateway enforcement, per-client accounting, Android packaging and AI integration are not implemented.

Verification at file-generation time: build/tests NOT RUN; Android NOT TESTED; payment provider NOT TESTED; physical gateway NOT TESTED. Append dated evidence after each phase.
