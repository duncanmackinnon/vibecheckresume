import './globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const metadata = {
  title: 'VibeCheck: Resume builder and job portal',
  description: 'Build or tailor your resume, then create an account to save applications, track tasks, and discover matching roles.',
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
