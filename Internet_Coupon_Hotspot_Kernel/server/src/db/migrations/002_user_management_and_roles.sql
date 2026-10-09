-- Migration 002: User Roles, Multi-User Support, Password Reset & Admin Foundation

-- Add role and display metadata to owners (users)
ALTER TABLE owners ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'OWNER';
ALTER TABLE owners ADD COLUMN IF NOT EXISTS display_name VARCHAR(120);
ALTER TABLE owners ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES owners(id) ON DELETE CASCADE;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_owners_role ON owners(role);
CREATE INDEX IF NOT EXISTS idx_owners_owner_id ON owners(owner_id);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token_hash);
