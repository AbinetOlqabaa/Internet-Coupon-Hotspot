# Phase 1: Product Contracts, Currency, Gateway Reality & Privacy

Status: IMPLEMENTED & UNIT-TESTED (via `server/src/contracts/index.ts` and `contracts.test.ts`)

## 1. Currency & Financial Representation
- **Minor Units Only**: Financial amounts are stored strictly as non-negative integer minor units (e.g., cents, satoshis). No floating-point values are ever stored or transmitted for money.
- **Explicit Currency Codes**: All money structures require an ISO 4217 currency code (e.g. `USD`, `EUR`, `ETB`, `KES`).
- **Cross-Currency Safety**: Arithmetic operations between mismatched currencies throw explicit errors and are rejected at the contract boundary.
- **Rounding Rule**: Financial calculations use round-to-nearest-minor-unit or integer truncations documented per payment adapter.

## 2. Gateway Capability & Network Reality
- **Mode A: Limited Owner-Management Mode (Native Android)**
  - `canAuthorizeAccess`: `false`
  - `canDisconnectClient`: `false`
  - `canLimitBandwidth`: `false`
  - `canMeasureTraffic`: `false`
  - `requiresHardwareGateway`: `false`
  - *Disclosure*: Standard Android system hotspots do not permit third-party applications to disconnect individual Wi-Fi clients, enforce speed tiers, or measure individual IP/MAC traffic. The UI honestly labels these capabilities as unmanaged/estimated.
- **Mode B: Managed Gateway Mode (Hardware Gateway / Router)**
  - Compatible with MikroTik RouterOS, OpenWrt, CoovaChilli, or custom RADIUS/REST gateways.
  - Authoritative enforcement: Real disconnections, dynamic bandwidth queues, and hardware-reported byte counters.

## 3. Server-Authoritative Session State Machine
- States:
  - `created`: Session intent initialized.
  - `awaiting_payment`: Awaiting payment confirmation or coupon redemption.
  - `payment_verified`: Funds verified server-side; ready for gateway dispatch.
  - `activation_pending`: Gateway command issued, awaiting acknowledgement.
  - `active`: Verified online by server/gateway timestamps. Duration starts now.
  - `expired`: Time or quota reached.
  - `activation_failed`: Gateway was unreachable or rejected lease.
  - `paused`: Temporary administrative pause.
  - `revoked`: Explicit administrative termination.
  - `cancelled`: User or timeout prior to payment.
  - `refund_pending` / `refunded` / `disputed`: Financial resolution states.
- Authoritative Timing: Duration clock begins upon confirmed activation, using UTC timestamps. No client-side timer can decide or alter session expiry.

## 4. Privacy, PII, and Telemetry Constraints
- **Minimal Identifiers**: Devices identified by MAC or dynamic token only as needed for captive portal authorization.
- **No Traffic Inspection**: No URLs, DNS queries, packet contents, or browsing history are ever collected, inspected, or stored.
- **Secret Redaction**: Automated sanitization removes API keys, credentials, tokens, and authorization headers before logging or AI context inclusion.
- **Consent Records**: Explicit customer consent records for terms of service and retention.
