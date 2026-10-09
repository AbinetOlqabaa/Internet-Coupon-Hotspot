# Architecture and Stack

Kernel: React + TypeScript + Vite; Node + TypeScript + Express; REST `/api/v1`; centralized CSS tokens; optional PostgreSQL Compose service. Target production persistence: PostgreSQL plus migrations and tested backups. Use modular domains: auth, owner, customers, catalog, coupons, payments, sessions, gateway, notifications, loyalty, analytics, AI, audit, settings and health.

Evaluate PWA and Capacitor for Android packaging; verify a real APK/AAB and physical devices before claiming native delivery. Background JS timers never enforce session expiry. Keep provider-specific APIs behind adapters. Validate environment configuration at startup, narrow CORS in production, use HTTPS, structured logs/request IDs, secret redaction, rate limits and readiness/liveness endpoints.
