'use client';

import React from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';

interface MatchedSkill {
  name: string;
  match: boolean;
}

interface Analysis {
  score: number;
  matchedSkills: MatchedSkill[];
  missingSkills: string[];
  recommendations: {
    improvements: string[];
    strengths: string[];
    skillGaps: string[];
    format: string[];
  };
  detailedAnalysis: string;
}

export default function Page() {
  const [file, setFile] = React.useState<File | null>(null);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<Analysis | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !text.trim()) return;

    setBusy(true);
    setError('');
    setResult(null);

    const data = new FormData();
    data.append('resume', file);
    data.append('jobDescription', new Blob([text]));

    const xhr = new XMLHttpRequest();
    xhr.responseType = 'json';
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = xhr.response;
        if (!data.recommendations || !data.matchedSkills) {
          throw new Error('Invalid analysis result');
        }
        setResult(data);
      } else {
        throw new Error(xhr.response?.error || 'Analysis failed');
      }
    });

    xhr.addEventListener('error', () => {
      setError('Network error occurred');
    });

    xhr.addEventListener('loadend', () => {
      setBusy(false);
      setProgress(0);
    });

    xhr.open('POST', '/api/analyze');
    xhr.send(data);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div key="header" className="text-center space-y-2 animate-fade-in">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Resume Match Analyzer
          </h1>
          <p className="text-gray-600">
            Get instant feedback on how well your resume matches job requirements
          </p>
        </div>

        <form
          key="form"
          onSubmit={onSubmit}
          className="space-y-6 bg-white p-8 rounded-xl shadow-md transition-all hover:shadow-lg"
        >
          <div key="file-container" className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Upload Resume
            </label>
            <input
              key="file"
              type="file"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              accept=".pdf,.doc,.docx"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                e.target.files?.[0] && setFile(e.target.files[0])
              }
              disabled={busy}
            />
          </div>

          <div key="textarea-container" className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Job Description
            </label>
            <textarea
              key="text"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={6}
              placeholder="Paste the job description here..."
              value={text}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setText(e.target.value)
              }
              disabled={busy}
            />
          </div>

          <button
            key="submit"
            type="submit"
            disabled={busy || !file || !text.trim()}
            className="w-full p-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-2"
          >
            {busy && (
              <LoadingSpinner key="spinner" progress={progress} />
            )}
            <span key="label">
              {busy ? 'Analyzing...' : 'Analyze Resume'}
            </span>
          </button>
        </form>

        {error && (
          <div
            key="error"
            className="mt-4 p-4 bg-red-50 text-red-700 rounded"
          >
            {error}
          </div>
        )}

        {result && (
          <div
            key="result"
            className="mt-6 bg-white p-8 rounded-xl shadow-lg space-y-8 animate-fade-in"
          >
            <div key="score" className="text-center">
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                Match Score
              </h2>
              <div
                className={`text-5xl font-bold ${
                  result.score >= 70
                    ? 'text-green-500'
                    : result.score >= 50
                    ? 'text-yellow-500'
                    : 'text-red-500'
                }`}
              >
                {result.score}%
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                <div
                  className={`${
                    result.score >= 70
                      ? 'bg-green-500'
                      : result.score >= 50
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  } h-2.5 rounded-full`}
                  style={{ width: `${result.score}%` }}
                />
              </div>
            </div>

            <div key="matched">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">
                Matched Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.matchedSkills
                  .filter((s) => s.match)
                  .map((s, i) => (
                    <span
                      key={i}
                      className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded-full flex items-center"
                    >
                      <svg
                        className="w-3 h-3 mr-1.5 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {s.name}
                    </span>
                  ))}
              </div>
            </div>

            <div key="missing">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">
                Skills to Improve
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.missingSkills.map((s, i) => (
                  <span
                    key={i}
                    className="bg-red-100 text-red-800 text-sm font-medium px-2.5 py-0.5 rounded-full flex items-center"
                  >
                    <svg
                      className="w-3 h-3 mr-1.5 text-red-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div key="improvements">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">
                Recommended Improvements
              </h3>
              <div className="space-y-3">
                {result.recommendations.improvements.map((s, i) => (
                  <div
                    key={i}
                    className="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-r"
                  >
                    <div className="flex items-start">
                      <svg
                        className="w-5 h-5 text-yellow-500 mr-2 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-gray-700">{s}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div key="format">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">
                Format Suggestions
              </h3>
              <div className="space-y-3">
                {result.recommendations.format.map((s, i) => (
                  <div
                    key={i}
                    className="p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r"
                  >
                    <div className="flex items-start">
                      <svg
                        className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-gray-700">{s}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div key="analysis">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">
                Detailed Analysis
              </h3>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-700 whitespace-pre-wrap">
                  {result.detailedAnalysis}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
