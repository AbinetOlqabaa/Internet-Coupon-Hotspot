# Authentication, RBAC, Administration & Anti-Automation Specification

Status: IMPLEMENTED & VERIFIED (via `server/src/auth/`, `server/src/admin/`, and test suites)

## 1. Authentication Architecture & Session Security
- **Algorithm**: PBKDF2 with SHA-512 and cryptographically secure per-user salt (16 bytes), 10,000 iterations, 64-byte key length.
- **Timing Safe**: Password verification uses `timingSafeEqual` over pre-computed buffers to eliminate timing attacks.
- **Session Tokens**: 32-byte cryptographically random hex strings with 24-hour expiration.
- **Session Revocation**: Active user sessions are immediately revoked upon explicit logout, password change, password reset, or account deactivation.
- **Transport Security**: Helmet security headers configured on all responses (`Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`).

## 2. Role-Based Access Control (RBAC) Matrix
The application models distinct account tiers:
1. `SUPER_ADMIN`:
   - Controls application-wide administration, system overview, and audit trails.
   - Can activate, deactivate, or delete user accounts.
   - Can create other `SUPER_ADMIN` accounts.
   - Safeguard: The system forbids deactivating, demoting, or deleting the last active `SUPER_ADMIN`.
2. `OWNER`:
   - Manages an authorized hotspot business tenant.
   - Manages their customers, access packages, and vouchers.
   - Can provision and manage `STAFF` operators within their business.
   - Cannot create or elevate users to `SUPER_ADMIN`.
3. `STAFF`:
   - Operational employee performing customer registrations, voucher validations, and viewing session status.
   - Cannot modify system settings, access packages, or administrative roles.
4. `CUSTOMER`:
   - End-user connected to the captive portal to purchase packages or redeem coupons.
   - Accesses only their personal session timers.

## 3. Initial Administrator Bootstrap
- Username / identifier: `admin@hotspot.local` (or operator custom email).
- Execution Endpoint: `POST /api/v1/admin/bootstrap`.
- Security Constraints:
  - Allowed when zero active `SUPER_ADMIN` accounts exist in the database, OR when the secret `ADMIN_BOOTSTRAP_TOKEN` matches.
  - Automatically locks permanently after the initial administrator is created.
  - Writes an `admin.bootstrapped` audit log event without logging credentials.

## 4. Password Lifecycle & Anti-Automation Protection
- **Change Password**: Requires current password verification and validates new password (minimum 8 characters). Invalidates all existing sessions upon change.
- **Forgot Password**: Returns generic non-enumerating confirmation response (`"If the provided email is registered, password reset instructions have been sent."`).
- **Reset Token**: Single-use token with 15-minute expiration. Stored as SHA-256 hash. Marked used upon successful reset.
- **Anti-Automation Rate Limiting**: In-memory rate limiting tracks failed attempts per account. Enforces a 15-minute security lockout after 5 consecutive failed login attempts.

## 5. Responsive Application Shell
- **Responsive Layout**: Designed for mobile phones (320px+), tablets, and desktop browsers.
- **Collapsible Sidebar & Navigation**:
  - Desktop: Collapsible between 250px and 68px icon view.
  - Mobile: Sliding backdrop drawer toggled via navbar hamburger.
  - Role-aware links: Administration tabs hidden from unauthorized roles.
- **Logout Confirmation Dialog**: Accessible modal requiring explicit confirmation before calling `POST /api/v1/auth/logout`.
- **Honest Disclosures**: Live service capability matrix honestly discloses the status of all subsystems (Ready vs Planned) with explicit network reality advisories.
