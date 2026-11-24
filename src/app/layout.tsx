import './globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const metadata = {
  title: 'VibeCheck — Your next chapter',
  description: 'A thoughtful home for your job search. Track applications, prepare resumes, and keep moving forward.',
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
