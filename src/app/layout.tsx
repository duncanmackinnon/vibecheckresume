import './globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { env } from '@/utils/env';

// Validate environment variables on app start
env.validate();

export const metadata = {
  title: 'Resume Analyzer',
  description: 'Match your resume against job descriptions',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
