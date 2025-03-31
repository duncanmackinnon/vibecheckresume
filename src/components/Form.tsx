'use client';

import { useState, FormEvent } from 'react';

export default function Form() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !text) return;

    setBusy(true);
    const data = new FormData();
    data.append('resume', file);
    data.append('jobDescription', new Blob([text]));

    fetch('/api/analyze', { method: 'POST', body: data })
      .catch(console.error)
      .finally(() => setBusy(false));
  }

  return (
    <form onSubmit={submit} className="bg-white p-6 rounded-lg shadow-sm">
      <div className="mb-4">
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
          disabled={busy}
          className="w-full"
        />
      </div>
      <div className="mb-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={busy}
          placeholder="Enter job description"
          rows={6}
          className="w-full p-2 border rounded"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !file || !text}
        className="w-full p-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
      >
        {busy ? 'Analyzing...' : 'Analyze'}
      </button>
    </form>
  );
}