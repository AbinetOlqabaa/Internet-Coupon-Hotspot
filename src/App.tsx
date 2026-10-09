import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cpu,
  Smartphone,
  Layers,
  FileCode,
  ShieldCheck,
} from 'lucide-react';

interface BackendHealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  kernelState: string;
  awaitingInstructionPack: boolean;
  targetPlatform: string;
}

export default function App() {
  const [healthData, setHealthData] = useState<BackendHealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();

    try {
      const response = await fetch('/api/health', {
        headers: { Accept: 'application/json' },
      });

      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);

      if (!response.ok) {
        throw new Error(`Backend responded with status code ${response.status}`);
      }

      const data = (await response.json()) as BackendHealthResponse;
      setHealthData(data);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown network error');
      setHealthData(null);
      setLatencyMs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-10 px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight">
                Internet Coupon Hotspot
              </h1>
              <p className="text-xs text-slate-400">
                Technical Project Kernel • Android-First Full-Stack
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Awaiting .ai Instruction Pack
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Kernel Status Overview */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                Kernel Health Verification
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Verifies client-to-backend communication over the local Express API boundary.
              </p>
            </div>

            <button
              onClick={checkHealth}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-800 border border-slate-700 text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-auto"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Re-test Health Endpoint
            </button>
          </div>

          {/* Status Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-4">
            {/* Frontend Runtime */}
            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Frontend Runtime</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-100">React 19 + Vite SPA</p>
              <p className="text-[11px] text-emerald-400/90 mt-0.5">Active & Rendered</p>
            </div>

            {/* Backend Runtime */}
            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Backend Health API</span>
                {loading ? (
                  <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" />
                ) : error ? (
                  <AlertCircle className="h-4 w-4 text-rose-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-100">
                {loading ? 'Checking...' : error ? 'Connection Error' : 'Express /api/health'}
              </p>
              <p className="text-[11px] mt-0.5">
                {error ? (
                  <span className="text-rose-400">{error}</span>
                ) : healthData ? (
                  <span className="text-emerald-400">
                    Online {latencyMs !== null ? `(${latencyMs}ms)` : ''}
                  </span>
                ) : (
                  <span className="text-slate-500">Awaiting probe</span>
                )}
              </p>
            </div>

            {/* Architecture State */}
            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Android Preparedness</span>
                <Smartphone className="h-4 w-4 text-cyan-400" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-100">Mobile Responsive</p>
              <p className="text-[11px] text-cyan-400/90 mt-0.5">Capacitor/Packaging Compatible</p>
            </div>
          </div>

          {/* Raw Endpoint Inspector */}
          <div className="mt-4 pt-4 border-t border-slate-800/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-cyan-400" />
                GET /api/health Response
              </span>
              {lastChecked && (
                <span className="text-[11px] text-slate-500 font-mono">
                  Checked: {lastChecked.toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="rounded-lg bg-black/60 border border-slate-800 p-3 font-mono text-xs overflow-x-auto text-cyan-300">
              {loading && !healthData ? (
                <span className="text-slate-500">Querying endpoint...</span>
              ) : error ? (
                <span className="text-rose-400">{JSON.stringify({ error, status: 'failed' }, null, 2)}</span>
              ) : healthData ? (
                <pre>{JSON.stringify(healthData, null, 2)}</pre>
              ) : (
                <span className="text-slate-500">No data received.</span>
              )}
            </div>
          </div>
        </section>

        {/* Technical Boundary & Scope Confirmation */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              Kernel Boundaries
            </h3>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>Single clean backend entry point (<code className="text-slate-300">server.ts</code>) using Express.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>Vite middleware integration in development, static bundle serving in production.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>Responsive mobile-first layout without desktop-only assumptions.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>Zero speculative dependencies or bloat before requirements ingestion.</span>
              </li>
            </ul>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              Scope Discipline Status
            </h3>
            <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
              <p>
                Business features are strictly suppressed at this stage. No mock coupons, no customer records, no hotspot manipulation, and no payment mocks have been instantiated.
              </p>
              <p className="text-slate-300 font-medium pt-1">
                Awaiting upload of the authoritative <code className="text-amber-300">.ai</code> instruction pack to initiate application phases.
              </p>
            </div>
          </div>
        </section>

        {/* Directory Structure & Next Step */}
        <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileCode className="h-4 w-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Kernel File Footprint
            </h3>
          </div>
          <div className="font-mono text-[11px] text-slate-400 bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <div>├── /server.ts (Express + Vite runtime)</div>
            <div>├── /src/App.tsx (Technical status page)</div>
            <div>├── /src/main.tsx (Client entry)</div>
            <div>├── /src/index.css (Tailwind CSS)</div>
            <div>├── /index.html (HTML entry point)</div>
            <div>├── /metadata.json (Project metadata)</div>
            <div>├── /package.json (Scripts: dev, build, start)</div>
            <div>├── /README.md (Kernel verification instructions)</div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-4 py-3 text-center text-xs text-slate-500">
        Internet Coupon Hotspot Kernel • Standby for .ai Instruction Pack Import
      </footer>
    </div>
  );
}
