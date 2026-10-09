-- Migration 001: Initial Database Schema for Internet Coupon Hotspot
-- PostgreSQL 16 compatible schema with strict constraints, integer money, and audit logs.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Owners / Business Profiles
CREATE TABLE IF NOT EXISTS owners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    business_name VARCHAR(120) NOT NULL,
    default_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owners_email ON owners(email);

-- 2. Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    phone VARCHAR(32),
    display_name VARCHAR(100),
    device_mac VARCHAR(17),
    consent_accepted_at TIMESTAMPTZ,
    data_retention_consent BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_customers_mac ON customers(device_mac);

-- 3. Access Packages
CREATE TABLE IF NOT EXISTS access_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
    price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
    currency VARCHAR(3) NOT NULL,
    data_quota_bytes BIGINT CHECK (data_quota_bytes IS NULL OR data_quota_bytes > 0),
    speed_limit_down_kbps INTEGER CHECK (speed_limit_down_kbps IS NULL OR speed_limit_down_kbps > 0),
    speed_limit_up_kbps INTEGER CHECK (speed_limit_up_kbps IS NULL OR speed_limit_up_kbps > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packages_owner ON access_packages(owner_id);

-- 4. Coupons / Vouchers
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    package_id UUID NOT NULL REFERENCES access_packages(id) ON DELETE RESTRICT,
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_coupons_owner_code UNIQUE (owner_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_owner_code ON coupons(owner_id, code);

-- 5. Gateways / Router configurations
CREATE TABLE IF NOT EXISTS gateways (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    mode VARCHAR(32) NOT NULL DEFAULT 'limited_owner_mode',
    host VARCHAR(255),
    port INTEGER,
    api_key_encrypted TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'offline',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Access Sessions
CREATE TABLE IF NOT EXISTS access_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    package_id UUID NOT NULL REFERENCES access_packages(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'created',
    duration_seconds INTEGER NOT NULL,
    remaining_seconds INTEGER NOT NULL,
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    device_mac VARCHAR(17),
    client_ip VARCHAR(45),
    gateway_id UUID REFERENCES gateways(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_owner ON access_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON access_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_mac ON access_sessions(device_mac);

-- 7. Payment Intents & Transactions
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES access_sessions(id) ON DELETE CASCADE,
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    currency VARCHAR(3) NOT NULL,
    provider VARCHAR(32) NOT NULL DEFAULT 'sandbox',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    provider_ref VARCHAR(255),
    idempotency_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_idempotency UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payments_session ON payment_intents(session_id);

-- 8. General Ledger Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    entry_type VARCHAR(32) NOT NULL, -- 'sale', 'refund', 'adjustment'
    amount_minor INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_owner ON ledger_entries(owner_id);

-- 9. Tamper-evident Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    actor VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_owner ON audit_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
