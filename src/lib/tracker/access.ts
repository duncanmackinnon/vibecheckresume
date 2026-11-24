/** Only local workspace destinations are accepted after authentication. */
export function safeReturnTo(value: string | null | undefined, fallback = '/onboarding'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n\0]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://vibecheck.invalid');
    if (url.origin !== 'https://vibecheck.invalid' || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}
export function assertEmailVerified(claims: {email_verified?: unknown}) {
  if (claims.email_verified === false) return false;
  return true;
}
