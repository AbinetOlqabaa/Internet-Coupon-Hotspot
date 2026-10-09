# Testing and Release Gates

Unit test price math, state transitions, voucher rules, bonus rules, quota routing and permissions. Integration test owner isolation, webhooks, idempotency, session activation/expiry, gateway failure/retry and audit. E2E: purchase → verified payment → gateway authorization → active session → expiry/revoke → ledger/audit reconciliation. Add adapter contract tests, security/dependency checks, responsive UI tests, load tests, backup/restore and migration tests.

Edge cases: duplicate/out-of-order webhook, payment succeeded/activation failed, gateway offline, MAC change, background timer, time-extension race, refund after use, package price edit mid-session, clock drift, DB failure, provider 429, budget exhausted, local model unavailable, notification failure and offline recovery.

Real payment, physical gateway and Android-device tests must be marked PASS or NOT TESTED. A build passing does not establish production readiness.
