import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { app as apiApp } from './Internet_Coupon_Hotspot_Kernel/server/src/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // Legacy kernel health endpoint compatibility
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'internet-coupon-hotspot-kernel',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      kernelState: 'technical_landing_ready',
      targetPlatform: 'Android-first Full-Stack'
    });
  });

  // Delegate API requests to the authoritative imported Express application
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return (apiApp as any)(req, res, next);
    }
    next();
  });

  const clientDir = path.resolve(__dirname, 'Internet_Coupon_Hotspot_Kernel/client');

  if (!isProduction) {
    // Development mode: Vite middleware handles client routing and assets
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: clientDir,
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: serve built client assets from client/dist or dist
    const distPath = path.resolve(clientDir, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Kernel] Unified server listening on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

bootstrap().catch((err) => {
  console.error('[Kernel] Failed to start server:', err);
  process.exit(1);
});
