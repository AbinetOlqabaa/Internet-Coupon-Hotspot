import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { defaultDb } from './db/repositories.js';
import { AuthService } from './auth/service.js';
import { createAuthRouter, createAuthMiddleware } from './auth/routes.js';
import { createOwnerRouter } from './owner/routes.js';
import { createCustomerRouter } from './customers/routes.js';
import { createPackageRouter } from './packages/routes.js';
import { createCouponRouter } from './coupons/routes.js';
import { createAdminRouter } from './admin/routes.js';
import { PaymentService } from './payments/service.js';
import { createPaymentRouter } from './payments/routes.js';

const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .parse({
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  });

export const app = express();
export const authService = new AuthService(defaultDb);
export const paymentService = new PaymentService(defaultDb);
export const authMiddleware = createAuthMiddleware(authService, defaultDb);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((x) => x.trim()) }));
app.use(express.json({ limit: '256kb' }));

// Health Check Endpoint
app.get('/api/v1/health', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'internet-coupon-hotspot-api',
    version: 'v1',
    mode: 'fullstack-monolith',
    capabilities: {
      persistentStorage: true,
      authentication: true,
      rbacEnabled: true,
      adminConsole: true,
      ownerDashboard: true,
      packageCatalog: true,
      couponEngine: true,
      paymentVerification: false,
      paymentAdapters: ['sandbox', 'manual_cash', 'signed_webhooks'],
      generalLedger: true,
      ledgerReconciliation: true,
      hotspotEnforcement: false,
      perClientTrafficAccounting: false,
    },
  })
);

// API Root Status
app.get('/api/v1', (_req, res) =>
  res.json({
    name: 'Internet Coupon Hotspot API',
    version: 'v1',
    status: 'active',
    modules: [
      'health',
      'auth',
      'database',
      'contracts',
      'owner',
      'customers',
      'packages',
      'coupons',
      'payments',
      'ledger',
      'admin',
    ],
  })
);

// Mount Subsystems
app.use('/api/v1/auth', createAuthRouter(authService, defaultDb));
app.use('/api/v1/owner', authMiddleware, createOwnerRouter(defaultDb));
app.use('/api/v1/customers', authMiddleware, createCustomerRouter(defaultDb));
app.use('/api/v1/packages', authMiddleware, createPackageRouter(defaultDb));
app.use('/api/v1/coupons', createCouponRouter(defaultDb, authMiddleware));
app.use('/api/v1/payments', createPaymentRouter(defaultDb, paymentService, authMiddleware));
app.use('/api/v1/admin', createAdminRouter(defaultDb, authService, authMiddleware));

// 404 Fallback
app.use((_req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested API route was not found.' } })
);

// Global Error Handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (env.NODE_ENV !== 'production') console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
});
