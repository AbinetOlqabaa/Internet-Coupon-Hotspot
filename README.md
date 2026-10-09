# Internet Coupon Hotspot Kernel

Minimal production-oriented full-stack technical landing kernel for the proposed Android-first Internet Coupon Hotspot application.

This kernel serves as a stable technical baseline into which the authoritative `.ai` instruction pack will be imported to drive subsequent development phases.

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Backend**: Node.js, Express
- **Integration**: Single unified server (`server.ts`) mounting Vite middleware in development and serving static assets in production
- **Target Platform**: Android-first responsive web client, suitable for future packaging (e.g. via Capacitor)

## Project Structure

```
├── /server.ts           # Unified Express server & Vite middleware
├── /src
│   ├── App.tsx          # Minimal technical health and kernel status page
│   ├── main.tsx         # React client entry point
│   └── index.css        # Tailwind CSS entry
├── /index.html          # HTML template
├── /metadata.json       # AI Studio app metadata
├── /package.json        # Dependencies and execution scripts
├── /tsconfig.json       # TypeScript compiler configuration
├── /vite.config.ts      # Vite build configuration
└── /README.md           # Technical instructions
```

## Available Scripts

- **`npm run dev`**: Starts the full-stack server using `tsx server.ts` on port 3000 with Vite dev middleware enabled.
- **`npm run build`**: Builds the production client bundle into the `dist/` directory via `vite build`.
- **`npm start`**: Runs the production server (`node server.ts`), serving `dist/` on port 3000.
- **`npm run lint`**: Runs TypeScript type checking (`tsc --noEmit`).

## Health & Verification Endpoints

- `GET /api/health`
  Returns kernel status, uptime, environment, and readiness indicators.
