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
        
        {/* Error handling for unhandled rejections */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.onerror = function(message, source, lineno, colno, error) {
                console.error('Global error:', { message, source, lineno, colno, error });
                // You could send this to your error tracking service
              };
              
              window.onunhandledrejection = function(event) {
                console.error('Unhandled promise rejection:', event.reason);
                // You could send this to your error tracking service
              };
            `,
          }}
        />
      </body>
    </html>
  );
}
