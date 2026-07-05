'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="clay-shell flex items-center justify-center px-6">
          <div className="clay-content clay-panel max-w-md space-y-4 p-8 text-center">
            <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
            <p className="text-sm text-slate-600">{error?.message || 'An unexpected error occurred.'}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => reset()}
                className="clay-button px-4 py-2 text-sm font-semibold text-white"
              >
                Try again
              </button>
              <Link
                href="/"
                className="clay-secondary-button px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Go home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
