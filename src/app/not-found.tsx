'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="clay-shell flex items-center justify-center px-6">
      <div className="clay-content clay-panel max-w-md space-y-4 p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="text-sm text-slate-600">The page you are looking for does not exist.</p>
        <Link
          href="/"
          className="clay-button inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
