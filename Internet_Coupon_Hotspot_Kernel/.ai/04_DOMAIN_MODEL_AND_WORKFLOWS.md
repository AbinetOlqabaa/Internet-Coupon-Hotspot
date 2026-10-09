# Domain Model and Workflows

Entities: Owner/BusinessProfile, Customer/Consent/Device, AccessPackage, Coupon/Voucher, PaymentIntent/Transaction/LedgerEntry, AccessSession, UsageSample, Gateway/Client/Command/Event, Notification/DeliveryAttempt, LoyaltyProfile/Badge/Bonus, AIProvider/Model/Usage, AuditEvent and OwnerSetting.

Session state machine: created → awaiting_payment → payment_verified → activation_pending → active → expired; also activation_failed, paused, revoked, cancelled, refund_pending, refunded and disputed. Every transition must be authorized, transactional, idempotent and audited. If payment succeeds but gateway activation fails, show paid-but-not-active and apply a clear retry/refund policy. Session duration starts at confirmed activation unless offer terms explicitly differ. Use UTC timestamps, integer duration seconds, integer currency minor units and currency code. Package price edits do not silently alter existing purchases.

Customer segmentation should be explainable using recency/frequency/spend/retention/support signals. Avoid sensitive traits. Badges need explicit criteria and evidence. Bonuses need owner-defined budgets, expiry, abuse limits and audit; AI may recommend but cannot grant money/access by itself.
