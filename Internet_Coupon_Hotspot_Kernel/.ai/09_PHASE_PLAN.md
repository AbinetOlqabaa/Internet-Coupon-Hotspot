# Autonomous Phase Plan

0. Audit kernel, run build/typecheck/tests, fix baseline.
1. Document product contracts, currency, gateway capability and privacy assumptions.
2. Add PostgreSQL, ORM/migrations, repositories, constraints, transactions and backup notes.
3. Implement authentication, owner isolation, secure sessions, permissions and audit.
4. Owner profile/settings, responsive shell, capability status and dashboard.
5. Customers, consent, device/session history, search and pagination.
6. Minute/hour/custom packages, pricing snapshots, coupons/vouchers/QR and abuse controls.
7. Payment adapters, sandbox, signed webhooks, manual payments, ledger, idempotency, reconciliation and refund states.
8. Server-authoritative session state machine, expiry, extensions, pause/revoke and reconciliation.
9. Gateway adapter interface, capability discovery, health, commands, event ingestion; test adapter clearly TEST ONLY.
10. Integrate one real documented gateway; verify authorization, expiry, traffic accounting and speed limits on hardware; otherwise mark hardware acceptance NOT TESTED.
11. Customer portal, payment/activation status, remaining time, session history and help.
12. In-app/local/portal notifications where technically supported; delivery states and retry.
13. Revenue/usage/retention/package/gateway analytics, exports, data freshness and source labels.
14. Explainable segments, badges, bounded bonuses and audit.
15. AI provider registry, encrypted key management, quota evidence, free-first routing, opt-in paid fallback and budgets.
16. Owner copilot, forecasts, anomalies, service summaries and support drafts with privacy/evaluation tests.
17. PWA/Capacitor decision, Android packaging, permissions, secure storage, install/build and physical device validation.
18. Security, performance, accessibility, backup/restore, monitoring and responsive hardening.
19. Full E2E acceptance, deployment/runbook, compatibility matrix and final handoff.

After every phase test, fix, regress, and update status/changelog. Keep the repository runnable. Document external blockers precisely.
