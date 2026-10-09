# Changelog and Evidence

## Phase 6 — Packages, Pricing Snapshots, Coupons & Abuse Controls (Completed)
- Built access package management in `server/src/packages/routes.ts`:
  - `POST /api/v1/packages` and `GET /api/v1/packages`.
  - Immutable historical price snapshot safety: updating package prices does not retroactively alter purchased sessions.
- Built voucher & coupon management in `server/src/coupons/routes.ts`:
  - `POST /api/v1/coupons` with uppercase normalization, usage limits, and expiration bounds.
  - `POST /api/v1/coupons/validate`: public redemption verification endpoint checking active status, expiry, and usage limits before returning package snapshot.
- Added comprehensive unit and integration tests:
  - `server/src/packages/packages.test.ts` (3 tests)
  - `server/src/coupons/coupons.test.ts` (3 tests)
- Evidence: 33/33 tests passing across 9 test suites; package and coupon operations verified.

## Phase 5 — Customers, Consent, Device/Session History, Search & Pagination (Completed)
- Built customer management in `server/src/customers/routes.ts`:
  - `POST /api/v1/customers` with terms consent and data retention tracking.
  - `GET /api/v1/customers` with multi-field search (phone, name, MAC) and pagination (`limit`, `offset`, `totalCount`, `hasMore`).
  - `GET /api/v1/customers/:id` returning customer details and complete historical session list.
  - `PUT /api/v1/customers/:id` for profile and consent updates.
  - `DELETE /api/v1/customers/:id` for privacy-compliant deletion.
- Added unit and integration tests in `server/src/customers/customers.test.ts` (4 tests).
- Evidence: Customer CRUD, search, pagination, and cross-owner isolation pass tests.

## Phase 4 — Owner Profile, Settings, Capability Status & Dashboard Shell (Completed)
- Created owner routes in `server/src/owner/routes.ts`:
  - `GET /api/v1/owner/profile` (profile retrieval)
  - `PUT /api/v1/owner/profile` (profile update)
  - `GET /api/v1/owner/dashboard` (metrics: packages, active sessions, total revenue, customer count, and honest gateway mode disclosure)
- Mounted `/api/v1/owner` protected by `authMiddleware` in `server/src/app.ts`.
- Added unit and integration tests in `server/src/owner/owner.test.ts` (2 tests).
- Enhanced responsive client in `client/src/App.tsx` with dynamic capability badges and operator console.
- Evidence: 23/23 tests pass across 6 test files; TypeScript typechecks clean; live API endpoints verified.

## Phase 3 — Authentication, Tenant Isolation, Permissions & Audit (Completed)
- Implemented `AuthService` in `server/src/auth/service.ts`:
  - PBKDF2/SHA-512 password hashing with cryptographically random per-user salt and timing-safe comparison.
  - Bearer session token issuance, validation, and revocation on logout.
- Created auth routes in `server/src/auth/routes.ts` (`/register`, `/login`, `/me`, `/logout`) and `createAuthMiddleware`.
- Verified multi-tenant owner isolation and automated audit logging.
- Added comprehensive test suite in `server/src/auth/auth.test.ts` (5 tests).
- Evidence: Registration, login, profile, logout, and cross-owner isolation tests pass.

## Phase 2 — Relational Schema, Repositories, Constraints & Backup Plan (Completed)
- Authored initial PostgreSQL 16 schema in `server/src/db/migrations/001_initial_schema.sql` with multi-tenant foreign keys, check constraints, unique indexes, and audit tables.
- Created Zod entity schemas in `server/src/db/schema.ts`.
- Built `MemoryDatabase` repository registry in `server/src/db/repositories.ts` enforcing unique constraints, transaction boundaries, and foreign key integrity.
- Documented schema architecture and backup/PITR recovery plan in `.ai/02_DATABASE_AND_BACKUP_SPEC.md`.
- Added unit test suite in `server/src/db/db.test.ts` (6 tests).
- Evidence: Unique coupon constraints, payment idempotency, session state transitions, and audit logs pass unit tests.

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
