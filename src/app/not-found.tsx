'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="text-sm text-slate-600">The page you’re looking for doesn’t exist.</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
