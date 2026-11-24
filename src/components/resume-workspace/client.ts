export async function resumeRequest<T>(action: string, input: unknown): Promise<T> {
  const response = await fetch('/api/resumes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, input }) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'This change could not be saved. Try again.');
  return data as T;
}

export async function fetchResumeWorkspace(applicationId: string) {
  const response = await fetch(`/api/resumes${applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : ''}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Saved resumes could not be loaded.');
  return data as import('@/lib/resume-workspace/types').ResumeWorkspaceData;
}

export async function fetchResumeLibrary() {
  const response = await fetch('/api/resumes', { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Saved resumes could not be loaded.');
  return data as import('@/lib/resume-workspace/types').ResumeWorkspaceSummaryData;
}

export function readableDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
