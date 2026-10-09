import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentAdapter, PaymentAdapterResult } from './base.js';
import type { CreatePaymentIntentInput, WebhookEventPayload } from '../types.js';

/**
 * SandboxPaymentAdapter
 * 
 * STRICT TEST-ONLY / SANDBOX ADAPTER.
 * Simulates provider-hosted tokenized payments, replay-resistant HMAC-SHA256 signed webhooks,
 * and deterministic settlement behaviors. Never claim this is real bank or card processing.
 */
export class SandboxPaymentAdapter implements PaymentAdapter {
  readonly name = 'sandbox';
  readonly isSandbox = true;

  async createIntent(input: CreatePaymentIntentInput): Promise<PaymentAdapterResult> {
    const providerRef = `sbx_pi_${randomUUID().replace(/-/g, '')}`;
    const simulation = (input.metadata?.simulateOutcome as string | undefined)?.toLowerCase();

    if (simulation === 'failure') {
      return {
        providerRef,
        status: 'failed',
        metadata: {
          sandboxNotice: 'TEST ONLY - Simulated payment failure',
          failureCode: 'insufficient_funds',
        },
      };
    }

    if (simulation === 'requires_action') {
      return {
        providerRef,
        status: 'requires_action',
        checkoutUrl: `https://sandbox.hotspot.local/checkout/${providerRef}`,
        clientSecret: `sbx_secret_${randomUUID()}`,
        metadata: {
          sandboxNotice: 'TEST ONLY - Simulated 3DS / customer challenge',
        },
      };
    }

    const immediate = Boolean(input.metadata?.simulateImmediateSuccess);
    return {
      providerRef,
      status: immediate ? 'completed' : 'pending',
      checkoutUrl: `https://sandbox.hotspot.local/checkout/${providerRef}`,
      clientSecret: `sbx_secret_${randomUUID()}`,
      metadata: {
        sandboxNotice: 'TEST ONLY - Simulated sandbox payment intent',
      },
    };
  }

  /**
   * Generates a signed webhook payload with HMAC-SHA256 signature and timestamp
   */
  static generateSignature(payload: string, timestamp: number, secret: string): string {
    const signedData = `${timestamp}.${payload}`;
    return createHmac('sha256', secret).update(signedData).digest('hex');
  }

  /**
   * Replay-protected HMAC-SHA256 signature verifier
   * Enforces a 300-second (5 minute) tolerance window to prevent replay attacks.
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string, timestampHeader?: string): boolean {
    if (!signature || !secret || !timestampHeader) {
      return false;
    }

    const timestampSec = parseInt(timestampHeader, 10);
    if (isNaN(timestampSec)) {
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const toleranceSec = 300; // 5 minutes

    // Replay attack prevention: timestamp must be fresh
    if (Math.abs(nowSec - timestampSec) > toleranceSec) {
      return false;
    }

    const expectedSignature = SandboxPaymentAdapter.generateSignature(payload, timestampSec, secret);

    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expectedSignature, 'hex');
      if (sigBuf.length !== expBuf.length) {
        return false;
      }
      return timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  parseWebhookPayload(rawPayload: string): WebhookEventPayload {
    const parsed = JSON.parse(rawPayload);
    if (!parsed.id || !parsed.type || !parsed.data) {
      throw new Error('Malformed webhook event: missing id, type, or data.');
    }
    return parsed as WebhookEventPayload;
  }
}
