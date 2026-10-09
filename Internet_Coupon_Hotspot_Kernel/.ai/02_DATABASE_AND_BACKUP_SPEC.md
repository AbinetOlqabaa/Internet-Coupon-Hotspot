# Phase 2: Database Schema, ORM/Migrations, Constraints & Disaster Recovery

Status: IMPLEMENTED & UNIT-TESTED (via `server/src/db/` schema, repositories, and `db.test.ts`)

## 1. Relational Entities & Constraints
- **Multi-Tenant Isolation**: Every business entity (`customers`, `access_packages`, `coupons`, `gateways`, `access_sessions`, `payment_intents`, `ledger_entries`, `audit_events`) contains a non-nullable `owner_id UUID` foreign key referencing `owners(id) ON DELETE CASCADE`.
- **Unique Constraints**:
  - `coupons`: `UNIQUE (owner_id, code)` prevents duplicate coupon codes within the same owner tenant while allowing different owners to use identical codes (e.g., `WELCOME10`).
  - `payment_intents`: `UNIQUE (owner_id, idempotency_key)` protects against duplicate charge submissions across retries.
  - `owners`: `UNIQUE (email)` ensures account uniqueness.
- **Foreign Key Policies**:
  - `coupons.package_id`: `ON DELETE RESTRICT` ensures an active package linked to coupons cannot be accidentally deleted.
  - `access_sessions.package_id`: `ON DELETE RESTRICT` preserves historical integrity.
  - `access_sessions.customer_id`: `ON DELETE SET NULL` allows customer deletion for privacy/GDPR requests without corrupting operational session logs.

## 2. Integer Minor Units & Accounting
- `price_minor` and `amount_minor` use `INTEGER` / `BIGINT` with strict non-negative check constraints (`CHECK (price_minor >= 0)`).
- Floating-point representations are prohibited across all persistence interfaces.
- The `ledger_entries` table acts as an append-only double-entry ledger tracking all sales, refunds, and adjustments.

## 3. Storage Architecture: PostgreSQL & Repository Pattern
- **Production Target**: PostgreSQL 16+ running on managed Cloud SQL or Docker container (see `docker-compose.yml`).
- **Migration Engine**: DDL scripts tracked in `server/src/db/migrations/` (starting with `001_initial_schema.sql`).
- **Repository Interface**: `RepositoryRegistry` in `server/src/db/repositories.ts` defines clean typed contracts for all CRUD and transaction boundaries (`runTransaction`), with an in-memory implementation for hermetic testing and serverless sandbox environments.

## 4. Backup & Disaster Recovery Strategy
- **Automated Daily Backups**: Run automated daily logical snapshots via `pg_dump`:
  ```bash
  pg_dump -Fc -h $PGHOST -U $PGUSER -d $PGDATABASE -f /backups/hotspot_$(date +%Y%m%d_%H%M%S).dump
  ```
- **Point-in-Time Recovery (PITR)**: Enable write-ahead logging (WAL) archiving to an isolated storage bucket with 30-day retention.
- **Verification Runbook**:
  1. Restore latest `.dump` file to a staging test database weekly:
     ```bash
     pg_restore -C -d postgres /backups/hotspot_test.dump
     ```
  2. Execute integrity query:
     ```sql
     SELECT COUNT(*) FROM owners;
     SELECT COUNT(*) FROM access_sessions;
     ```
  3. Validate ledger reconciliation against payment provider records.
