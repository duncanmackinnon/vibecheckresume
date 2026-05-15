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
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
            <p className="text-sm text-slate-600">{error?.message || 'An unexpected error occurred.'}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => reset()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                Try again
              </button>
              <Link
                href="/"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 shadow-sm"
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
