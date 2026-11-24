'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { readFrames } from '@/lib/assistant/protocol';

interface Message { id: string; role: 'user' | 'assistant'; content: string }
interface Conversation { id: string; title: string }
export interface AssistantPanelProps { applicationId?: string; onChange?: () => void }

export default function AssistantPanel({ applicationId, onChange }: AssistantPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState('');
  const [configured, setConfigured] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    abort.current?.abort(); historyAbort.current?.abort();
    setBusy(false); setMessages([]); setConversationId(''); setError(''); setLoading(true);
    fetch(`/api/assistant?${new URLSearchParams(applicationId ? { applicationId } : {})}`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load conversations.'); return data; })
      .then((data) => { setConversations(data.conversations); setConfigured(data.configured); })
      .catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); abort.current?.abort(); historyAbort.current?.abort(); };
  }, [applicationId]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, activity]);

  async function selectConversation(id: string) {
    if (busy) return;
    historyAbort.current?.abort();
    const controller = new AbortController(); historyAbort.current = controller;
    setConversationId(id); setError(''); setMessages([]);
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/assistant?${new URLSearchParams({ conversationId: id })}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load this conversation.');
      if (!controller.signal.aborted) setMessages(data.messages);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load this conversation.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || !configured) return;
    const requestGeneration = generation.current;
    const assistantId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    setInput(''); setError(''); setBusy(true); setActivity('Thinking…');
    setMessages((previous) => [...previous, { id: requestId, role: 'user', content: text }, { id: assistantId, role: 'assistant', content: '' }]);
    const controller = new AbortController(); abort.current = controller;
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ message: text, conversationId: conversationId || undefined, applicationId, requestId }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'The assistant could not respond.'); }
      if (!response.body) throw new Error('The response stream was unavailable.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ''; let finished = false;
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const frames = readFrames(pending); pending = frames.remainder;
        if (requestGeneration !== generation.current) { await reader.cancel(); return; }
        for (const frame of frames.events) {
          if (frame.type === 'conversation') { setConversationId(frame.conversationId); setConversations((items) => items.some((item) => item.id === frame.conversationId) ? items : [{ id: frame.conversationId, title: text.slice(0, 70) }, ...items]); }
          if (frame.type === 'delta') { setActivity(''); setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, content: item.content + frame.text } : item)); }
          if (frame.type === 'tool') { setActivity(`${frame.label}${frame.status === 'running' ? '…' : frame.status === 'failed' ? ' could not finish' : ' ✓'}`); if (frame.status === 'completed') { onChange?.(); window.dispatchEvent(new Event('tracker:refresh')); } }
          if (frame.type === 'error') throw new Error(frame.message);
          if (frame.type === 'done') { finished = true; setActivity(''); }
        }
        if (done) break;
      }
      if (!finished) throw new Error('The response was interrupted. Your saved conversation is still available.');
    } catch (cause) {
      if (requestGeneration === generation.current) setError(cause instanceof Error && cause.name === 'AbortError' ? 'Stopped. Any completed changes have been saved.' : cause instanceof Error ? cause.message : 'The assistant could not respond.');
    } finally { if (requestGeneration === generation.current) { setBusy(false); setActivity(''); } }
  }

  return <section className="flex min-h-[440px] flex-col rounded-2xl border border-slate-200 bg-white" aria-label="Application assistant">
    <header className="border-b border-slate-100 p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-teal-700">Your search, together</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Application assistant</h2></div><span aria-hidden="true" className="text-2xl text-teal-700">✦</span></div>
      <label className="sr-only" htmlFor={`assistant-history-${applicationId || 'all'}`}>Conversation</label>
      <select id={`assistant-history-${applicationId || 'all'}`} value={conversationId} disabled={busy || loading} onChange={(event) => void selectConversation(event.target.value)} className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><option value="">New conversation</option>{conversations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
    </header>
    <div className="max-h-[480px] min-h-[220px] flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite" aria-busy={busy || loading}>
      {loading && <p className="text-sm text-slate-500">Loading conversations…</p>}
      {!loading && !configured && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">The website assistant is not configured yet. You can keep organizing applications and preparing your resumes.<div className="mt-3 flex gap-4"><Link href="/applications" className="font-semibold underline">Applications</Link><Link href="/resumes" className="font-semibold underline">Resume library</Link></div></div>}
      {!loading && configured && messages.length === 0 && <div><p className="text-sm leading-6 text-slate-600">Plan your next step, prepare for an interview, or update your applications in a conversation.</p><div className="mt-4 flex flex-wrap gap-2">{(applicationId ? ['Help me prepare for an interview', 'Suggest my next step'] : ['What should I follow up on?', 'Show my active applications']).map((prompt) => <button type="button" key={prompt} onClick={() => setInput(prompt)} className="rounded-full border border-teal-100 bg-teal-50 px-3 py-2 text-left text-xs font-medium text-teal-900">{prompt}</button>)}</div></div>}
      {messages.map((message) => <article key={message.id} className={message.role === 'user' ? 'ml-7 rounded-xl bg-teal-50 px-4 py-3' : 'mr-3 py-1'}><p className="mb-1 text-xs font-semibold text-slate-500">{message.role === 'user' ? 'You' : 'Assistant'}</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{message.content || (busy ? '…' : '')}</p></article>)}
      {activity && <p className="text-xs text-teal-700" role="status">{activity}</p>}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}<div ref={end} />
    </div>
    <form onSubmit={send} className="border-t border-slate-100 p-4"><label htmlFor={`assistant-input-${applicationId || 'all'}`} className="sr-only">Message the assistant</label><textarea id={`assistant-input-${applicationId || 'all'}`} value={input} onChange={(event) => setInput(event.target.value)} maxLength={8000} rows={3} disabled={busy || !configured} placeholder={applicationId ? 'Ask about this application…' : 'What would you like to work on?'} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-60" /><div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Changes appear in your tracker.</p>{busy ? <button type="button" onClick={() => abort.current?.abort()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Stop</button> : <button disabled={!input.trim() || !configured || loading} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Send</button>}</div></form>
  </section>;
}

export { AssistantPanel };
