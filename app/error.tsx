'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary. Keeps a render failure inside one tab instead of
 * blanking the whole application to Next.js's default error screen.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Replace with a real reporting sink in production.
    console.error('Unhandled UI error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f19] px-4">
      <div className="max-w-md w-full rounded-2xl border border-rose-600/50 bg-rose-950/30 p-8 text-center">
        <AlertOctagon className="w-10 h-10 mx-auto text-rose-400" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-bold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-rose-200/80">
          This panel failed to render. The rest of the simulator is unaffected.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-rose-300/60">ref: {error.digest}</p>
        ) : null}

        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Reload
          </Link>
        </div>
      </div>
    </div>
  );
}